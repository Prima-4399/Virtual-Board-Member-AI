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

        // 3. Construct High-Resolution Executive Context
        const context = globalChunks?.map((c: any) => c.content).join('\n\n') || "No shared archives found for your organization.";

        // 4. Dual-Intelligence Logic (Claude + GROQ)
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        const GROQ_API_KEY = "GROQ_KEY_REDACTED";
        const GROQ_MODEL = "llama-3.1-8b-instant";

        const systemPrompt = `You are VB Intelligence, a strategic Virtual Board Member providing advisor reasoning.
        
        SHARED CORPORATE KNOWLEDGE BASE:
        ${context}
        
        OBJECTIVE:
        Examine the archives above and use them to address the user's query. Cite specific details like "$4.2M Singapore adjustment" or document names if they exist. Be professional, strategic, and concise.`;

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
                    return NextResponse.json({ reply: aiData.content[0].text, context_sources: globalChunks?.length || 0 });
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
            engine: 'executive_fallback'
        });

    } catch (error: any) {
        console.error('Advisory Critical Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
