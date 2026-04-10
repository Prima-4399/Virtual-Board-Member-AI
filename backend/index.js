const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
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
const { indexDocument, queryIntelligence, indexMeetingTranscript, generateMinutes, extractActions } = require('./rag_engine');
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

        const minutes = await generateMinutes(fullText);

        const { error: updErr } = await supabase.from('meetings').update({ minutes }).eq('id', meeting.id);
        if (updErr) throw new Error('Database update failed (check if "minutes" column exists): ' + updErr.message);

        res.json({ minutes });
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

        const actions = await extractActions(fullText);

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
