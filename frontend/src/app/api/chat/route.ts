import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { message, organization_id } = await req.json();
        const cookieStore = await cookies();
        
        // 1. Establish Secure Server Context (Integrated)
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                    set(name: string, value: string, options: any) {
                        try { cookieStore.set({ name, value, ...options }); } catch (error) {}
                    },
                    remove(name: string, options: any) {
                        try { cookieStore.set({ name, value: '', ...options }); } catch (error) {}
                    },
                },
            }
        );

        // 2. BROAD EXECUTIVE RECALL (Direct Ledger Probe)
        // We probe the communal document vault FIRST for this specific organization
        const { data: globalChunks, error: recallError } = await supabase
            .from('document_chunks')
            .select('content, metadata')
            .eq('organization_id', organization_id)
            .order('id', { ascending: false })
            .limit(20);

        if (recallError) throw recallError;

        // 3. MEETING HISTORY RECALL
        const { data: recentMeetings } = await supabase
            .from('meetings')
            .select('title, minutes, actions, attendees_summary, created_at')
            .eq('organization_id', organization_id)
            .not('minutes', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);

        // 4. Construct High-Resolution Executive Context
        const documentContext = globalChunks?.map((c: any) => c.content).join('\n\n') || "No shared archives found.";

        const meetingContext = recentMeetings?.map((m: any) => {
            const date = new Date(m.created_at).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: 'numeric', minute: '2-digit'
            });
            const attendeeNames = m.attendees_summary?.map((a: any) => `${a.name}${a.board_role ? ' (' + a.board_role + ')' : ''}`).join(', ') || 'Unknown';
            const actionsText = m.actions?.map((a: any) => `- ${a.task} (Owner: ${a.owner})`).join('\n') || 'None recorded';
            const minutesTruncated = (m.minutes || '').replace(/<[^>]*>/g, ' ').substring(0, 1200);
            return `MEETING: ${m.title}\nDATE: ${date}\nATTENDEES: ${attendeeNames}\nSUMMARY:\n${minutesTruncated}\nACTION ITEMS:\n${actionsText}`;
        }).join('\n\n---\n\n') || '';

        // 5. Dual-Intelligence Logic (Claude + GROQ)
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

        const systemPrompt = `You are VB Intelligence, a strategic Virtual Board Member providing advisor reasoning.

${meetingContext ? `RECENT BOARD MEETINGS:\n${meetingContext}\n\n` : ''}CORPORATE DOCUMENTS:
${documentContext}

OBJECTIVE:
Answer the user's query using the meeting history and corporate documents above.
For temporal queries ("last meeting", "Tuesday's meeting", "what was discussed on [date]"), use the RECENT BOARD MEETINGS section and cite the specific meeting title and date.
For general knowledge queries, use the CORPORATE DOCUMENTS section.
Cite specific details, names, figures, and document names when available. Be professional, strategic, and concise.

CRITICAL FORMATTING RULES:
1. NEVER use asterisks (*), underscores (_), or hash symbols (#).
2. NEVER use markdown table syntax (no | pipes or --- lines).
3. Use ONLY plain HTML for formatting: <strong> for bold, <em> for emphasis, <br> for line breaks.
4. Use <ul><li> for bullet lists, <ol><li> for numbered lists.
5. Use <table><tr><th>/<td> for tabular data if needed.
6. Keep responses clear, concise, and in a natural conversational tone.`;

        // CLAUDE PRIMARY
        if (ANTHROPIC_API_KEY) {
            try {
                const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                    body: JSON.stringify({
                        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: [{ role: "user", content: message }]
                    })
                });
                const aiData = await anthropicResponse.json();
                if (aiData.content?.[0]?.text) {
                    return NextResponse.json({ reply: aiData.content[0].text, context_sources: globalChunks?.length || 0, meeting_sources: recentMeetings?.length || 0 });
                }
            } catch (claudeErr) { console.error('Claude Failover...'); }
        }

        // GROQ HIGH-SPEED REDUNDANCY
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                max_tokens: 1024
            })
        });

        const groqData = await groqResponse.json();
        const reply = groqData.choices?.[0]?.message?.content || "Boardroom Advisor Engine Timeout.";

        return NextResponse.json({
            reply: reply,
            context_sources: globalChunks?.length || 0,
            meeting_sources: recentMeetings?.length || 0,
            engine: 'executive_fallback'
        });

    } catch (error: any) {
        console.error('Advisory Critical Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
