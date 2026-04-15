"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { Video, FileText, Calendar, Clock, ChevronRight, LayoutDashboard, Search, Trash2, ShieldAlert, Users, Cpu, CheckCircle, User, X } from 'lucide-react';

const BOARD_ROLE_COLORS: Record<string, string> = {
    'Chairman': 'bg-primary/20 text-primary',
    'Director': 'bg-foreground/5 text-foreground/40',
    'Secretary': 'bg-foreground/5 text-foreground/40',
    'Legal': 'bg-foreground/10 text-foreground/60',
    'CEO/Manager': 'bg-primary/10 text-primary'
};
import { format } from 'date-fns';
import axios from 'axios';
import RoleGuard from "@/components/RoleGuard";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function MeetingHistory() {
    const [meetings, setMeetings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [organization, setOrganization] = useState<any>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
    const [selectedTranscript, setSelectedTranscript] = useState<any[] | null>(null);
    const [selectedMeetingAttendees, setSelectedMeetingAttendees] = useState<Record<string, string>>({});
    const [modalTab, setModalTab] = useState<'transcript' | 'minutes' | 'actions'>('transcript');

    const BOARD_ROLE_KEY_COLORS: Record<string, string> = {
        board_chair: 'bg-primary/20 text-primary',
        director: 'bg-foreground/5 text-foreground/40',
        company_secretary: 'bg-foreground/5 text-foreground/40',
        legal_compliance: 'bg-foreground/10 text-foreground/60',
        ceo_exec: 'bg-primary/10 text-primary'
    };

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

            // 2. Load History (including attendees summary)
            const { data: meetHistory } = await supabase
                .from('meetings')
                .select('id, title, transcript, minutes, actions, recording_url, recall_bot_id, organization_id, attendees_summary, created_at')
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

    const openMeeting = (meeting: any) => {
        setSelectedMeeting(meeting);
        setModalTab('transcript');

        // Parse transcript
        try {
            if (meeting.transcript) {
                const data = typeof meeting.transcript === 'string'
                    ? JSON.parse(meeting.transcript)
                    : meeting.transcript;
                setSelectedTranscript(data);
            } else {
                setSelectedTranscript(null);
            }
        } catch (e) {
            console.error("Failed to parse transcript", e);
            setSelectedTranscript(null);
        }

        // Build attendees role map
        const roleMap: Record<string, string> = {};
        if (meeting.attendees_summary) {
            for (const a of meeting.attendees_summary) {
                if (a.board_role) roleMap[a.name] = a.board_role;
            }
        }
        setSelectedMeetingAttendees(roleMap);
    };

    const closeMeeting = () => {
        setSelectedMeeting(null);
        setSelectedTranscript(null);
        setSelectedMeetingAttendees({});
    };

    const handleDeleteMeeting = async (meetingId: string) => {
        if (!confirm("Are you sure you want to delete this meeting? This will also remove the transcript and all AI summaries. This action is permanent.")) return;
        try {
            await axios.delete(`${BACKEND_URL}/api/meetings/${meetingId}`);
            setMeetings(prev => prev.filter(m => m.id !== meetingId));
        } catch (err: any) {
            alert(`Shredder Error: ${err.message}`);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    return (
        <RoleGuard deniedRoles={['intern']}>
            <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12 border-b border-border">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                            <Video className="w-4 h-4" />
                            <span>Meeting List</span>
                        </div>
                        <h1 className="text-6xl font-serif font-medium leading-none">Past Meetings</h1>
                        <p className="text-foreground/40 font-medium italic">A list of all your recorded meetings and notes for {organization?.name}.</p>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search transcripts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-80 h-14 pl-12 pr-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-surface-high text-foreground outline-none transition-all placeholder:text-foreground/10 shadow-sm"
                        />
                    </div>
                </header>

                {/* Meeting Detail Modal */}
                {selectedMeeting && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-background border border-border w-full max-w-5xl max-h-[85vh] rounded-[48px] overflow-hidden flex flex-col shadow-2xl shadow-black/50">
                            {/* Header */}
                            <div className="p-8 border-b border-border bg-surface-low">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-serif">{selectedMeeting.title}</h2>
                                        <div className="flex items-center gap-4 text-[10px] uppercase font-black tracking-widest text-foreground/30">
                                            <span>{format(new Date(selectedMeeting.created_at), 'MMMM do, yyyy · HH:mm')}</span>
                                            {selectedMeeting.attendees_summary && (
                                                <span>{selectedMeeting.attendees_summary.length} participants</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => {
                                                handleDeleteMeeting(selectedMeeting.id);
                                                closeMeeting();
                                            }}
                                            className="p-3 rounded-xl bg-red-500/5 hover:bg-red-500/10 text-red-500/40 hover:text-red-500 transition-all border border-red-500/5"
                                            title="Delete Meeting"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={closeMeeting}
                                            className="p-3 rounded-xl bg-surface-highest/20 hover:bg-surface-highest/40 text-foreground/40 hover:text-foreground transition-all"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                </div>

                                {/* Attendees */}
                                {selectedMeeting.attendees_summary && selectedMeeting.attendees_summary.length > 0 && (
                                    <div className="flex items-center gap-2 flex-wrap mb-4">
                                        <Users className="w-3 h-3 text-foreground/20" />
                                        {selectedMeeting.attendees_summary.map((a: any, idx: number) => (
                                            <span
                                                key={idx}
                                                className={`text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${a.board_role ? (BOARD_ROLE_COLORS[a.board_role] || 'bg-surface-highest/20 text-foreground/40') : 'bg-surface-highest/20 text-foreground/30'}`}
                                            >
                                                {a.name} {a.board_role ? `· ${a.board_role}` : ''}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Tabs */}
                                <div className="flex gap-2 bg-surface-low p-1 rounded-xl">
                                    <button
                                        onClick={() => setModalTab('transcript')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'transcript' ? 'bg-background text-primary shadow-sm' : 'text-foreground/30 hover:text-foreground/60'}`}
                                    >
                                        Transcript
                                    </button>
                                    <button
                                        onClick={() => setModalTab('minutes')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'minutes' ? 'bg-background text-primary shadow-sm' : 'text-foreground/30 hover:text-foreground/60'}`}
                                    >
                                        AI Summary
                                    </button>
                                    <button
                                        onClick={() => setModalTab('actions')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'actions' ? 'bg-background text-primary shadow-sm' : 'text-foreground/30 hover:text-foreground/60'}`}
                                    >
                                        Actions
                                    </button>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-surface-low">
                                {modalTab === 'transcript' ? (
                                    selectedTranscript && selectedTranscript.length > 0 ? (
                                        <div className="space-y-6">
                                            {selectedTranscript.map((entry: any, i: number) => {
                                                const speakerName = entry.participant?.name || 'Unknown Participant';
                                                const speakerRole = selectedMeetingAttendees[speakerName];
                                                const roleColor = speakerRole ? (BOARD_ROLE_COLORS[speakerRole] || 'bg-surface-highest/20 text-foreground/40') : '';
                                                return (
                                                    <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-6 py-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-black text-primary">
                                                                {speakerName.charAt(0)}
                                                            </div>
                                                            <p className="text-[10px] font-black text-primary uppercase tracking-widest">{speakerName}</p>
                                                            {speakerRole && (
                                                                <span className={`text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${roleColor}`}>
                                                                    {speakerRole}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-foreground/70 leading-relaxed font-medium italic">
                                                            {entry.words?.map((w: any) => w.text).join(' ')}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 opacity-30">
                                            <FileText className="w-16 h-16" />
                                            <h3 className="text-xl font-serif italic">No Transcript Available</h3>
                                            <p className="text-sm max-w-xs">This meeting has no recorded transcript.</p>
                                        </div>
                                    )
                                ) : modalTab === 'minutes' ? (
                                    selectedMeeting.minutes ? (
                                        <div
                                            dangerouslySetInnerHTML={{ __html: selectedMeeting.minutes }}
                                            className="prose prose-invert max-w-none prose-h3:text-primary prose-h3:text-2xl prose-h3:font-serif prose-h3:mb-2 prose-li:text-foreground/70 font-serif text-lg leading-relaxed text-foreground/80"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 opacity-30">
                                            <Cpu className="w-16 h-16" />
                                            <h3 className="text-xl font-serif italic">No Summary Generated</h3>
                                            <p className="text-sm max-w-xs">A summary was not generated for this meeting.</p>
                                        </div>
                                    )
                                ) : (
                                    selectedMeeting.actions && selectedMeeting.actions.length > 0 ? (
                                        <div className="space-y-4">
                                            {(typeof selectedMeeting.actions === 'string' ? JSON.parse(selectedMeeting.actions) : selectedMeeting.actions).map((action: any, idx: number) => (
                                                <div key={idx} className={`p-6 rounded-2xl border transition-all flex items-start justify-between ${action.status === 'done' ? 'bg-primary/5 border-primary/20 opacity-60' : 'bg-surface-low border-border'}`}>
                                                    <div className="flex items-start gap-4">
                                                        <div className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center ${action.status === 'done' ? 'bg-primary border-primary text-background' : 'border-foreground/20'}`}>
                                                            {action.status === 'done' && <CheckCircle className="w-4 h-4" />}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className={`text-lg font-bold leading-none ${action.status === 'done' ? 'line-through text-foreground/40' : 'text-foreground'}`}>
                                                                {action.task}
                                                            </p>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[9px] font-black uppercase tracking-widest text-primary">
                                                                    <User className="w-2.5 h-2.5" />
                                                                    {action.owner || 'Unassigned'}
                                                                </div>
                                                                {action.owner_role && action.owner_role !== 'guest' && (
                                                                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${BOARD_ROLE_KEY_COLORS[action.owner_role] || 'bg-surface-highest/20 text-foreground/40'}`}>
                                                                        {action.owner_role.replace(/_/g, ' ')}
                                                                    </div>
                                                                )}
                                                                {action.deadline && action.deadline !== 'N/A' && (
                                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-highest/20 border border-border text-[9px] font-black uppercase tracking-widest text-foreground/40">
                                                                        <Clock className="w-2.5 h-2.5" />
                                                                        {action.deadline}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 opacity-30">
                                            <CheckCircle className="w-16 h-16" />
                                            <h3 className="text-xl font-serif italic">No Action Items</h3>
                                            <p className="text-sm max-w-xs">No action items were extracted from this meeting.</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {meetings.length === 0 ? (
                    <div className="py-24 rounded-[48px] bg-surface-low border border-dashed border-border flex flex-col items-center justify-center space-y-6">
                        <div className="w-16 h-16 rounded-[24px] bg-surface-low flex items-center justify-center text-foreground/20">
                            <Video className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-serif text-foreground/60 italic">No meetings yet</h3>
                            <p className="text-foreground/20 text-sm mt-2">Your past meetings will show up here after they are recorded.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredMeetings.map((meeting) => (
                            <div
                                key={meeting.id}
                                className="group p-6 rounded-[32px] bg-surface-low hover:bg-surface-high border border-border transition-all hover:-translate-y-1 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative shadow-sm"
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
                                        {/* Attendees */}
                                        {meeting.attendees_summary && meeting.attendees_summary.length > 0 && (
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                <Users className="w-3 h-3 text-foreground/20" />
                                                {meeting.attendees_summary.map((a: any, idx: number) => (
                                                    <span
                                                        key={idx}
                                                        className={`text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${a.board_role ? (BOARD_ROLE_COLORS[a.board_role] || 'bg-surface-highest/20 text-foreground/40') : 'bg-surface-highest/20 text-foreground/30'}`}
                                                        title={a.board_role || 'Guest'}
                                                    >
                                                        {a.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 relative z-10">
                                    {meeting.recording_url && (
                                        <a
                                            href={meeting.recording_url}
                                            target="_blank"
                                            className="h-12 px-6 rounded-xl bg-surface-highest/20 hover:bg-surface-highest/40 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/60 transition-all active:scale-95 border border-border"
                                        >
                                            <Video className="w-4 h-4" />
                                            <span>Playback</span>
                                        </a>
                                    )}
                                    <button
                                        onClick={() => openMeeting(meeting)}
                                        className="h-12 px-6 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-background flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-primary/10"
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span>View Details</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteMeeting(meeting.id)}
                                        className="p-3 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all border border-red-500/5 shadow-sm"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Simple Accent */}
                                <div className="absolute top-0 right-0 h-full w-1.5 bg-primary/20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </RoleGuard>
    );
}
