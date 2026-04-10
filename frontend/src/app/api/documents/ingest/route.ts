import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRequire } from 'module';

// CACHE BUSTER: Boardroom Ingestion v2.0.1 (Dynamic Bridging)
const require = createRequire(import.meta.url);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const orgId = formData.get('organization_id') as string;
        const docId = formData.get('document_id') as string;

        if (!file || !orgId || !docId) {
            return NextResponse.json({ error: "Executive metadata missing." }, { status: 400 });
        }

        // 1. DYNAMIC LEGACY SHREDDER
        // Using require inside the function to ensure ESM/CJS compatibility
        const pdf = require('pdf-parse');
        
        // 2. EXTRACT TEXT
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const data = await pdf(buffer);
        const text = data.text;

        // 3. CHUNK THE TEXT (Boardroom Shredding)
        const chunkSize = 2000;
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }

        if (chunks.length === 0) {
            return NextResponse.json({ error: "Document is empty." }, { status: 422 });
        }

        // 4. SECURE CONNECTION
        const cookieStore = await cookies();
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

        // 5. VAULT CHUNKS
        const insertData = chunks.map(chunk => ({
            document_id: docId,
            content: chunk,
            organization_id: orgId,
            embedding: Array(1536).fill(0),
            metadata: { 
                source: file.name,
                pages: data.numpages,
                ingested_at: new Date().toISOString()
            }
        }));

        const { error: chunkError } = await supabase
            .from('document_chunks')
            .insert(insertData);

        if (chunkError) throw chunkError;

        // 6. UPDATE LEDGER
        await supabase
            .from('documents')
            .update({ status: 'indexed' })
            .eq('id', docId);

        return NextResponse.json({ 
            success: true, 
            chunks_vaulted: chunks.length,
            pages_processed: data.numpages 
        });

    } catch (error: any) {
        console.error('Ingestion Failure:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
