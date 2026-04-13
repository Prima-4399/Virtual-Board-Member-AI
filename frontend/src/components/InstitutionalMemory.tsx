'use client'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { createClient } from '@/utils/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Document {
    id: string
    filename: string
    file_type: string
    created_at: string
}

interface SearchResult {
    answer: string
    context: string
    sources: {
        name: string
        page?: number
        relevance: number
    }[]
}

export default function InstitutionalMemory() {
    const [query, setQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [result, setResult] = useState<SearchResult | null>(null)
    const [documents, setDocuments] = useState<Document[]>([])
    const [uploading, setUploading] = useState(false)
    const [activeTab, setActiveTab] = useState<'search' | 'library'>('search')
    const [orgId, setOrgId] = useState<string | null>(null)

    const supabase = createClient()

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', session.user.id)
                    .single()
                if (profile?.organization_id) {
                    setOrgId(profile.organization_id)
                    fetchDocuments(profile.organization_id)
                }
            }
        }
        init()
    }, [supabase])

    const fetchDocuments = async (currentOrgId?: string) => {
        const idToUse = currentOrgId || orgId
        if (!idToUse) return

        try {
            const res = await axios.get(`${BACKEND_URL}/api/documents?organization_id=${idToUse}`)
            setDocuments(res.data)
        } catch (err) {
            console.error('Failed to fetch documents')
        }
    }

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim() || !orgId) return

        setIsSearching(true)
        setResult(null)
        try {
            const res = await axios.post(`${BACKEND_URL}/api/documents/query`, { 
                query, 
                organization_id: orgId 
            })
            setResult(res.data)
        } catch (err) {
            console.error('Search failed')
        } finally {
            setIsSearching(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !orgId) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('organization_id', orgId)

        try {
            await axios.post(`${BACKEND_URL}/api/documents/upload`, formData)
            fetchDocuments()
            setActiveTab('library')
        } catch (err: any) {
            console.error('Upload failed:', err.response?.data || err.message || err)
            alert('Upload failed: ' + (err.response?.data?.error || err.message))
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to permanently delete this document and its memory index?')) return;

        try {
            const response = await fetch(`${BACKEND_URL}/api/documents/${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setDocuments(prev => prev.filter(doc => doc.id !== id));
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Failed to delete document');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Contextual Header */}
            <div className="flex items-center justify-between border-b border-muted/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">
                        Institutional <span className="text-primary italic font-serif lowercase">Memory</span>
                    </h2>
                    <p className="text-muted text-xs font-black uppercase tracking-[0.2em] mt-1">Cross-Reference Archive & RAG Engine</p>
                </div>
                <div className="flex gap-2 bg-surface-high p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'search' ? 'bg-background text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                    >
                        Intelligence
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'library' ? 'bg-background text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                    >
                        Archive
                    </button>
                </div>
            </div>

            {activeTab === 'search' ? (
                <div className="space-y-8">
                    {/* Search Input */}
                    <form onSubmit={handleSearch} className="relative group">
                        <input
                            type="text"
                            placeholder="Query historical data (e.g. 'Compare Q3 cash flow over last 2 years')"
                            className="w-full bg-surface-low border-b-2 border-primary/20 p-6 text-xl font-medium outline-none focus:border-primary focus:bg-surface-high transition-all placeholder:text-muted/30 pr-20 rounded-t-2xl"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={isSearching || !query.trim()}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isSearching ? (
                                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            )}
                        </button>
                    </form>

                    {/* Search Result */}
                    {result ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in zoom-in-95 duration-500">
                            <div className="md:col-span-2 bento-panel border border-primary/10">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Intelligence Synthesis</span>
                                </div>
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <div
                                        className="text-lg leading-relaxed font-medium text-foreground/90 whitespace-pre-line"
                                        dangerouslySetInnerHTML={{ __html: result.answer }}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bento-panel bg-surface-highest/50 border border-muted/10 p-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4 border-b border-muted/10 pb-2">Supporting Context</h4>
                                    <p className="text-xs leading-relaxed text-muted italic overflow-y-auto max-h-40 custom-scrollbar">
                                        "...{result.context}..."
                                    </p>
                                </div>

                                <div className="bento-panel bg-primary/5 border border-primary/20 p-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 border-b border-primary/10 pb-2">Verified Sources</h4>
                                    <div className="space-y-3">
                                        {result.sources.map((src, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <svg className="w-3 h-3 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    <span className="text-[10px] font-bold truncate text-foreground/70">{src.name}</span>
                                                </div>
                                                <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">{(src.relevance * 100).toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : isSearching ? (
                        <div className="bento-panel flex flex-col items-center justify-center py-20 text-center space-y-4">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-8 h-8 bg-primary/20 rounded-full animate-ping" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-foreground tracking-tight">Consulting Archive...</h3>
                                <p className="text-muted text-xs font-medium uppercase tracking-widest">Cross-referencing historical decisions & financial records</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
                            <div className="bento-panel border-dashed border-2 border-muted/20 flex flex-col justify-center gap-2">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Example Query</span>
                                <p className="text-sm font-medium text-foreground/50">"Summarize the key decisions made regarding the offshore expansion in 2023."</p>
                            </div>
                            <div className="bento-panel border-dashed border-2 border-muted/20 flex flex-col justify-center gap-2">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Complex Comparison</span>
                                <p className="text-sm font-medium text-foreground/50">"How does the Q1 R&D expenditure compare to the previous three quarters?"</p>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Upload Section */}
                    <div className="bento-panel border-2 border-dashed border-primary/20 hover:border-primary/40 transition-all text-center relative overflow-hidden group">
                        <input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={handleFileUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            disabled={uploading}
                        />
                        <div className="py-8 space-y-4">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                {uploading ? (
                                    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-foreground tracking-tight">{uploading ? 'Processing Document...' : 'Ingest Document'}</h3>
                                <p className="text-muted text-xs font-medium uppercase tracking-widest">Upload PDF, Meeting Transcripts, or Reports to expand Institutional Memory</p>
                            </div>
                        </div>
                    </div>

                    {/* Document List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {documents.map((doc) => (
                            <div key={doc.id} className="bento-panel p-4 flex items-center justify-between group hover:border-primary/30 transition-all border border-transparent">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-surface-high flex items-center justify-center text-primary">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold truncate text-foreground/90">{doc.filename}</h3>
                                        <span className="text-[10px] text-foreground/40 font-mono tracking-tighter">
                                            {new Date(doc.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(doc.id, e)}
                                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-foreground/40 hover:text-red-400 transition-all duration-300 opacity-0 group-hover:opacity-100"
                                    title="Delete permanently"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
