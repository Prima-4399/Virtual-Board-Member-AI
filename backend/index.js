const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Recall.ai Backend is running');
});

const RECALL_API_BASE = 'https://us-west-2.recall.ai/api/v1';
const RECALL_API_KEY = process.env.RECALL_API_KEY;

const recallClient = axios.create({
    baseURL: RECALL_API_BASE,
    headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

const multer = require('multer');
const { indexDocument, queryIntelligence, indexMeetingTranscript, generateMinutes, extractActions, generateTitle } = require('./rag_engine');
const { resolveParticipants, persistAttendees } = require('./participant_resolver');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const upload = multer({ dest: 'uploads/' });

// Endpoint to create a bot
app.post('/api/bot', async (req, res) => {
    try {
        const { meeting_url, organization_id, mode = 'prioritize_accuracy' } = req.body;

        if (!meeting_url) {
            return res.status(400).json({ error: 'meeting_url is required' });
        }

        const payload = {
            meeting_url,
            recording_config: {
                transcript: {
                    provider: {
                        recallai_streaming: {
                            mode: mode,
                            language_code: mode === 'prioritize_low_latency' ? 'en' : 'auto'
                        }
                    }
                }
            }
        };

        const response = await recallClient.post('/bot/', payload);
        const botId = response.data.id;

        // IDEMPOTENT: Record meeting intention in Ledger
        if (organization_id) {
            console.log(`[LEDGER] Upserting record for org: ${organization_id} | Bot: ${botId}`);
            const { error: insError } = await supabase.from('meetings').upsert({
                id: uuidv4(),
                title: `Session: ${new Date().toLocaleString()}`,
                organization_id: organization_id,
                recall_bot_id: botId
            }, { onConflict: 'recall_bot_id' });
            
            if (insError) {
                console.error('[LEDGER ERROR] Failed to upsert meeting record:', insError.message);
            }
        }

        res.json(response.data);
    } catch (error) {
        console.error('Full Error Object:', JSON.stringify(error.response?.data, null, 2) || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Internal Server Error' });
    }
});

// Endpoint to make bot leave the call
app.post('/api/bot/:id/leave', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await recallClient.post(`/bot/${id}/leave_call/`);
        res.json(response.data);
    } catch (error) {
        console.error('Error leaving call:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Internal Server Error' });
    }
});

// Endpoint to get bot details
app.get('/api/bot/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await recallClient.get(`/bot/${id}/`);
        const botData = response.data;

        // Robust status detection
        const currentStatus = botData.status ||
            (botData.status_changes && botData.status_changes.length > 0 ?
                botData.status_changes[botData.status_changes.length - 1].code :
                'unknown');

        res.json({ ...botData, status: currentStatus });
    } catch (error) {
        console.error('Error retrieving bot:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Internal Server Error' });
    }
});

// Endpoint to fetch transcript
app.get('/api/bot/:id/transcript', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get bot details
        const botResponse = await recallClient.get(`/bot/${id}/`);
        const botData = botResponse.data;

        // 2. Look for transcripts
        const recordings = botData.recordings || [];
        let transcriptInfo = null;
        let recordingUrl = null;

        for (const rec of recordings) {
            if (rec.media_shortcuts?.transcript?.data?.download_url) {
                transcriptInfo = rec.media_shortcuts.transcript;
            }
            if (rec.media_shortcuts?.video?.data?.download_url) {
                recordingUrl = rec.media_shortcuts.video.data.download_url;
            }
        }

        if (!transcriptInfo) {
            return res.json([]);
        }

        // 3. Download the actual transcript
        const transcriptResponse = await axios.get(transcriptInfo.data.download_url);
        const transcriptSegments = transcriptResponse.data;

        // 4. Persistence & Ledger Logic
        const fullTranscriptText = transcriptSegments
            .map(s => `[${s.participant.name}]: ${s.words.map(w => w.text).join(' ')}`)
            .join('\n');

        // Check if we already have this meeting in Supabase
        const { data: existingMeeting, error: selError } = await supabase
            .from('meetings')
            .select('*')
            .eq('recall_bot_id', id)
            .maybeSingle();

        if (existingMeeting) {
            const currentTranscriptLength = existingMeeting.transcript ? existingMeeting.transcript.length : 0;
            const newTranscriptText = JSON.stringify(transcriptSegments);

            // Update if transcript has grown
            if (newTranscriptText.length > currentTranscriptLength) {
                console.log(`[SYNC] Updating meeting: ${existingMeeting.id} for bot ${id}`);

                const { error: updError } = await supabase
                    .from('meetings')
                    .update({
                        transcript: newTranscriptText,
                        recording_url: recordingUrl || null
                    })
                    .eq('id', existingMeeting.id);

                if (!updError) {
                    // Index in RAG for Institutional Memory
                    await indexMeetingTranscript(
                        fullTranscriptText,
                        existingMeeting.title,
                        existingMeeting.organization_id,
                        existingMeeting.id
                    );

                    // Resolve participants and persist attendee records
                    try {
                        const attendees = await resolveParticipants(transcriptSegments, existingMeeting.organization_id);
                        await persistAttendees(existingMeeting.id, attendees);
                        console.log(`[RESOLVER] Resolved ${attendees.filter(a => a.matched).length}/${attendees.length} participants for meeting ${existingMeeting.id}`);
                    } catch (resolveErr) {
                        console.error('[RESOLVER] Participant resolution failed:', resolveErr.message);
                    }
                }
            }
        }

        res.json(transcriptSegments);
    } catch (error) {
        console.error('Error fetching transcript:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Internal Server Error' });
    }
});

const fs = require('fs');

// Upload and Index Document
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
    try {
        const { organization_id } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        console.log(`[UPLOAD] Processing: ${req.file.originalname} for org: ${organization_id}`);
        const docId = await indexDocument(req.file.path, req.file.originalname, organization_id);

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ message: 'Document indexed successfully', id: docId });
    } catch (error) {
        console.error('[UPLOAD ERROR]', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

// Query Historical Memory
app.post('/api/documents/query', async (req, res) => {
    try {
        const { query, organization_id } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const result = await queryIntelligence(query, organization_id);
        res.json(result);
    } catch (error) {
        console.error('RAG Query Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List Documents
app.get('/api/documents', async (req, res) => {
    try {
        const { organization_id } = req.query;
        let query = supabase
            .from('documents')
            .select('*')
            .order('created_at', { ascending: false });

        if (organization_id) {
            query = query.eq('organization_id', organization_id);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Document
app.delete('/api/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Document and memory chunks deleted successfully' });
    } catch (error) {
        console.error('[DELETE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate Automated Minutes
app.post('/api/bot/:id/minutes', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: meeting, error: getErr } = await supabase.from('meetings').select('*').eq('recall_bot_id', id).maybeSingle();
        
        if (getErr) throw new Error('Database select failed: ' + getErr.message);
        if (!meeting) return res.status(404).json({ error: 'Meeting ID ' + id + ' not found in Database' });
        if (!meeting.transcript) return res.status(404).json({ error: 'No transcript recorded yet for this session' });

        let transcriptData;
        try {
            transcriptData = typeof meeting.transcript === 'string' ? JSON.parse(meeting.transcript) : meeting.transcript;
            if (!Array.isArray(transcriptData)) throw new Error('Transcript format invalid');
        } catch (pe) {
            throw new Error('Transcript parsing failed: ' + pe.message);
        }

        const fullText = transcriptData.map((s) => {
            const name = s.participant?.name || 'Unknown';
            const words = s.words && Array.isArray(s.words) ? s.words.map((w) => w.text).join(' ') : (s.text || '');
            return `[${name}]: ${words}`;
        }).join('\n');

        if (!fullText.trim()) throw new Error('Transcript text is empty');

        // Resolve participants for role-aware minutes
        let attendees = [];
        try {
            attendees = await resolveParticipants(transcriptData, meeting.organization_id);
        } catch (resolveErr) {
            console.warn('[MINUTES] Participant resolution failed, generating without roles:', resolveErr.message);
        }

        const minutes = await generateMinutes(fullText, attendees);

        // Generate smart title from minutes
        let smartTitle;
        try {
            smartTitle = await generateTitle(minutes, meeting.created_at);
        } catch (titleErr) {
            console.warn('[TITLE] Title generation failed, keeping existing title:', titleErr.message);
            smartTitle = meeting.title;
        }

        const { error: updErr } = await supabase.from('meetings').update({ minutes, title: smartTitle }).eq('id', meeting.id);
        if (updErr) throw new Error('Database update failed (check if "minutes" column exists): ' + updErr.message);

        res.json({ minutes, title: smartTitle });
    } catch (error) {
        console.error('[MINUTES ERROR]', error);
        res.status(500).json({ error: error.message, detail: 'Ensure you ran the SQL migration to add the "minutes" column.' });
    }
});

// Update Minutes (Manual Edit)
app.patch('/api/meetings/:id/minutes', async (req, res) => {
    try {
        const { id } = req.params;
        const { minutes } = req.body;
        
        const { error } = await supabase.from('meetings').update({ minutes }).eq('id', id);
        if (error) throw error;

        res.json({ message: 'Minutes updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extract Action Items
app.post('/api/bot/:id/actions', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: meeting } = await supabase.from('meetings').select('*').eq('recall_bot_id', id).maybeSingle();
        
        if (!meeting || !meeting.transcript) {
            return res.status(404).json({ error: 'Meeting or transcript not found' });
        }

        const transcriptData = typeof meeting.transcript === 'string' ? JSON.parse(meeting.transcript) : meeting.transcript;
        const fullText = transcriptData.map((s) => {
            const name = s.participant?.name || 'Unknown';
            const words = s.words && Array.isArray(s.words) ? s.words.map((w) => w.text).join(' ') : (s.text || '');
            return `[${name}]: ${words}`;
        }).join('\n');

        // Resolve participants for role-aware action extraction
        let attendees = [];
        try {
            attendees = await resolveParticipants(transcriptData, meeting.organization_id);
        } catch (resolveErr) {
            console.warn('[ACTIONS] Participant resolution failed, extracting without roles:', resolveErr.message);
        }

        const actions = await extractActions(fullText, attendees);

        await supabase.from('meetings').update({ actions }).eq('id', meeting.id);

        res.json({ actions });
    } catch (error) {
        console.error('[ACTIONS ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Update Actions (Status Toggle)
app.patch('/api/meetings/:id/actions', async (req, res) => {
    try {
        const { id } = req.params;
        const { actions } = req.body;
        const { error } = await supabase.from('meetings').update({ actions }).eq('id', id);
        if (error) throw error;
        res.json({ message: 'Actions updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -- BOARD ROLE MANAGEMENT --

const VALID_BOARD_ROLES = ['board_chair', 'director', 'company_secretary', 'legal_compliance', 'ceo_exec'];

// Assign board role and display name
app.patch('/api/profiles/:id/board-role', async (req, res) => {
    try {
        const { id } = req.params;
        const { board_role, display_name } = req.body;

        if (board_role && !VALID_BOARD_ROLES.includes(board_role)) {
            return res.status(400).json({ error: `Invalid board_role. Must be one of: ${VALID_BOARD_ROLES.join(', ')}` });
        }

        const updates = {};
        if (board_role) updates.board_role = board_role;
        if (display_name !== undefined) updates.display_name = display_name;

        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('[BOARD ROLE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Get meeting attendees
app.get('/api/meetings/:id/attendees', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('meeting_attendees')
            .select('*')
            .eq('meeting_id', id)
            .order('speaking_segments', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Re-resolve participants for a meeting (after display_name updates)
app.post('/api/meetings/:id/resolve-participants', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: meeting, error: mErr } = await supabase
            .from('meetings')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (mErr) throw mErr;
        if (!meeting || !meeting.transcript) {
            return res.status(404).json({ error: 'Meeting or transcript not found' });
        }

        const transcriptData = typeof meeting.transcript === 'string'
            ? JSON.parse(meeting.transcript)
            : meeting.transcript;

        const attendees = await resolveParticipants(transcriptData, meeting.organization_id);
        const summary = await persistAttendees(meeting.id, attendees);

        res.json({ attendees, summary });
    } catch (error) {
        console.error('[RESOLVE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// -- HEALTH CHECK --
app.get('/api/documents/health', async (req, res) => {
    try {
        const { count: docCount, error: docError } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true });

        const { count: chunkCount, error: chunkError } = await supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true });

        res.json({
            status: 'online',
            indexed_documents: docCount || 0,
            memory_chunks: chunkCount || 0,
            db_errors: { docError, chunkError }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
