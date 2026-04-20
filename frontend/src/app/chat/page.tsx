"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase';
import { Cpu, Send, Database, Shield, BookOpen, Video, UserCircle, Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface Thread {
    id: string;
    title: string;
    messages: Message[];
    summary: string;
    createdAt: number;
    updatedAt: number;
}

const STORAGE_KEY = 'vbma_chat_threads';
const ACTIVE_THREAD_KEY = 'vbma_active_thread';
const MAX_CONTEXT_MESSAGES = 6;
const SUMMARY_THRESHOLD = 10;

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function loadThreads(): Thread[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveThreads(threads: Thread[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function getActiveThreadId(): string | null {
    return localStorage.getItem(ACTIVE_THREAD_KEY);
}

function setActiveThreadId(id: string) {
    localStorage.setItem(ACTIVE_THREAD_KEY, id);
}

export default function VirtualBoardChat() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThreadId, setActiveThread] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [organization, setOrganization] = useState<any>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const supabase = createClient();
    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    // Save current thread messages to localStorage whenever they change
    const persistThread = useCallback((threadId: string, msgs: Message[], allThreads: Thread[]) => {
        const updated = allThreads.map(t =>
            t.id === threadId ? { ...t, messages: msgs, updatedAt: Date.now() } : t
        );
        setThreads(updated);
        saveThreads(updated);
    }, []);

    // Initialize
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, organizations(*)')
                    .eq('id', session.user.id)
                    .single();

                if (profile?.organizations) {
                    setOrganization(profile.organizations);

                    // Load threads from localStorage
                    const savedThreads = loadThreads();
                    setThreads(savedThreads);

                    // Restore active thread or create first one
                    const savedActiveId = getActiveThreadId();
                    const activeExists = savedThreads.find(t => t.id === savedActiveId);

                    if (activeExists) {
                        setActiveThread(activeExists.id);
                        setMessages(activeExists.messages);
                    } else if (savedThreads.length > 0) {
                        const latest = savedThreads[0];
                        setActiveThread(latest.id);
                        setMessages(latest.messages);
                        setActiveThreadId(latest.id);
                    } else {
                        createNewThread(profile.organizations.name, savedThreads);
                    }
                }
            }
            setIsInitializing(false);
        };
        init();
    }, []);

    const createNewThread = (orgName?: string, existingThreads?: Thread[]) => {
        const name = orgName || organization?.name || 'your organization';
        const newThread: Thread = {
            id: generateId(),
            title: 'New Chat',
            messages: [{
                role: 'assistant',
                content: `Hi! I'm your AI assistant for ${name}. I can help you search through your past meetings and saved documents. How can I help you today?`,
                timestamp: Date.now()
            }],
            summary: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const all = existingThreads || threads;
        const updated = [newThread, ...all];
        setThreads(updated);
        saveThreads(updated);
        setActiveThread(newThread.id);
        setActiveThreadId(newThread.id);
        setMessages(newThread.messages);
    };

    const switchThread = (threadId: string) => {
        // Save current thread first
        if (activeThreadId) {
            persistThread(activeThreadId, messages, threads);
        }

        const thread = threads.find(t => t.id === threadId);
        if (thread) {
            setActiveThread(threadId);
            setActiveThreadId(threadId);
            setMessages(thread.messages);
        }
    };

    const deleteThread = (threadId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = threads.filter(t => t.id !== threadId);
        setThreads(updated);
        saveThreads(updated);

        if (activeThreadId === threadId) {
            if (updated.length > 0) {
                setActiveThread(updated[0].id);
                setActiveThreadId(updated[0].id);
                setMessages(updated[0].messages);
            } else {
                createNewThread();
            }
        }
    };

    // Build context for the LLM: summary + last N messages
    const buildConversationContext = (msgs: Message[], summary: string): string => {
        const recentMsgs = msgs.slice(-MAX_CONTEXT_MESSAGES);
        const historyText = recentMsgs
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.replace(/<[^>]*>/g, '').substring(0, 300)}`)
            .join('\n');

        let context = '';
        if (summary) {
            context += `Previous conversation summary: ${summary}\n\n`;
        }
        if (historyText) {
            context += `Recent conversation:\n${historyText}`;
        }
        return context;
    };

    // Generate summary when conversation gets long
    const generateSummary = async (msgs: Message[]): Promise<string> => {
        const text = msgs
            .filter(m => m.role === 'user')
            .map(m => m.content.replace(/<[^>]*>/g, '').substring(0, 200))
            .join('; ');
        return text.substring(0, 500);
    };

    // Auto-title thread from first user message
    const autoTitle = (userMessage: string): string => {
        const cleaned = userMessage.replace(/<[^>]*>/g, '').trim();
        if (cleaned.length <= 40) return cleaned;
        return cleaned.substring(0, 37) + '...';
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading || !organization || !activeThreadId) return;

        const userMessage = input.trim();
        setInput('');

        const userMsg: Message = { role: 'user', content: userMessage, timestamp: Date.now() };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setLoading(true);

        // Auto-title if this is the first user message
        const currentThread = threads.find(t => t.id === activeThreadId);
        if (currentThread && currentThread.title === 'New Chat') {
            const title = autoTitle(userMessage);
            const updatedThreads = threads.map(t =>
                t.id === activeThreadId ? { ...t, title } : t
            );
            setThreads(updatedThreads);
            saveThreads(updatedThreads);
        }

        try {
            // Build conversation context (summary + last few messages)
            const summary = currentThread?.summary || '';
            const conversationContext = buildConversationContext(messages, summary);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    organization_id: organization.id,
                    conversation_context: conversationContext
                })
            });

            const data = await response.json();
            const assistantMsg: Message = {
                role: 'assistant',
                content: data.reply || "I'm still reading through your files. Please try again in a moment.",
                timestamp: Date.now()
            };

            const finalMessages = [...updatedMessages, assistantMsg];
            setMessages(finalMessages);

            // Update summary if conversation is getting long
            let updatedSummary = summary;
            if (finalMessages.filter(m => m.role === 'user').length >= SUMMARY_THRESHOLD && finalMessages.length % 4 === 0) {
                updatedSummary = await generateSummary(finalMessages);
            }

            // Persist to localStorage
            const latestThreads = loadThreads();
            const persisted = latestThreads.map(t =>
                t.id === activeThreadId ? { ...t, messages: finalMessages, summary: updatedSummary, updatedAt: Date.now(), title: t.title === 'New Chat' ? autoTitle(userMessage) : t.title } : t
            );
            setThreads(persisted);
            saveThreads(persisted);

        } catch (error) {
            const errorMsg: Message = {
                role: 'assistant',
                content: "Sorry, I'm having trouble connecting to your files right now.",
                timestamp: Date.now()
            };
            const finalMessages = [...updatedMessages, errorMsg];
            setMessages(finalMessages);
            persistThread(activeThreadId, finalMessages, threads);
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
            <h2 className="text-3xl font-serif font-medium italic text-foreground/60">Chat Locked</h2>
            <p className="text-foreground/20 text-sm">You must be part of a company to talk to the AI assistant.</p>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-80px)] bg-background">
            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-border bg-surface-low flex flex-col shrink-0`}>
                {/* Sidebar Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-widest text-foreground/40">Chat Threads</span>
                    <button
                        onClick={() => createNewThread()}
                        className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Thread List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {threads.map(thread => (
                        <div
                            key={thread.id}
                            onClick={() => switchThread(thread.id)}
                            className={`group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                                activeThreadId === thread.id
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'hover:bg-surface-high text-foreground/60 hover:text-foreground border border-transparent'
                            }`}
                        >
                            <MessageSquare className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{thread.title}</p>
                                <p className="text-[10px] text-foreground/30 truncate">
                                    {new Date(thread.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {' · '}
                                    {thread.messages.filter(m => m.role === 'user').length} messages
                                </p>
                            </div>
                            <button
                                onClick={(e) => deleteThread(thread.id, e)}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-border">
                    <div className="px-3 py-2 rounded-lg bg-surface-high text-[9px] uppercase font-black tracking-widest text-foreground/30 text-center">
                        {threads.length} thread{threads.length !== 1 ? 's' : ''} · Stored locally
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg hover:bg-surface-high text-foreground/40 hover:text-foreground transition-all"
                        >
                            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-surface-low border border-border flex items-center justify-center text-primary shadow-sm">
                                <Cpu className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-lg font-serif font-medium leading-none">AI Assistant</h1>
                                <p className="text-[9px] uppercase font-black tracking-widest text-foreground/40">
                                    {organization.name}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1.5 rounded-lg bg-surface-low border border-border flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-foreground/40">
                            <Database className="w-3 h-3" />
                            <span>AI Ready</span>
                        </div>
                    </div>
                </header>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scroll-smooth">
                    {messages.map((m, idx) => (
                        <div
                            key={idx}
                            className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${m.role === 'assistant' ? 'mr-8' : 'ml-8 flex-row-reverse text-right'}`}
                        >
                            <div className={`w-9 h-9 rounded-lg border border-border shrink-0 flex items-center justify-center shadow-sm ${m.role === 'assistant' ? 'bg-surface-low text-primary' : 'bg-surface-high text-foreground/40'}`}>
                                {m.role === 'assistant' ? <Cpu className="w-4 h-4" /> : <UserCircle className="w-4 h-4" />}
                            </div>
                            <div className="space-y-2 max-w-2xl min-w-0">
                                {m.role === 'assistant' ? (
                                    <div
                                        className="text-sm leading-relaxed text-foreground/80 prose prose-neutral dark:prose-invert max-w-none prose-li:text-foreground/70 prose-strong:text-foreground prose-table:text-sm prose-th:text-primary prose-th:text-left prose-td:py-1 prose-td:pr-4 font-medium"
                                        dangerouslySetInnerHTML={{ __html: m.content }}
                                    />
                                ) : (
                                    <div className="text-sm leading-relaxed text-foreground/80 font-medium">
                                        {m.content}
                                    </div>
                                )}
                                {m.role === 'assistant' && idx > 0 && (
                                    <div className="flex items-center gap-3 text-[8px] uppercase font-black tracking-[0.2em] text-primary/50">
                                        <BookOpen className="w-2.5 h-2.5" />
                                        <span>Checked with your files</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-4 mr-8 animate-pulse">
                            <div className="w-9 h-9 rounded-lg bg-surface-low border border-border flex items-center justify-center text-primary shadow-sm">
                                <Cpu className="w-4 h-4" />
                            </div>
                            <div className="text-sm font-serif italic text-primary/60 mt-2 font-medium">
                                Searching your documents...
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="px-6 pb-6 pt-3">
                    <form onSubmit={handleSendMessage} className="relative group">
                        <input
                            type="text"
                            placeholder="Ask about strategy, meeting decisions, or documents..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full h-14 px-6 pr-16 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-surface-high text-foreground text-sm outline-none transition-all placeholder:text-foreground/20 shadow-sm"
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-primary hover:bg-primary/95 text-background rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 shadow-sm"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                    <div className="flex items-center gap-6 mt-2 ml-2 text-[8px] uppercase font-black tracking-[0.15em] text-foreground/30">
                        <div className="flex items-center gap-1.5">
                            <Video className="w-3 h-3 text-primary/40" />
                            <span>Meetings</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3 text-primary/40" />
                            <span>Documents</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
