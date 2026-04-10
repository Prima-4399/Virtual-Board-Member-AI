"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { Video, FileText, Calendar, Clock, ChevronRight, LayoutDashboard, Search, Trash2, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export default function MeetingHistory() {
    const [meetings, setMeetings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [organization, setOrganization] = useState<any>(null);
    const [selectedTranscript, setSelectedTranscript] = useState<any[] | null>(null);

    const supabase = createClient();

    const loadMeetings = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. Get Org ID
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id, organizations(*)')
            .eq('id', session.user.id)
            .single();

        if (profile?.organization_id) {
            setOrganization(profile.organizations);

            // 2. Load History
            const { data: meetHistory } = await supabase
                .from('meetings')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .order('created_at', { ascending: false });

            setMeetings(meetHistory || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadMeetings();
    }, []);

    const filteredMeetings = meetings.filter(m =>
        m.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openTranscript = (meeting: any) => {
        if (!meeting.transcript) {
            alert("This meeting has no transcript recorded yet.");
            return;
        }
        try {
            const data = typeof meeting.transcript === 'string' 
                ? JSON.parse(meeting.transcript) 
                : meeting.transcript;
            setSelectedTranscript(data);
        } catch (e) {
            console.error("Failed to parse transcript", e);
            alert("Transcript data is corrupted.");
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (!organization) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <ShieldAlert className="w-12 h-12 text-primary/40" />
            <h2 className="text-xl font-serif text-foreground/60 italic">Access Restricted to Registered Organizations.</h2>
            <p className="text-foreground/20 text-sm">Join an organization in the Suite to view meeting history.</p>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12 border-b border-white/5">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                        <Video className="w-4 h-4" />
                        <span>Corporate History</span>
                    </div>
                    <h1 className="text-6xl font-serif font-medium leading-none">Meeting Ledger</h1>
                    <p className="text-foreground/40 font-medium italic">Chronological vault of transcripts and recordings for {organization.name}.</p>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Search transcripts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full md:w-80 h-14 pl-12 pr-6 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all placeholder:text-foreground/10"
                    />
                </div>
            </header>

            {/* Transcript Modal */}
            {selectedTranscript && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-background border border-white/10 w-full max-w-4xl max-h-[80vh] rounded-[48px] overflow-hidden flex flex-col shadow-2xl shadow-black">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-2xl font-serif">Meeting Minutes</h2>
                            <button 
                                onClick={() => setSelectedTranscript(null)}
                                className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                Close Ledger
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-white/[0.01]">
                            {selectedTranscript.map((entry: any, i: number) => (
                                <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-6 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-black text-primary">
                                            {entry.participant?.name?.charAt(0) || 'P'}
                                        </div>
                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">{entry.participant?.name || 'Unknown Participant'}</p>
                                    </div>
                                    <p className="text-foreground/70 leading-relaxed font-medium italic">
                                        {entry.words?.map((w: any) => w.text).join(' ')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {meetings.length === 0 ? (
                <div className="py-24 rounded-[48px] bg-white/[0.01] border border-dashed border-white/10 flex flex-col items-center justify-center space-y-6">
                    <div className="w-16 h-16 rounded-[24px] bg-white/[0.02] flex items-center justify-center text-foreground/20">
                        <Video className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-serif text-foreground/60 italic">No Recorded Sessions Yet</h3>
                        <p className="text-foreground/20 text-sm mt-2">Historical meetings will appear here after they are conducted.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredMeetings.map((meeting) => (
                        <div
                            key={meeting.id}
                            className="group p-6 rounded-[32px] bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 transition-all hover:-translate-y-1 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative"
                        >
                            <div className="flex items-center gap-6 relative z-10">
                                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Video className="w-8 h-8" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-bold font-serif text-foreground/90">{meeting.title}</h3>
                                    <div className="flex items-center gap-4 text-[10px] uppercase font-black tracking-widest text-foreground/20">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            <Calendar className="w-3 h-3 text-primary/40" />
                                            <span>{format(new Date(meeting.created_at), 'MMMM do, yyyy')}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 font-bold">
                                            <Clock className="w-3 h-3 text-primary/40" />
                                            <span>{format(new Date(meeting.created_at), 'HH:mm')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 relative z-10">
                                {meeting.recording_url && (
                                    <a
                                        href={meeting.recording_url}
                                        target="_blank"
                                        className="h-12 px-6 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/60 transition-all active:scale-95 border border-white/5"
                                    >
                                        <Video className="w-4 h-4" />
                                        <span>Playback</span>
                                    </a>
                                )}
                                <button
                                    onClick={() => openTranscript(meeting)}
                                    className="h-12 px-6 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-background flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-primary/10"
                                >
                                    <FileText className="w-4 h-4" />
                                    <span>Transcript</span>
                                </button>
                                <button className="p-3 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all border border-red-500/5">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 h-full w-48 bg-gradient-to-l from-primary/[0.02] to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
