"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { FileText, Upload, Search, Trash2, Database, Plus, RotateCcw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3001';

export default function InstitutionalMemory() {
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
        setIngestStatus("Vaulting Physical PDF...");
        try {
            // 1. UPLOAD TO STORAGE (for file archival)
            const filePath = `${organization.id}/${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('boardroom-vault')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. SEND TO BACKEND FOR PDF PARSING & RAG INDEXING
            setIngestStatus("Reading Institutional Memory...");
            const formData = new FormData();
            formData.append('file', file);
            formData.append('organization_id', organization.id);

            const ingestRes = await axios.post(`${BACKEND_URL}/api/documents/upload`, formData);

            // 3. FINAL REFRESH
            setIngestStatus(`Success: Document indexed.`);
            await loadData();
            setTimeout(() => setIngestStatus(null), 3000);
        } catch (err: any) {
            alert(`Vault Error: ${err.message}`);
            setIngestStatus("Shredder Error.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string, filePath: string | null) => {
        if (!confirm("Are you sure you want to shred this executive document? This action is permanent.")) return;
        try {
            if (filePath) await supabase.storage.from('boardroom-vault').remove([filePath]);
            // Delete via backend to ensure chunks are also removed
            await axios.delete(`${BACKEND_URL}/api/documents/${docId}`);
            await loadData();
        } catch (err: any) { alert(`Shredder Error: ${err.message}`); }
    };

    const handleOpen = async (filePath: string) => {
        if (!filePath) {
            alert('No archive file linked. Document was indexed via backend upload.');
            return;
        }
        const { data } = await supabase.storage.from('boardroom-vault').createSignedUrl(filePath, 3600);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
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
        <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12 border-b border-white/5">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                        <Database className="w-4 h-4" />
                        <span>Executive Memory</span>
                    </div>
                    <h1 className="text-6xl font-serif font-medium leading-none">Institutional Library</h1>
                    <p className="text-foreground/40 font-medium italic">Shared executive knowledge vault for {organization?.name}.</p>
                </div>

                <div className="flex flex-col items-end gap-3">
                    {ingestStatus && (
                        <div className="px-5 py-2.5 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-black uppercase tracking-widest text-primary animate-pulse italic">
                            {ingestStatus}
                        </div>
                    )}
                    <label className="h-14 px-8 bg-primary hover:bg-primary/95 text-background rounded-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 cursor-pointer disabled:opacity-50">
                        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                        {uploading ? <RotateCcw className="w-5 h-5 animate-spin" /> : (
                            <>
                                <Plus className="w-5 h-5" />
                                <span>Add Knowledge</span>
                            </>
                        )}
                    </label>
                </div>
            </header>

            {/* Document Gallery */}
            {documents.length === 0 ? (
                <div className="py-24 rounded-[48px] bg-white/[0.01] border border-dashed border-white/10 flex flex-col items-center justify-center space-y-6 text-center">
                    <Database className="w-16 h-16 text-foreground/20" />
                    <h3 className="text-xl font-serif text-foreground/60 italic">No Institutional Memory Vaulted.</h3>
                    <p className="text-foreground/20 text-sm max-w-sm">Upload strategy archives to prime your advisor's collective brain.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredDocs.map((doc) => (
                        <div key={doc.id} className="group p-8 rounded-[40px] bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 transition-all hover:-translate-y-2 relative overflow-hidden">
                            <div className="relative z-10 space-y-8">
                                <div className="flex items-center justify-between font-bold">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <button onClick={() => handleDelete(doc.id, doc.file_path)} className="p-2 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/20 hover:text-red-500">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <h3 onClick={() => handleOpen(doc.file_path)} className="font-bold text-xl leading-tight line-clamp-2 text-foreground/80 group-hover:text-foreground transition-colors cursor-pointer">{doc.filename}</h3>
                                    <div className="flex items-center gap-3 text-[9px] uppercase font-black tracking-widest text-foreground/20">
                                        <span className="px-2 py-0.5 rounded-full bg-white/5">{doc.file_type.split('/')[1]?.toUpperCase() || 'DOC'}</span>
                                        <div className="w-1 h-1 rounded-full bg-white/10" />
                                        <span>{format(new Date(doc.created_at), 'MMM dd, yyyy')}</span>
                                    </div>
                                </div>
                                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                                    <span className={`text-[10px] uppercase font-black tracking-widest italic ${doc.status === 'indexed' ? 'text-primary' : 'text-primary/40 animate-pulse'}`}>
                                        {doc.status === 'indexed' ? 'Fully Indexed' : 'Memory Syncing...'}
                                    </span>
                                    <button onClick={() => handleOpen(doc.file_path)} className="flex items-center gap-1.5 text-[9px] font-black tracking-widest text-foreground/40 hover:text-foreground transition-colors uppercase">
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Open Archive</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
