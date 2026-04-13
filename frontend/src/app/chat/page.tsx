"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase';
import { Cpu, Send, Database, Shield, BookOpen, Video, Plus, UserCircle, RotateCcw } from 'lucide-react';

export default function VirtualBoardChat() {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [organization, setOrganization] = useState<any>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    
    const supabase = createClient();
    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const initBoardroom = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, organizations(*)')
                    .eq('id', session.user.id)
                    .single();
                
                if (profile?.organizations) {
                    setOrganization(profile.organizations);
                    setMessages([{
                        role: 'assistant',
                        content: `Good afternoon. I am your Virtual Board Member for ${profile.organizations.name}. I have access to your institutional memory, meeting history, and corporate library. How can I advise you today?`
                    }]);
                }
            }
            setIsInitializing(false);
        };
        initBoardroom();
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading || !organization) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            // CALL BACKEND RAG API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    organization_id: organization.id
                })
            });

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply || "I am currently consolidating your boardroom knowledge. Please repeat your query." }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: "My apologies, our institutional memory link was momentarily interrupted." }]);
        } finally {
            setLoading(false);
        }
    };

    if (isInitializing) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (!organization) return (
        <div className="max-w-2xl mx-auto py-24 px-6 text-center space-y-6">
            <Shield className="w-16 h-16 text-primary/20 mx-auto" />
            <h2 className="text-3xl font-serif font-medium italic text-foreground/60">Executive Advisory Locked</h2>
            <p className="text-foreground/20 text-sm">You must be part of an organization to consult the Virtual Board Member.</p>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto h-[calc(100vh-140px)] flex flex-col px-6">
            {/* Boardroom Context Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-8 border-b border-white/5">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-[24px] bg-primary/5 flex items-center justify-center text-primary relative overflow-hidden group">
                        <Cpu className="w-8 h-8 relative z-10" />
                        <div className="absolute inset-0 bg-primary/10 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-serif font-medium leading-none">Virtual Board Advisor</h1>
                        <p className="text-[10px] uppercase font-black tracking-widest text-foreground/20 italic">
                            Synchronized with {organization.name} Memory Vault
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/40">
                        <Database className="w-3 h-3" />
                        <span>RAG Engine Online</span>
                    </div>
                </div>
            </header>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto py-12 space-y-12 scroll-smooth">
                {messages.map((m, idx) => (
                    <div 
                        key={idx} 
                        className={`flex gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ${m.role === 'assistant' ? 'mr-12' : 'ml-12 flex-row-reverse text-right'}`}
                    >
                        <div className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center ${m.role === 'assistant' ? 'bg-primary/5 text-primary' : 'bg-white/5 text-foreground/40'}`}>
                            {m.role === 'assistant' ? <Cpu className="w-6 h-6" /> : <UserCircle className="w-6 h-6" />}
                        </div>
                        <div className="space-y-4 max-w-2xl">
                            {m.role === 'assistant' ? (
                                <div
                                    className="text-base leading-relaxed text-foreground/80 prose prose-invert max-w-none prose-li:text-foreground/70 prose-strong:text-foreground prose-table:text-sm prose-th:text-primary prose-th:text-left prose-td:py-1 prose-td:pr-4"
                                    dangerouslySetInnerHTML={{ __html: m.content }}
                                />
                            ) : (
                                <div className="text-lg font-serif leading-relaxed text-foreground/60">
                                    {m.content}
                                </div>
                            )}
                            {m.role === 'assistant' && idx > 0 && (
                                <div className="flex items-center gap-4 text-[9px] uppercase font-black tracking-[0.2em] text-primary/40 italic font-bold">
                                    <BookOpen className="w-3 h-3" />
                                    <span>Verified via Institutional Vault</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-8 mr-12 animate-pulse">
                        <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div className="text-lg font-serif italic text-primary/40 mt-2 font-medium">
                            Consulting institutional memory for {organization.name}...
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Suite */}
            <div className="pb-12 pt-6">
                <form onSubmit={handleSendMessage} className="relative group">
                    <input 
                        type="text"
                        placeholder="Ask about strategy, meeting decisions, or documents..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-20 px-8 pr-24 rounded-[32px] bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground font-serif text-xl outline-none transition-all placeholder:text-foreground/10"
                    />
                    <button 
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-primary hover:bg-primary/95 text-background rounded-[18px] flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                    <div className="absolute -bottom-6 left-8 flex items-center gap-6 text-[9px] uppercase font-black tracking-widest text-foreground/10">
                        <div className="flex items-center gap-2">
                            <Video className="w-3 h-3" />
                            <span>Meeting History</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-3 h-3" />
                            <span>PDF/Word Archives</span>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
