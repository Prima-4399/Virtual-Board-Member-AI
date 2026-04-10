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
    
    // Call Supabase RPC function for vector similarity
    const embed = await getEmbedder();
    const output = await embed(userQuery, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data);

    const { data: contextResults, error } = await supabase.rpc('match_boardroom_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.2, // Be more generous for board memory
        match_count: 5,
        p_organization_id: orgId
    });

    if (error) {
        console.error('[RAG] RAG Search Error:', error);
    }

    const contextText = contextResults?.map(r => r.content).join('\n\n---\n\n') || "";

    const prompt = `
You are the Virtual Board Member AI. Your goal is to provide a precision-engineered DATA SHEET based on company memory.

CRITICAL FORMATTING RULES:
1. NEVER USE ASTERISKS (*) - ANYWHERE.
2. NEVER USE UNDERSCORES (_) - ANYWHERE.
3. NEVER USE MARKDOWN - ONLY USE HTML.
4. USE <mark>TOKEN</mark> for EVERY numeric value, dollar amount, or percentage.
5. USE <u>TOKEN</u> for EVERY quarter, date, or location.
6. FORMAT: Use a short summary sentence, then a bulleted list of facts.
7. MAX LENGTH: 150 words.

User Query: ${userQuery}

Institutional Memory:
${contextText || "NO HISTORICAL DATA FOUND. Answer based on general board member knowledge."}

RESPONSE STRUCTURE:
[One sentence overview]
- [Category]: <u>[Date]</u> | <mark>[Value]</mark> | [Reason]
`;

    try {
        const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620",
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
        console.error('[RAG] LLM Error:', apiError.message);
        throw apiError;
    }
}

async function generateMinutes(transcript) {
    const systemPrompt = `You are a professional board secretary. 
    Transform the meeting transcript into structured minutes.
    Use HTML tags ONLY. No markdown symbols like asterisks or hashes.
    SECTIONS: Agenda Overview, Executive Discussion, Key Decisions.
    FORMAT: <h3>Header</h3><ul><li>Point</li></ul><strong>Decision</strong>`;

    try {
        console.log('[MINUTES] Attempting Claude synthesis...');
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
        
        const anthropicHeader = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        const response = await anthropicHeader.messages.create({
            model: "claude-3-5-sonnet-20240620",
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

async function extractActions(transcript) {
    const systemPrompt = `Analyze the meeting transcript and extract concrete action items.
    Return ONLY a JSON array of objects with these keys: 
    - "task": specific description
    - "owner": person responsible
    - "deadline": timeframe or date mentioned (or "N/A")
    Format: [{"task": "...", "owner": "...", "deadline": "..."}]
    If no tasks, return []. No markdown markers or preamble.`;

    try {
        console.log('[ACTIONS] Attempting Claude extraction...');
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('Key missing');
        
        const anthropicHeader = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        const response = await anthropicHeader.messages.create({
            model: "claude-3-5-sonnet-20240620",
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

module.exports = {
    indexDocument,
    indexMeetingTranscript,
    searchMemory,
    queryIntelligence,
    generateMinutes,
    extractActions
};
