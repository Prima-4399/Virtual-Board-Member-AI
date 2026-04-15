const express = require('express');
const axios = require('axios');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config({ override: true });

const app = express();

// -- EMAIL SETUP --
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


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
const { indexDocument, queryIntelligence, indexMeetingTranscript, generateMinutes, extractActions, generateTitle, extractTrendingTopics } = require('./rag_engine');
const { resolveParticipants, persistAttendees } = require('./participant_resolver');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const upload = multer({ dest: 'uploads/' });

// -- GOOGLE CALENDAR CONFIG --
const googleConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirect: process.env.GOOGLE_REDIRECT_URI,
};

function createConnection() {
    return new google.auth.OAuth2(
        googleConfig.clientId,
        googleConfig.clientSecret,
        googleConfig.redirect
    );
}

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email'
];


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
                recall_bot_id: botId,
                bot_join_status: 'joined'
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
        const { organization_id, userId } = req.body; // Expect userId to check role
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Check if userId is provided and not intern
        if (userId) {
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (userProfile?.role === 'intern') {
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(403).json({ error: 'Permission denied: Interns cannot upload documents.' });
            }
        }

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

// Delete Meeting
app.delete('/api/meetings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Delete associated documents/transcripts from RAG (this will also delete chunks if cascade is set)
        await supabase.from('documents').delete().eq('meeting_id', id);

        // 2. Delete attendee records
        await supabase.from('meeting_attendees').delete().eq('meeting_id', id);
        
        // 3. Delete the meeting record
        const { error } = await supabase
            .from('meetings')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Meeting and associated records deleted successfully' });
    } catch (error) {
        console.error('[DELETE meeting ERROR]', error);
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
        const { board_role, display_name, role, adminId } = req.body;

        // 0. Check permissions (Only CEO can change roles)
        if (role || board_role) {
            const { data: admin } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', adminId)
                .single();

            if (!admin || admin.role !== 'ceo') {
                return res.status(403).json({ error: 'Permission denied: Only CEOs can change member roles.' });
            }
        }

        if (board_role && !VALID_BOARD_ROLES.includes(board_role)) {
            return res.status(400).json({ error: `Invalid board_role. Must be one of: ${VALID_BOARD_ROLES.join(', ')}` });
        }

        const updates = {};
        if (board_role) updates.board_role = board_role;
        if (role) updates.role = role;
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

// Revoke organization membership
app.delete('/api/organizations/:orgId/members/:memberId', async (req, res) => {
    try {
        const { orgId, memberId } = req.params;

        // Reset organization_id and role for the user
        const { data, error } = await supabase
            .from('profiles')
            .update({ 
                organization_id: null, 
                role: 'member', 
                board_role: 'director' 
            })
            .eq('id', memberId)
            .eq('organization_id', orgId) // Securely ensure they are in this org
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Executive seat revoked successfully', profile: data });
    } catch (error) {
        console.error('[REVOKE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Organization
app.delete('/api/organizations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        // 1. Verify user is CEO of the organization
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, organization_id')
            .eq('id', userId)
            .single();

        if (!profile || profile.role !== 'ceo' || profile.organization_id !== id) {
            return res.status(403).json({ error: 'Permission denied: Only the CEO can delete the company.' });
        }

        // 2. Clear out all associations 
        // a. Delete meetings
        await supabase.from('meetings').delete().eq('organization_id', id);
        // b. Delete documents
        await supabase.from('documents').delete().eq('organization_id', id);
        // c. Delete document_chunks
        await supabase.from('document_chunks').delete().eq('organization_id', id);
        // d. Delete invitations
        await supabase.from('invitations').delete().eq('organization_id', id);
        
        // 3. Reset all member profiles
        await supabase.from('profiles')
            .update({ organization_id: null, role: 'developer', board_role: 'director' })
            .eq('organization_id', id);

        // 4. Delete the organization row itself
        const { error: deleteError } = await supabase
            .from('organizations')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ success: true, message: 'Company deleted successfully' });
    } catch (error) {
        console.error('[DELETE ORG ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Dashboard Stats
app.get('/api/organizations/:orgId/dashboard-stats', async (req, res) => {
    try {
        const { orgId } = req.params;

        // 1. Basic Counts
        const [meetingsRes, docsRes, membersRes, chunksRes] = await Promise.all([
            supabase.from('meetings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('documents').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('document_chunks').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)
        ]);

        // 2. Action Item Analytics
        const { data: recentMeetings } = await supabase
            .from('meetings')
            .select('id, title, created_at, actions, transcript, minutes')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(10);

        let totalActions = 0;
        let completedActions = 0;
        const recentActionsList = [];
        const pendingDecisionsList = [];

        recentMeetings?.forEach(m => {
            const actions = typeof m.actions === 'string' ? JSON.parse(m.actions) : m.actions;
            if (Array.isArray(actions)) {
                actions.forEach(a => {
                    totalActions++;
                    if (a.status === 'done' || a.status === 'completed') completedActions++;
                    recentActionsList.push(a);

                    if (a.status !== 'done' && a.status !== 'completed' && a.task) {
                        const t = a.task.toLowerCase();
                        if (t.includes('decide') || t.includes('approve') || t.includes('review') || t.includes('evaluate') || t.includes('determine')) {
                            pendingDecisionsList.push(a);
                        }
                    }
                });
            }
        });

        // 3. Attendance Quorum (Last 5 meetings)
        const { data: attendees } = await supabase
            .from('meeting_attendees')
            .select('matched')
            .in('meeting_id', (await supabase.from('meetings').select('id').eq('organization_id', orgId).limit(5)).data?.map(m => m.id) || []);

        const totalAttendeesPossible = (membersRes.count || 1) * 5;
        const actualAttendees = attendees?.filter(a => a.matched).length || 0;
        const quorum = Math.round((actualAttendees / totalAttendeesPossible) * 100);

        // 4. Trending Topics using Anthropic
        let trending_topics = [];
        try {
            if (recentMeetings && recentMeetings.length > 0) {
                trending_topics = await extractTrendingTopics(recentMeetings);
            }
        } catch (e) {
            console.error('[STATS] Error extracting trending topics:', e.message);
        }

        // 5. Recent Documents (for Pre-read suggestions)
        const { data: recentDocs } = await supabase
            .from('documents')
            .select('id, filename, created_at')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(3);

        res.json({
            meetings_held: meetingsRes.count || 0,
            total_documents: docsRes.count || 0,
            active_members: membersRes.count || 0,
            total_chunks: chunksRes.count || 0,
            completion_rate: totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 100,
            quorum: quorum > 100 ? 100 : quorum,
            total_actions: totalActions,
            recent_actions: recentActionsList.slice(0, 5),
            trending_topics: trending_topics,
            pending_decisions: pendingDecisionsList.slice(0, 5),
            recent_documents: recentDocs || []
        });
    } catch (error) {
        console.error('[STATS ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Moderating Join Requests (New Feature: Moderation Workflow)

// User submits a join request using a code
app.post('/api/organizations/join-request', async (req, res) => {
    try {
        const { userId, joinCode } = req.body;

        // 1. Find Org by code
        const { data: org, error: orgErr } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('join_code', joinCode.toUpperCase())
            .maybeSingle();

        if (orgErr) {
            console.error('[JOIN REQUEST - Org lookup]', orgErr);
            return res.status(500).json({ error: 'Failed to verify organization' });
        }

        if (!org) return res.status(404).json({ error: 'Invite code invalid.' });

        // 2. Create Request
        const { data, error } = await supabase
            .from('join_requests')
            .upsert({
                user_id: userId,
                organization_id: org.id,
                status: 'pending'
            }, { onConflict: 'user_id, organization_id' })
            .select()
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, organizationName: org.name });
    } catch (error) {
        console.error('[JOIN REQUEST ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// List pending requests for an org (Admin only)
app.get('/api/organizations/:id/join-requests', async (req, res) => {
    try {
        const { id } = req.params;
        const { adminId } = req.query;

        console.log(`[JOIN REQUESTS] Fetching for org: ${id}, adminId: ${adminId}`);

        // Skip admin verification if adminId not provided - just return empty
        if (!adminId) {
            console.log('[JOIN REQUESTS] No adminId provided, returning empty array');
            return res.json([]);
        }

        // Try to verify admin, but don't fail if it errors
        try {
            const { data: admin, error: adminErr } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', adminId)
                .maybeSingle();

            if (adminErr) {
                console.warn('[JOIN REQUESTS] Admin verification error (non-blocking):', adminErr);
            }

            if (admin && !['ceo', 'manager'].includes(admin.role)) {
                console.warn(`[JOIN REQUESTS] User ${adminId} does not have admin role`);
                return res.status(403).json({ error: 'Permission denied.' });
            }
        } catch (adminErr) {
            console.warn('[JOIN REQUESTS] Admin verification failed (continuing anyway):', adminErr);
            // Continue anyway - don't block on this
        }

        // Fetch join requests
        console.log('[JOIN REQUESTS] Fetching join requests...');
        const { data: requests, error: requestsErr } = await supabase
            .from('join_requests')
            .select('id, user_id, organization_id, status, created_at')
            .eq('organization_id', id)
            .eq('status', 'pending');

        if (requestsErr) {
            console.error('[JOIN REQUESTS ERROR - Fetch requests]', requestsErr);
            throw requestsErr;
        }

        console.log(`[JOIN REQUESTS] Found ${requests?.length || 0} pending requests`);

        // If no requests, return early
        if (!requests || requests.length === 0) {
            return res.json([]);
        }

        // Get user profiles for each request
        try {
            const userIds = requests.map(r => r.user_id);
            console.log(`[JOIN REQUESTS] Fetching profiles for users: ${userIds.join(', ')}`);
            
            const { data: profiles, error: profilesErr } = await supabase
                .from('profiles')
                .select('id, email, display_name')
                .in('id', userIds);

            if (profilesErr) {
                console.error('[JOIN REQUESTS ERROR - Fetch profiles]', profilesErr);
                // If profiles fetch fails, return requests without profile data
                return res.json(requests);
            }

            // Merge profiles with requests
            const profileMap = {};
            profiles?.forEach(p => {
                profileMap[p.id] = p;
            });

            const enrichedRequests = requests.map(r => ({
                ...r,
                profiles: profileMap[r.user_id] || null
            }));

            console.log(`[JOIN REQUESTS] Returning ${enrichedRequests.length} enriched requests`);
            return res.json(enrichedRequests);
        } catch (profileErr) {
            console.warn('[JOIN REQUESTS] Profile enrichment failed, returning bare requests:', profileErr);
            return res.json(requests);
        }
    } catch (error) {
        console.error('[JOIN REQUESTS ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Moderate request
app.post('/api/organizations/:id/join-requests/:requestId/moderate', async (req, res) => {
    try {
        const { id, requestId } = req.params;
        const { adminId, action } = req.body; // action: 'approve' | 'reject'

        console.log(`[MODERATE REQUEST] orgId: ${id}, requestId: ${requestId}, adminId: ${adminId}, action: ${action}`);

        // 1. Verify admin
        const { data: admin, error: adminErr } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', adminId)
            .maybeSingle();

        if (adminErr) {
            console.error('[MODERATE REQUEST - Admin lookup]', adminErr);
            return res.status(500).json({ error: 'Failed to verify admin' });
        }

        if (!admin || !['ceo', 'manager'].includes(admin.role)) {
            console.warn(`[MODERATE REQUEST] User ${adminId} lacks permission`);
            return res.status(403).json({ error: 'Permission denied.' });
        }

        const { data: request, error: reqErr } = await supabase
            .from('join_requests')
            .select('*')
            .eq('id', requestId)
            .maybeSingle();

        if (reqErr) {
            console.error('[MODERATE REQUEST - Request lookup]', reqErr);
            return res.status(500).json({ error: 'Failed to fetch request' });
        }

        if (!request) {
            console.warn(`[MODERATE REQUEST] Request ${requestId} not found`);
            return res.status(404).json({ error: 'Request not found.' });
        }

        console.log(`[MODERATE REQUEST] Processing action: ${action}`);

        if (action === 'approve') {
            // Update request
            const { error: updateErr1 } = await supabase
                .from('join_requests')
                .update({ status: 'approved' })
                .eq('id', requestId);

            if (updateErr1) {
                console.error('[MODERATE REQUEST - Update request]', updateErr1);
                throw updateErr1;
            }

            // Link user to org
            const { error: updateErr2 } = await supabase
                .from('profiles')
                .update({ 
                    organization_id: id,
                    role: 'developer'
                })
                .eq('id', request.user_id);

            if (updateErr2) {
                console.error('[MODERATE REQUEST - Update profile]', updateErr2);
                throw updateErr2;
            }

            console.log(`[MODERATE REQUEST] Approved user ${request.user_id} for org ${id}`);
        } else if (action === 'reject') {
            const { error: updateErr } = await supabase
                .from('join_requests')
                .update({ status: 'rejected' })
                .eq('id', requestId);

            if (updateErr) {
                console.error('[MODERATE REQUEST - Reject]', updateErr);
                throw updateErr;
            }

            console.log(`[MODERATE REQUEST] Rejected user ${request.user_id} for org ${id}`);
        } else {
            return res.status(400).json({ error: 'Invalid action. Must be approve or reject.' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[MODERATE REQUEST ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's own request status
app.get('/api/profiles/:userId/request-status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from('join_requests')
            .select('*, organizations(name)')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (error) throw error;
        res.json(data);
    } catch (error) {
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

// Get organization members (emails and display names)
app.get('/api/organizations/:orgId/members', async (req, res) => {
    try {
        const { orgId } = req.params;
        const { data, error } = await supabase
            .from('profiles')
            .select('email, display_name, id')
            .eq('organization_id', orgId);

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -- HEALTH CHECK --
// -- GOOGLE AUTH FLOW --

// Get OAuth URL
app.get('/api/auth/google/url', (req, res) => {
    const auth = createConnection();
    const url = auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPES,
    });
    res.json({ url });
});

// OAuth Callback
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query; // State can be user_id from frontend
        const auth = createConnection();
        const { tokens } = await auth.getToken(code);
        
        // We need user_id to save the token. Frontend should pass it or we use session.
        // For simplicity, let's assume the frontend passes user_id in state or we expect it in header.
        // In a real app, you'd verify the JWT from frontend.
        
        // Extract email to identify user if state is missing
        auth.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        if (tokens.refresh_token) {
            console.log(`[GOOGLE] Saving refresh token for ${email}`);
            const { error } = await supabase
                .from('profiles')
                .update({ 
                    google_refresh_token: tokens.refresh_token,
                    google_connected: true 
                })
                .eq('email', email);

            if (error) throw error;
        }

        // Redirect back to frontend
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/organization?google=connected`);
    } catch (error) {
        console.error('[GOOGLE CALLBACK ERROR]', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/organization?error=google_failed`);
    }
});
// -- CALENDAR SCHEDULING --

app.post('/api/meetings/schedule', async (req, res) => {
    try {
        const { userId, organization_id, title, startTime, endTime, attendees = [], timezone } = req.body;

        // 0. Check permissions (Interns cannot schedule)
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (userProfile?.role === 'intern') {
            return res.status(403).json({ error: 'Permission denied: Interns cannot schedule meetings.' });
        }

        // 1. Get user's refresh token
        const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('google_refresh_token')
            .eq('id', userId)
            .single();

        if (profErr || !profile?.google_refresh_token) {
            return res.status(401).json({ error: 'Google Calendar not connected' });
        }

        // 2. Setup Google Auth
        const auth = createConnection();
        auth.setCredentials({ refresh_token: profile.google_refresh_token });
        // Get creator email for the notification
        const { data: creator } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

        const creatorEmail = creator?.email || 'A team member';

        // 3. Create Event with Google Meet
        const event = {
            summary: title,
            description: `This meeting was created by ${creatorEmail} from your organization via the Virtual Board Member AI Agent. A Google Meet link has been automatically generated and attached to this invite.`,
            start: { 
                dateTime: startTime,
                timeZone: timezone || 'UTC'
            },
            end: { 
                dateTime: endTime,
                timeZone: timezone || 'UTC'
            },
            attendees: attendees.map(email => ({ email })),
            conferenceData: {
                createRequest: {
                    requestId: uuidv4(),
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        const response = await google.calendar({ version: 'v3', auth }).events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
            sendUpdates: 'all'
        });

        const meetLink = response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;

        // 3. Save to our Database
        const { data: newMeeting, error: dbErr } = await supabase
            .from('meetings')
            .insert({
                organization_id,
                title,
                created_at: new Date().toISOString(),
                scheduled_at: startTime,
                recording_url: (response.data.conferenceData?.entryPoints || [])[0]?.uri || null,
                google_event_id: response.data.id,
                initial_attendees: attendees
            })
            .select()
            .single();

        if (dbErr) throw dbErr;
        res.json({ success: true, meeting: newMeeting, meetLink: (response.data.conferenceData?.entryPoints || [])[0]?.uri });
    } catch (error) {
        console.error('[SCHEDULE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/meetings/schedule/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query; // Need userId to get Google token

        // 1. Get meeting to find google_event_id
        const { data: meeting, error: meetingError } = await supabase
            .from('meetings')
            .select('*')
            .eq('id', id)
            .single();

        if (meetingError) throw meetingError;

        // 2. If it has a Google Event ID, delete from Google Calendar
        if (meeting.google_event_id && userId) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('google_refresh_token')
                .eq('id', userId)
                .single();

            if (profile?.google_refresh_token) {
                const auth = createConnection();
                auth.setCredentials({ refresh_token: profile.google_refresh_token });
                const calendar = google.calendar({ version: 'v3', auth });
                
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        eventId: meeting.google_event_id
                    });
                } catch (err) {
                    console.error('Failed to delete from Google:', err.message);
                    // Continue anyway to delete from our DB
                }
            }
        }

        // 3. Delete from our Database
        const { error: deleteError } = await supabase
            .from('meetings')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ success: true });
    } catch (error) {
        console.error('[DELETE SCHEDULED ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});


// -- MEMBER INVITATIONS --

app.post('/api/organizations/invite', async (req, res) => {
    try {
        const { email, organization_id, inviter_id, role = 'developer' } = req.body;

        // 0. Check permissions
        const { data: inviter } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', inviter_id)
            .single();

        if (!inviter || !['ceo', 'manager'].includes(inviter.role)) {
            return res.status(403).json({ error: 'Permission denied: Only CEOs and Managers can send invitations.' });
        }

        // 1. Create Invitation in DB
        const { data: invite, error: inviteErr } = await supabase
            .from('invitations')
            .upsert({
                email,
                organization_id,
                inviter_id,
                role,
                status: 'pending'
            }, {
                onConflict: 'email, organization_id'
            })
            .select()
            .single();

        if (inviteErr) throw inviteErr;

        // 2. Get Organization Name for the email
        const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', organization_id)
            .single();

        const orgName = org?.name || 'an Organization';

        // 3. Generate Invite Link
        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?inviteId=${invite.id}&orgId=${organization_id}&email=${encodeURIComponent(email)}`;

        // 4. Send the Email
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Executive Invitation: Join ${orgName} on Virtual Boardroom`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                    <h2 style="color: #6366f1; font-size: 24px; margin-bottom: 20px;">Boardroom Invitation</h2>
                    <p style="color: #444; font-size: 16px; line-height: 1.6;">
                        You have been invited to join <strong>${orgName}</strong> as an executive member on the Virtual Board Member AI platform.
                    </p>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${inviteLink}" style="background-color: #6366f1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Accept Invitation</a>
                    </div>
                    <p style="color: #888; font-size: 12px; font-style: italic;">
                        This link will allow you to bypass the standard organization join code. Please complete your registration using this email address: <strong>${email}</strong>.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #aaa; font-size: 10px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SENT] To: ${email} | Link: ${inviteLink}`);

        res.json({ success: true, invite });
    } catch (error) {
        console.error('[INVITE ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/organizations/invite/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('invitations')
            .select('*, organizations(name)')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(404).json({ error: 'Invitation not found' });
    }
});

app.post('/api/organizations/claim-invite', async (req, res) => {
    try {
        const { userId, email } = req.body;

        // Find pending invite (case insensitive)
        const { data: invite, error: inviteErr } = await supabase
            .from('invitations')
            .select('*')
            .ilike('email', email)
            .eq('status', 'pending')
            .single();

        if (inviteErr || !invite) {
            return res.status(404).json({ error: 'No pending invitation found' });
        }

        // Self-healing: Ensure profile exists
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingProfile) {
            // Create profile if missing
            await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    email: email,
                    organization_id: invite.organization_id,
                    role: invite.role || 'member'
                });
        } else {
            // Link existing user to organization
            const { error: updateErr } = await supabase
                .from('profiles')
                .update({
                    organization_id: invite.organization_id,
                    role: invite.role || 'member'
                })
                .eq('id', userId);

            if (updateErr) throw updateErr;
        }

        // Mark invite as accepted
        await supabase
            .from('invitations')
            .update({ status: 'accepted' })
            .eq('id', invite.id);

        res.json({ success: true, organization_id: invite.organization_id });
    } catch (error) {
        console.error('[CLAIM ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

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

// --- AUTO-JOIN MEETINGS WORKER ---
// This worker checks for scheduled meetings and automatically joins them
async function autoJoinMeetings() {
    try {
        const now = new Date();
        const lookAhead = new Date(now.getTime() + 5 * 60000); // 5 minutes ahead
        const lookBehind = new Date(now.getTime() - 5 * 60000); // 5 minutes behind (to catch missed ones)

        const { data: meetings, error } = await supabase
            .from('meetings')
            .select('*')
            .is('recall_bot_id', null)
            .neq('bot_join_status', 'joined')
            .not('recording_url', 'is', null) // recording_url stores the Meet link initially
            .gte('scheduled_at', lookBehind.toISOString())
            .lte('scheduled_at', lookAhead.toISOString());

        if (error) {
            console.error('[AUTO-BOT] Error fetching upcoming meetings:', error.message);
            return;
        }

        if (!meetings || meetings.length === 0) return;

        for (const meeting of meetings) {
            console.log(`[AUTO-BOT] 🤖 Bot auto-joining meeting: ${meeting.title} (${meeting.recording_url})`);
            
            try {
                const payload = {
                    meeting_url: meeting.recording_url,
                    recording_config: {
                        transcript: {
                            provider: {
                                recallai_streaming: {
                                    mode: 'prioritize_accuracy',
                                    language_code: 'auto'
                                }
                            }
                        }
                    }
                };

                const response = await recallClient.post('/bot/', payload);
                const botId = response.data.id;

                await supabase.from('meetings').update({
                    recall_bot_id: botId,
                    bot_join_status: 'joined'
                }).eq('id', meeting.id);

                console.log(`[AUTO-BOT] ✅ Successfully joined ${meeting.title}. Bot ID: ${botId}`);
            } catch (botErr) {
                console.error(`[AUTO-BOT] ❌ Failed to join ${meeting.title}:`, botErr.response?.data || botErr.message);
                
                // If it's a 400 with 'meeting_url_invalid', we might want to mark as failed
                await supabase.from('meetings').update({
                    bot_join_status: 'failed'
                }).eq('id', meeting.id);
            }
        }
    } catch (err) {
        console.error('[AUTO-BOT] Worker error:', err.message);
    }
}

// Start the worker immediately and then every 60 seconds
autoJoinMeetings();
setInterval(autoJoinMeetings, 60000);

app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
