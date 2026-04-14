"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { FileText, Trash2, Database, Plus, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import RoleGuard from "@/components/RoleGuard";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function KnowledgeBase() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [organization, setOrganization] = useState<any>(null);
    const [ingestStatus, setIngestStatus] = useState<string | null>(null);
    
    const supabase = createClient();

    const loadData = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id, organizations(*)')
            .eq('id', session.user.id)
            .single();

        if (profile?.organization_id) {
            setOrganization(profile.organizations);
            const { data: docs } = await supabase
                .from('documents')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .order('created_at', { ascending: false });
            setDocuments(docs || []);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !organization) return;

        setUploading(true);
        setIngestStatus("Saving your PDF...");
        try {
            // 1. UPLOAD TO STORAGE (for file archival)
            const filePath = `${organization.id}/${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('boardroom-vault')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. SEND TO BACKEND FOR PDF PARSING & RAG INDEXING
            setIngestStatus("AI is reading your document...");
            const formData = new FormData();
            formData.append('file', file);
            formData.append('organization_id', organization.id);

            const ingestRes = await axios.post(`${BACKEND_URL}/api/documents/upload`, formData);

            // 3. FINAL REFRESH
            setIngestStatus(`Success: File saved.`);
            await loadData();
            setTimeout(() => setIngestStatus(null), 3000);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
            setIngestStatus("Upload Error.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string, filePath: string | null) => {
        if (!confirm("Are you sure you want to delete this document? This action is permanent.")) return;
        try {
            if (filePath) await supabase.storage.from('boardroom-vault').remove([filePath]);
            // Delete via backend to ensure chunks are also removed
            await axios.delete(`${BACKEND_URL}/api/documents/${docId}`);
            await loadData();
        } catch (err: any) { alert(`Shredder Error: ${err.message}`); }
    };



    const filteredDocs = documents.filter(d => 
        d.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    return (
        <RoleGuard deniedRoles={['intern']}>
            <div className="max-w-6xl mx-auto px-6 py-12 space-y-12 bg-background">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12 border-b border-border">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                            <Database className="w-4 h-4" />
                            <span>Your Files</span>
                        </div>
                        <h1 className="text-6xl font-serif font-medium leading-none">Knowledge Library</h1>
                        <p className="text-foreground/40 font-medium italic font-serif">Shared files for {organization?.name}.</p>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        {ingestStatus && (
                            <div className="px-5 py-2.5 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-black uppercase tracking-widest text-primary animate-pulse italic">
                                {ingestStatus}
                            </div>
                        )}
                        <label className="h-14 px-8 bg-primary hover:bg-primary/95 text-background rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-lg shadow-primary/10">
                            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                            {uploading ? <RotateCcw className="w-5 h-5 animate-spin" /> : (
                                <>
                                    <Plus className="w-5 h-5" />
                                    <span>Upload File</span>
                                </>
                            )}
                        </label>
                    </div>
                </header>

                {/* Document Gallery */}
                {documents.length === 0 ? (
                    <div className="py-24 rounded-[48px] bg-surface-low border border-dashed border-border flex flex-col items-center justify-center space-y-6 text-center">
                        <Database className="w-16 h-16 text-foreground/10" />
                        <h3 className="text-xl font-serif text-foreground/40 italic">No files saved yet.</h3>
                        <p className="text-foreground/20 text-sm max-w-sm font-medium">Upload documents to help the AI learn about your company.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredDocs.map((doc) => (
                            <div key={doc.id} className="group p-8 rounded-2xl bg-surface-low hover:bg-surface-high border border-border transition-all hover:-translate-y-2 relative overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/5">
                                <div className="relative z-10 space-y-8">
                                    <div className="flex items-center justify-between font-bold">
                                        <div className="w-14 h-14 rounded-xl bg-background border border-border flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-sm">
                                            <FileText className="w-7 h-7" />
                                        </div>
                                        <button onClick={() => handleDelete(doc.id, doc.file_path)} className="p-2 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/20 hover:text-red-500">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="font-serif font-medium text-2xl leading-tight line-clamp-2 text-foreground/80 group-hover:text-foreground transition-colors italic">{doc.filename}</h3>
                                        <div className="flex items-center gap-4 text-[9px] uppercase font-black tracking-widest text-foreground/30 font-bold">
                                            <span className="px-3 py-1 rounded-md bg-background border border-border shadow-sm">{doc.file_type.split('/')[1]?.toUpperCase() || 'DOC'}</span>
                                            <div className="w-1 h-1 rounded-full bg-border" />
                                            <span>{format(new Date(doc.created_at), 'MMM dd, yyyy')}</span>
                                        </div>
                                    </div>
                                    <div className="pt-6 flex items-center justify-between border-t border-border">
                                        <span className={`text-[10px] uppercase font-black tracking-[0.2em] italic font-bold ${doc.status === 'indexed' ? 'text-primary' : 'text-primary/40 animate-pulse'}`}>
                                            {doc.status === 'indexed' ? 'Learned by AI' : 'AI is reading...'}
                                        </span>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 h-1 bg-primary/20 w-0 group-hover:w-full transition-all duration-500" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </RoleGuard>
    );
}
