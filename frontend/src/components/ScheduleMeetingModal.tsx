"use client";

import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, Users, Video, Loader2, Check } from 'lucide-react';
import axios from 'axios';

interface Profile {
    email: string;
    display_name: string | null;
    id: string;
}

interface ScheduleMeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    organizationId: string;
    timezone: string;
    onSuccess: (meeting: any) => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function ScheduleMeetingModal({ isOpen, onClose, userId, organizationId, timezone, onSuccess }: ScheduleMeetingModalProps) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [duration, setDuration] = useState('60');
    const [attendees, setAttendees] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Autocomplete states
    const [members, setMembers] = useState<Profile[]>([]);
    const [suggestions, setSuggestions] = useState<Profile[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const suggestionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && organizationId) {
            fetchMembers();
        }
    }, [isOpen, organizationId]);

    const fetchMembers = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/organizations/${organizationId}/members`);
            setMembers(res.data);
        } catch (err) {
            console.error('Failed to fetch members:', err);
        }
    };

    const handleAttendeesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAttendees(value);

        const parts = value.split(',');
        const currentPart = parts[parts.length - 1].trim().toLowerCase();

        if (currentPart.length > 0) {
            const filtered = members.filter(m => 
                (m.email.toLowerCase().includes(currentPart) || 
                 (m.display_name?.toLowerCase().includes(currentPart))) &&
                !value.toLowerCase().includes(m.email.toLowerCase())
            );
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setActiveSuggestionIndex(0);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectSuggestion = (profile: Profile) => {
        const parts = attendees.split(',');
        parts[parts.length - 1] = ` ${profile.email}`;
        const newValue = parts.join(',').trim();
        setAttendees(newValue + (newValue.endsWith(',') ? '' : ', '));
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectSuggestion(suggestions[activeSuggestionIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    if (!isOpen) return null;

    const handleSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const startDateTime = new Date(`${date}T${time}`);
            const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);

            const res = await axios.post(`${BACKEND_URL}/api/meetings/schedule`, {
                userId,
                organization_id: organizationId,
                title,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
                timezone,
                attendees: attendees.split(',').map(email => email.trim()).filter(email => email !== '')
            });


            if (res.data.success) {
                onSuccess(res.data.meeting);
                onClose();
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to schedule meeting');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-background border border-border w-full max-w-lg rounded-[48px] overflow-hidden flex flex-col shadow-2xl shadow-black/50 overflow-y-auto max-h-[90vh]">
                <div className="p-10 space-y-8">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-serif font-medium">Schedule Meeting</h2>
                            <p className="text-foreground/40 text-[10px] uppercase font-black tracking-widest italic">Create calendar event & Meet link</p>
                        </div>
                        <button onClick={onClose} className="p-3 rounded-2xl hover:bg-surface-highest/20 text-foreground/20 hover:text-foreground transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSchedule} className="space-y-6">
                        {error && (
                            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-widest text-center italic">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Meeting Title</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="EX: Quarterly Strategy Review"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full h-14 px-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20" />
                                        <input
                                            type="date"
                                            required
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="w-full h-14 pl-14 pr-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Start Time</label>
                                    <div className="relative">
                                        <Clock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20" />
                                        <input
                                            type="time"
                                            required
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full h-14 pl-14 pr-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Duration (Minutes)</label>
                                <select
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    className="w-full h-14 px-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="15" className="bg-black">15 Minutes</option>
                                    <option value="30" className="bg-black">30 Minutes</option>
                                    <option value="60" className="bg-black">1 Hour</option>
                                    <option value="90" className="bg-black">1.5 Hours</option>
                                    <option value="120" className="bg-black">2 Hours</option>
                                </select>
                            </div>

                            <div className="space-y-2 group relative">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Attendees (comma separated emails)</label>
                                <div className="relative">
                                    <Users className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20" />
                                    <input
                                        type="text"
                                        placeholder="EX: jane@example.com, bob@example.com"
                                        value={attendees}
                                        onChange={handleAttendeesChange}
                                        onKeyDown={handleKeyDown}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        className="w-full h-14 pl-14 pr-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                    />
                                </div>

                                {showSuggestions && (
                                    <div 
                                        ref={suggestionRef}
                                        className="absolute z-[120] left-0 right-0 mt-2 bg-neutral-900 border border-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                                    >
                                        <div className="max-h-48 overflow-y-auto">
                                            {suggestions.map((profile, idx) => (
                                                <button
                                                    key={profile.id}
                                                    type="button"
                                                    onClick={() => selectSuggestion(profile)}
                                                    onMouseEnter={() => setActiveSuggestionIndex(idx)}
                                                    className={`w-full flex items-center justify-between px-6 py-4 text-left transition-colors ${
                                                        idx === activeSuggestionIndex ? 'bg-primary text-background' : 'hover:bg-surface-highest/20'
                                                    }`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-xs uppercase tracking-wider">{profile.display_name || 'Team Member'}</span>
                                                        <span className={`text-[10px] ${idx === activeSuggestionIndex ? 'text-background/70' : 'text-foreground/40'}`}>
                                                            {profile.email}
                                                        </span>
                                                    </div>
                                                    {idx === activeSuggestionIndex && <Check className="w-4 h-4" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button 
                            disabled={loading}
                            className="w-full h-16 bg-primary hover:bg-primary/95 text-background rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-primary/10"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>
                                    <Video className="w-5 h-5" />
                                    <span>Schedule Meeting</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
