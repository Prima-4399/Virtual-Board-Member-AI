"use client";

import { useEffect, useState } from 'react';
import BotControl from "@/components/BotControl";
import RoleGuard from "@/components/RoleGuard";
import { createClient } from '@/utils/supabase';
import { Calendar, Plus, Users, Video, Trash2 } from 'lucide-react';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function MeetingCenter() {
    const [userProfile, setUserProfile] = useState<any>(null);
    const [organization, setOrganization] = useState<any>(null);
    const [isSchedulingModalOpen, setIsSchedulingModalOpen] = useState(false);
    const [scheduledMeetings, setScheduledMeetings] = useState<any[]>([]);
    const [timezone, setTimezone] = useState('UTC');
    const [loading, setLoading] = useState(true);

    const supabase = createClient();

    useEffect(() => {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session || !session.user) return;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (profile) {
                    setUserProfile(profile);
                    if (profile.organization_id) {
                        const { data: orgData } = await supabase
                            .from('organizations')
                            .select('*')
                            .eq('id', profile.organization_id)
                            .single();
                        setOrganization(orgData);

                        const { data: mtgs } = await supabase
                            .from('meetings')
                            .select('*')
                            .eq('organization_id', profile.organization_id)
                            .order('created_at', { ascending: false })
                            .limit(10);
                        setScheduledMeetings(mtgs || []);
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [supabase]);

    const handleDeleteScheduledMeeting = async (meetingId: string) => {
        if (!confirm("Are you sure you want to cancel this meeting? It will be removed from both this app and your Google Calendar.")) return;
        try {
            await axios.delete(`${BACKEND_URL}/api/meetings/schedule/${meetingId}`, {
                params: { userId: userProfile?.id }
            });
            setScheduledMeetings((prev: any[]) => prev.filter((m: any) => m.id !== meetingId));
        } catch (err: any) {
            console.error('Failed to delete meeting:', err);
            alert('Failed to delete meeting: ' + (err.response?.data?.error || err.message));
        }
    };

    const canSchedule = userProfile?.role !== 'intern';

    return (
        <RoleGuard deniedRoles={['intern']}>
            <div className="p-8">
                <div className="max-w-6xl mx-auto space-y-12">
                    {/* Boardroom Header */}
                    <header className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary whitespace-nowrap">Meeting Room 01</span>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <h1 className="text-6xl font-serif text-center text-foreground font-medium tracking-tight">Meeting Center</h1>
                        <p className="text-center text-foreground/40 max-w-xl mx-auto text-sm font-medium font-serif italic">
                            Record your meeting, get a live transcript, and let the AI take notes.
                        </p>
                    </header>

                    {/* Bot Control Module */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <BotControl />
                    </div>

                    {/* Calendar Section */}
                    {organization && (
                        <div className="pt-10 border-t border-border mt-10 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <ScheduleMeetingModal
                                isOpen={isSchedulingModalOpen}
                                onClose={() => setIsSchedulingModalOpen(false)}
                                userId={userProfile?.id}
                                organizationId={organization?.id}
                                timezone={timezone}
                                onSuccess={(meeting) => {
                                    setScheduledMeetings(prev => [meeting, ...prev]);
                                    alert("Meeting scheduled successfully! It will appear on your Google Calendar shortly.");
                                }}
                            />
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-2">
                                    <h2 className="text-4xl font-serif">Calendar</h2>
                                    <p className="text-foreground/40 text-sm font-medium italic italic">Schedule your upcoming meetings.</p>
                                </div>
                                {canSchedule && (
                                    <button 
                                        onClick={() => setIsSchedulingModalOpen(true)}
                                        className="px-8 py-4 bg-primary text-background rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 active:scale-95 transition-all"
                                    >
                                        <Plus className="w-5 h-5" />
                                        New Meeting
                                    </button>
                                )}
                            </div>

                            <div className="relative p-1 bg-surface-low border border-border rounded-[48px] overflow-hidden group">
                                <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
                                <div className="w-full aspect-video bg-black/40 rounded-[44px] flex items-center justify-center relative overflow-hidden">
                                     {!userProfile?.google_connected ? (
                                        <>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 z-10 bg-black/60 backdrop-blur-sm">
                                                <Calendar className="w-20 h-20 text-primary/20 animate-bounce" />
                                                <div className="text-center space-y-2">
                                                    <h3 className="text-2xl font-serif italic text-foreground/60">Meeting Calendar</h3>
                                                    <p className="text-foreground/20 text-xs font-bold uppercase tracking-widest">Syncing your calendar for {organization.name}</p>
                                                </div>
                                                 <div className="flex items-center gap-4">
                                                    <button 
                                                        onClick={async () => {
                                                            const { data } = await axios.get(`${BACKEND_URL}/api/auth/google/url`);
                                                            if (data?.url) window.location.href = data.url;
                                                        }}
                                                        className="px-10 py-5 bg-surface-highest/20 hover:bg-surface-highest/40 border border-border rounded-3xl text-[10px] font-black uppercase tracking-widest text-primary transition-all"
                                                    >
                                                        Connect Google Calendar
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Mock Grid for Aesthetic Background - only when disconnected */}
                                            <div className="grid grid-cols-7 w-full h-full opacity-5">
                                                {Array.from({ length: 35 }).map((_, i) => (
                                                    <div key={i} className="border border-border p-8" />
                                                ))}
                                            </div>
                                        </>
                                     ) : (
                                         <div className="absolute inset-0 bg-white">
                                             <iframe 
                                                 src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(userProfile.email)}&ctz=${encodeURIComponent(timezone)}&mode=WEEK`}
                                                 className="w-full h-full border-0"
                                             />

                                             {/* Floating Disconnect for owners */}
                                             <button 
                                                 onClick={async () => {
                                                     if (confirm("Disconnect Google Calendar?")) {
                                                         await axios.post(`${BACKEND_URL}/api/auth/google/disconnect`, { userId: userProfile.id });
                                                         window.location.reload();
                                                     }
                                                 }}
                                                 className="absolute bottom-6 right-6 px-6 py-3 bg-red-500 text-white rounded-2xl text-[8px] font-black uppercase tracking-widest shadow-xl hover:bg-red-600 transition-all active:scale-95"
                                             >
                                                 Disconnect Account
                                             </button>
                                         </div>
                                     )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {scheduledMeetings.length > 0 ? scheduledMeetings.map((m, i) => (
                                    <div key={i} className="p-8 rounded-[40px] bg-surface-low border border-border space-y-6 group hover:bg-surface-high transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="px-3 py-1 rounded-full bg-primary/20 text-[8px] font-black uppercase tracking-widest text-primary">Scheduled</div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleDeleteScheduledMeeting(m.id)}
                                                    className="p-2 rounded-lg hover:bg-red-500/10 text-foreground/10 hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <Calendar className="w-4 h-4 text-primary/20" />
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-xl font-bold font-serif mb-1">{m.title}</h4>
                                            <div className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                                                {new Date(m.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                            </div>

                                            {/* Attendance Preview */}
                                            {m.initial_attendees && m.initial_attendees.length > 0 && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <div className="flex items-center gap-1.5 w-full text-[8px] font-black uppercase tracking-widest text-foreground/20 mb-1">
                                                        <Users className="w-2 h-2" /> Invited
                                                    </div>
                                                    {m.initial_attendees.slice(0, 3).map((email: string, idx: number) => (
                                                        <div key={idx} className="px-2 py-1 rounded-lg bg-surface-high border border-border text-[8px] text-foreground/60 font-medium">
                                                            {email.split('@')[0]}
                                                        </div>
                                                    ))}
                                                    {m.initial_attendees.length > 3 && (
                                                        <div className="px-2 py-1 rounded-lg bg-primary/10 text-[8px] text-primary font-bold">
                                                            +{m.initial_attendees.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {m.recording_url && m.recording_url.includes('meet.google.com') && (
                                                <a href={m.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 text-[9px] font-black uppercase tracking-[0.2em] text-primary hover:underline">
                                                   <Video className="w-3 h-3" /> Join Meet
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-full py-20 text-center border border-dashed border-border rounded-[40px]">
                                        <p className="text-foreground/20 text-[10px] font-black uppercase tracking-widest">No upcoming meetings scheduled via AI.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </RoleGuard>
    );
}
