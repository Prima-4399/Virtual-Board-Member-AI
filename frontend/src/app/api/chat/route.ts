import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { message, organization_id, conversation_context } = await req.json();
        const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

        // Delegate query to the established RAG engine in the backend
        const response = await fetch(`${BACKEND_URL}/api/documents/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: message,
                organization_id,
                conversation_context: conversation_context || ''
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Backend Advisory Engine failure');
        }

        const data = await response.json();

        return NextResponse.json({
            reply: data.answer,
            sources: data.sources || [],
            engine: 'executive_rag_v2'
        });

    } catch (error: any) {
        console.error('Advisory Critical Error:', error);
        return NextResponse.json({
            reply: "My apologies, our institutional memory link was momentarily interrupted. Please ensure the backend engine is active.",
            error: error.message
        }, { status: 500 });
    }
}
