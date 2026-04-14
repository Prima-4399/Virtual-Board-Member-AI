const { Anthropic } = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { pipeline } = require('@xenova/transformers');
const pdf = require('pdf-parse');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);



let embedder;

async function getEmbedder() {
    if (!embedder) {
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embedder;
}

async function extractText(filePath) {
    const dataBuffer = fs.readFileSync(filePath);

    // Support both classic and newer versions of pdf-parse
    const pdfExtractor = (typeof pdf === 'function') ? pdf : (pdf.default || pdf.pdf);

    if (typeof pdfExtractor !== 'function') {
        console.error('[RAG] PDF extractor is not a function! Keys available in module:', Object.keys(pdf));
        throw new Error('PDF library configuration mismatch. Check package.json version.');
    }

    const data = await pdfExtractor(dataBuffer);
    return data.text;
}

function chunkText(text, size = 1000, overlap = 200) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size - overlap) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

async function indexDocument(filePath, fileName, orgId) {
    try {
        console.log(`[RAG] Indexing ${fileName}...`);
        const fullText = await extractText(filePath);
        console.log(`[RAG] Text extracted: ${fullText.length} chars`);

        const chunks = chunkText(fullText);
        console.log(`[RAG] Created ${chunks.length} chunks`);

        const docId = uuidv4();

        // Create Document Entry
        const { error: docError } = await supabase
            .from('documents')
            .insert({ 
                id: docId, 
                filename: fileName, 
                file_type: 'pdf', 
                organization_id: orgId 
            });

        if (docError) {
            console.error('[RAG] Supabase Error (documents):', docError);
            throw docError;
        }

        const embed = await getEmbedder();
        console.log('[RAG] Loaded embedder');

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`[RAG] Processing chunk ${i + 1}/${chunks.length}...`);

            const output = await embed(chunk, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);

            const { error: chunkError } = await supabase.from('document_chunks').insert({
                document_id: docId,
                content: chunk,
                embedding: embedding,
                organization_id: orgId,
                metadata: { page: i + 1, fileName: fileName }
            });

            if (chunkError) {
                console.error(`[RAG] FAILED to save chunk ${i + 1}:`, chunkError);
                throw chunkError;
            }
        }

        console.log(`[RAG] COMPLETED indexing for ${fileName}. ${chunks.length} chunks saved.`);
        return docId;
    } catch (err) {
        console.error('[RAG] Critical Error during indexing:', err);
        throw err;
    }
}

async function indexMeetingTranscript(transcriptContent, meetingTitle, orgId, meetingId) {
    try {
        console.log(`[RAG] Indexing transcript for ${meetingTitle}...`);
        const chunks = chunkText(transcriptContent);
        
        const docId = uuidv4();
        const { error: docError } = await supabase
            .from('documents')
            .insert({ 
                id: docId, 
                filename: `Meeting: ${meetingTitle}`, 
                file_type: 'transcript',
                organization_id: orgId,
                meeting_id: meetingId
            });

        if (docError) throw docError;

        const embed = await getEmbedder();
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const output = await embed(chunk, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);

            const { error: chunkError } = await supabase.from('document_chunks').insert({
                document_id: docId,
                content: chunk,
                embedding: embedding,
                organization_id: orgId,
                metadata: { type: 'meeting', title: meetingTitle }
            });
            if (chunkError) throw chunkError;
        }
        console.log(`[RAG] Successfully indexed transcript for ${meetingTitle}`);
        return docId;
    } catch (err) {
        console.error('[RAG] Meeting indexing failed:', err);
    }
}

async function searchMemory(query, orgId, topK = 5) {
    const embed = await getEmbedder();
    const output = await embed(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data);

    // Call Supabase RPC function for vector similarity
    const { data, error } = await supabase.rpc('match_boardroom_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: topK,
        p_organization_id: orgId
    });

    if (error) {
        console.error('[RAG] DB Search Error:', error);
        throw error;
    }

    return data;
}

async function queryIntelligence(userQuery, orgId) {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('[RAG] ANTHROPIC_API_KEY is missing from .env!');
        throw new Error('API Key Missing');
    }

    const key = process.env.ANTHROPIC_API_KEY.trim();
    const anthropic = new Anthropic({
        apiKey: key,
    });

    console.log(`[RAG] Searching memory for query: "${userQuery}" in org: ${orgId}`);
    
    // 1. Metadata Check: See if query mentions a specific file
    const { data: namedDocs } = await supabase
        .from('documents')
        .select('id, filename')
        .eq('organization_id', orgId);
    
    let matchedDocId = null;
    let explicitFileMention = "";
    if (namedDocs) {
        const queryLower = userQuery.toLowerCase();
        const match = namedDocs.find(d => queryLower.includes(d.filename.toLowerCase()));
        if (match) {
            matchedDocId = match.id;
            explicitFileMention = `The user is specifically asking about the document: ${match.filename}.\n`;
        }
    }

    // 2. Semantic Search
    const embed = await getEmbedder();
    const output = await embed(userQuery, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data);

    const { data: contextResults, error } = await supabase.rpc('match_boardroom_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.15,
        match_count: 5,
        p_organization_id: orgId
    });

    if (error) console.error('[RAG] RAG Search Error:', error);

    // 3. Prioritize chunks from the named document
    let filteredContext = contextResults || [];
    if (matchedDocId) {
        // Boost chunks from the matched document
        const matchedChunks = filteredContext.filter(r => r.document_id === matchedDocId);
        if (matchedChunks.length === 0) {
            // Force fetch if vector search missed it
            const { data: manualChunks } = await supabase
                .from('document_chunks')
                .select('content, metadata')
                .eq('document_id', matchedDocId)
                .limit(5);
            filteredContext = manualChunks?.map(c => ({ ...c, similarity: 1.0 })) || [];
        } else {
            filteredContext = matchedChunks;
        }
    }

    const contextText = filteredContext?.map(r => r.content).join('\n\n---\n\n') || "";

    const prompt = `
You are the Virtual Board Member AI. Your goal is to provide accurate advisor reasoning based ONCE AND ONLY ON the institutional memory provided.

${explicitFileMention}
Institutional Memory:
${contextText || "NO RELEVANT DATA FOUND IN VAULT."}

CRITICAL RULES:
1. IF NO RELEVANT DATA IS FOUND, state: "I found the document reference, but I have no indexed data on that topic in the vault."
2. NEVER make up facts or "guess" contents.
3. NEVER USE ASTERISKS (*) or UNDERSCORES (_).
4. USE <mark>TOKEN</mark> for numeric values and <u>TOKEN</u> for dates/locations.
5. MAX LENGTH: 150 words.

User Query: ${userQuery}

RESPONSE STRUCTURE:
[One sentence overview]
- [Category]: <u>[Date]</u> | <mark>[Value]</mark> | [Reason]
`;

    try {
        const anthropic = new Anthropic({ apiKey: key });
        const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
        });

        return {
            answer: response.content[0].text,
            context: contextResults?.[0]?.content.slice(0, 500) + "...",
            sources: contextResults?.map(r => ({
                name: r.metadata.fileName || r.metadata.title,
                relevance: r.similarity
            }))
        };
    } catch (apiError) {
        console.warn('[RAG] Anthropic failed, attempting Groq fallback...', apiError.message);
        
        try {
            if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
            
            const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are the Virtual Board Member AI. Respond in HTML correctly as requested." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1024
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('[RAG] Groq fallback succeeded.');
            const reply = groqRes.data.choices[0].message.content;
            
            return {
                answer: reply,
                context: contextResults?.[0]?.content.slice(0, 500) + "...",
                sources: contextResults?.map(r => ({
                    name: r.metadata.fileName || r.metadata.title,
                    relevance: r.similarity
                })),
                engine: 'groq-fallback'
            };
        } catch (groqErr) {
            console.error('[RAG] Both LLMs failed:', groqErr.message);
            throw new Error(`AI Advisory Engine Failed (Claude & Groq): ${groqErr.message}`);
        }
    }
}

const BOARD_ROLE_LABELS = {
    board_chair: 'Board Chair',
    director: 'Director',
    company_secretary: 'Company Secretary',
    legal_compliance: 'Legal & Compliance',
    ceo_exec: 'CEO/Executive'
};

function formatRole(role) {
    return BOARD_ROLE_LABELS[role] || role;
}

async function generateMinutes(transcript, attendees = []) {
    const roleContext = attendees.length > 0
        ? `\nMEETING PARTICIPANTS:\n${attendees.map(a =>
            `- ${a.participant_name}: ${a.board_role ? formatRole(a.board_role) : 'External Guest'}${a.matched ? '' : ' (unverified)'}`
          ).join('\n')}\n\nIMPORTANT: When referencing speakers, include their board role in parentheses, e.g., "Jane Smith (Board Chair) proposed..."\n`
        : '';

    const systemPrompt = `You are a professional board secretary.
    Transform the meeting transcript into structured minutes.
    Use HTML tags ONLY. No markdown symbols like asterisks or hashes.
    SECTIONS: ${attendees.length > 0 ? 'Attendance & Roles, ' : ''}Agenda Overview, Executive Discussion, Key Decisions.
    FORMAT: <h3>Header</h3><ul><li>Point</li></ul><strong>Decision</strong>${roleContext}`;

    try {
        console.log('[MINUTES] Attempting Claude synthesis...');
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
        
        const anthropicHeader = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        const response = await anthropicHeader.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: "user", content: `SESSION TRANSCRIPT:\n\n${transcript}` }]
        });

        console.log('[MINUTES] Claude succeeded.');
        return response.content[0].text;
    } catch (err) {
        console.warn('[MINUTES] Claude failed, attempting Groq fallback...', err.message);
        
        try {
            if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
            
            const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `SESSION TRANSCRIPT:\n\n${transcript}` }
                ],
                max_tokens: 1500
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('[MINUTES] Groq fallback succeeded.');
            return groqRes.data.choices[0].message.content;
        } catch (groqErr) {
            console.error('[MINUTES] Both Claude and Groq failed.', groqErr.message);
            throw new Error(`AI Synthesis Failed (Claude & Groq): ${groqErr.message}`);
        }
    }
}

async function extractActions(transcript, attendees = []) {
    const roleContext = attendees.length > 0
        ? `\nKNOWN PARTICIPANTS AND ROLES:\n${attendees.map(a =>
            `- ${a.participant_name}: ${a.board_role ? formatRole(a.board_role) : 'Guest'}`
          ).join('\n')}\n\nWhen assigning "owner", use the format "Name (Role)". Prefer assigning to matched board members.\n`
        : '';

    const systemPrompt = `Analyze the meeting transcript and extract concrete action items.
    Return ONLY a JSON array of objects with these keys:
    - "task": specific description
    - "owner": person responsible (include their board role if known)
    - "owner_role": their board role key (board_chair, director, company_secretary, legal_compliance, ceo_exec, or guest)
    - "deadline": timeframe or date mentioned (or "N/A")
    ${roleContext}Format: [{"task": "...", "owner": "...", "owner_role": "...", "deadline": "..."}]
    If no tasks, return []. No markdown markers or preamble.`;

    try {
        console.log('[ACTIONS] Attempting Claude extraction...');
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('Key missing');
        
        const anthropicHeader = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        const response = await anthropicHeader.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: "user", content: `TRANSCRIPT:\n\n${transcript}` }]
        });

        const text = response.content[0].text;
        const tasks = JSON.parse(text.substring(text.indexOf('['), text.lastIndexOf(']') + 1));
        return tasks.filter(t => t.task && t.task.trim().length > 0);
    } catch (err) {
        console.warn('[ACTIONS] Claude failed, trying Groq fallback...', err.message);
        try {
            const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `TRANSCRIPT:\n\n${transcript}` }
                ],
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
            });
            const data = JSON.parse(groqRes.data.choices[0].message.content);
            const finalTasks = Array.isArray(data) ? data : (data.actions || data.tasks || []);
            return finalTasks.filter(t => t.task && t.task.trim().length > 0);
        } catch (groqErr) {
            console.error('[ACTIONS FAILURE]', groqErr.message);
            throw groqErr;
        }
    }
}

async function generateTitle(minutes, createdAt) {
    const date = new Date(createdAt);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const datePart = `${dayName}, ${monthDay}, ${time}`;

    const systemPrompt = `Extract the primary topic of this board meeting from the minutes below.
Return ONLY a 3-5 word topic summary. No punctuation at the end, no explanation.
Examples: "Q2 Revenue Review", "New Hire Approvals", "Strategic Partnership Discussion"`;

    try {
        console.log('[TITLE] Generating smart title via Claude...');
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('Key missing');

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: 30,
            system: systemPrompt,
            messages: [{ role: "user", content: minutes.substring(0, 2000) }]
        });

        const topic = response.content[0].text.trim().replace(/[.!,;:]+$/, '');
        console.log(`[TITLE] Generated: "${topic} — ${datePart}"`);
        return `${topic} — ${datePart}`;
    } catch (err) {
        console.warn('[TITLE] Claude failed, trying Groq...', err.message);
        try {
            const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: minutes.substring(0, 2000) }
                ],
                max_tokens: 30
            }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });

            const topic = groqRes.data.choices[0].message.content.trim().replace(/[.!,;:]+$/, '');
            return `${topic} — ${datePart}`;
        } catch (groqErr) {
            console.error('[TITLE] Both LLMs failed, using date-only title');
            return `Board Meeting — ${datePart}`;
        }
    }
}

module.exports = {
    indexDocument,
    indexMeetingTranscript,
    searchMemory,
    queryIntelligence,
    generateMinutes,
    extractActions,
    generateTitle,
    formatRole,
    BOARD_ROLE_LABELS
};
