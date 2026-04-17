"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { Plus, Users, Calendar, Clock, ChevronRight, FileText, Search, Settings, Building2, UserCircle, Globe, Mail, Shield, Zap, X, Terminal, Database, Cpu, PieChart, Layout, Play, Filter, Download, ExternalLink, RefreshCw, Copy, CheckCircle2, RotateCcw, Briefcase, LayoutDashboard, ShieldAlert, ChevronDown, Pencil, Check, TrendingUp, Target, BookOpen, Trash2, Activity, Video, Trash, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { format } from 'date-fns';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const BOARD_ROLES: Record<string, string> = {
    board_chair: 'Chairman',
    director: 'Director',
    company_secretary: 'Secretary',
    legal_compliance: 'Legal',
    ceo_exec: 'CEO/Manager'
};

const BOARD_ROLE_COLORS: Record<string, string> = {
    board_chair: 'bg-primary/20 text-primary',
    director: 'bg-foreground/5 text-foreground/60',
    company_secretary: 'bg-foreground/5 text-foreground/60',
    legal_compliance: 'bg-foreground/5 text-foreground/60',
    ceo_exec: 'bg-primary/10 text-primary'
};

export default function DashboardPage() {
    const [userProfile, setUserProfile] = useState<any>(null);
    const [organization, setOrganization] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [scheduledMeetings, setScheduledMeetings] = useState<any[]>([]);

    const supabase = createClient();
    const router = useRouter();

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !session.user) {
                router.push('/login');
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            if (profile?.organization_id) {
                const { data: orgData, error: orgError } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('id', profile.organization_id)
                    .maybeSingle();

                if (orgError) throw orgError;

                if (orgData) {
                    setOrganization(orgData);
                    setUserProfile(profile);
                    
                    try {
                        const statsRes = await axios.get(`${BACKEND_URL}/api/organizations/${profile.organization_id}/dashboard-stats`);
                        setStats(statsRes.data);
                    } catch (e) {
                         console.error("Failed to load stats", e);
                    }

                    const { data: mtgs } = await supabase
                        .from('meetings')
                        .select('*')
                        .eq('organization_id', profile.organization_id)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    setScheduledMeetings(mtgs || []);
                } else {
                    router.push('/organization');
                }
            } else {
                router.push('/organization');
            }
        } catch (err: any) {
            console.error('Data Loading Error:', err);
            setError(err.message || 'Loading failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading && !userProfile) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (!organization) return null; // Redirects handled in loadData

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-1000">
            {/* Dashboard Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                        <LayoutDashboard className="w-4 h-4" />
                        <span>AI Assistant</span>
                    </div>
                    <h1 className="text-6xl font-serif font-medium leading-none tracking-tight">Dashboard</h1>
                    <p className="text-foreground/40 font-medium font-black italic uppercase tracking-widest text-[10px]">Overview & Intelligence</p>
                </div>
            </header>

            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Quick Stats */}
                <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                        <Zap className="w-3 h-3" />
                        <span>Quick Stats</span>
                    </div>
                    <h2 className="text-3xl font-serif">Key Metrics</h2>
                    <p className="text-foreground/40 text-sm font-medium italic">Your organization at a glance</p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { label: 'Total Meetings', value: stats?.meetings_held || 0, sub: 'Meetings recorded', icon: Activity, color: 'text-primary' },
                        { label: 'Documents', value: stats?.total_documents || 0, sub: 'Files indexed', icon: FileText, color: 'text-foreground/40' },
                        { label: 'Action Items', value: stats?.total_actions || 0, sub: 'Tasks tracked', icon: CheckCircle2, color: 'text-foreground/40' },
                        { label: 'Team Members', value: stats?.active_members || 0, sub: 'Board members', icon: Users, color: 'text-foreground/40' }
                    ].map((stat, i) => (
                        <div key={i} className="p-8 rounded-[40px] bg-surface-low border border-border space-y-4 hover:bg-surface-high transition-all group">
                            <div className="flex items-center justify-between">
                                <div className={`p-3 rounded-2xl bg-surface-highest/20 ${stat.color} group-hover:scale-110 transition-transform`}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                                <TrendingUp className="w-4 h-4 text-foreground/5" />
                            </div>
                            <div>
                                <div className="text-4xl font-bold font-serif mb-1">{stat.value}</div>
                                <div className="text-[10px] uppercase font-black tracking-widest text-foreground/20">{stat.label}</div>
                                <div className="text-[9px] text-foreground/40 italic font-medium">{stat.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Pending Action Items */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Pending Items</span>
                                </div>
                                <h3 className="text-2xl font-serif">Action Items</h3>
                            </div>
                            <button onClick={() => router.push('/meetings')} className="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5">
                                View All <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {stats?.recent_actions && stats.recent_actions.length > 0 ? (
                                stats.recent_actions
                                    .filter((a: any) => a.status !== 'done' && a.status !== 'completed')
                                    .slice(0, 8)
                                    .map((action: any, i: number) => (
                                    <div key={i} className="p-6 rounded-3xl bg-surface-low border border-border flex items-center justify-between group hover:bg-surface-high transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-highest/20 text-foreground/20">
                                                <CheckCircle2 className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-foreground/80">{action.task}</div>
                                                <div className="flex items-center gap-3 text-[9px] uppercase font-black tracking-widest text-foreground/20 italic">
                                                    <span>{action.owner || 'Unassigned'}</span>
                                                    {action.owner_role && (
                                                        <span className={`px-2 py-0.5 rounded-full ${BOARD_ROLE_COLORS[action.owner_role] || 'bg-foreground/5 text-foreground/40'}`}>
                                                            {BOARD_ROLES[action.owner_role] || action.owner_role.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                    <div className="w-1 h-1 rounded-full bg-surface-highest/40" />
                                                    <span>Due: {action.deadline || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full bg-surface-highest/20 text-foreground/20">
                                            {action.status || 'Pending'}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="py-20 rounded-3xl bg-surface-low border border-dashed border-border flex flex-col items-center justify-center text-center space-y-4">
                                    <CheckCircle2 className="w-10 h-10 text-foreground/10" />
                                    <div className="text-[10px] uppercase font-black tracking-widest text-foreground/20">All tasks completed!</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status & Intelligence Sidebar */}
                    <div className="space-y-6">
                        <h3 className="text-2xl font-serif">Status</h3>
                        <div className="p-8 rounded-[40px] bg-surface-low border border-border space-y-8">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                                    <span className="text-foreground/40">Knowledge Sync</span>
                                    <span className="text-primary">{stats?.total_chunks ? 'Active' : 'Empty'}</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-highest/20 overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: stats?.total_chunks > 0 ? '85%' : '0%' }} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                                    <span className="text-foreground/40">Task Completion</span>
                                    <span className="text-primary">{stats?.completion_rate || 0}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-highest/20 overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${stats?.completion_rate || 0}%` }} />
                                </div>
                            </div>
                            <div className="space-y-4 pt-4 border-t border-border">
                                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-foreground/40 italic font-bold">
                                    <Users className="w-4 h-4" />
                                    {stats?.active_members} Team Members
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-foreground/40 italic font-bold">
                                    <BookOpen className="w-4 h-4" />
                                    {stats?.total_documents} Saved Files
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pre-Meeting Intelligence */}
                <div className="space-y-6 mt-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                                <Calendar className="w-3 h-3" />
                                <span>Intelligence</span>
                            </div>
                            <h3 className="text-2xl font-serif">Upcoming Meetings</h3>
                        </div>
                        <button onClick={() => router.push('/meeting')} className="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5">
                            Go to Calendar <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>

                    {scheduledMeetings.filter((m: any) => new Date(m.scheduled_at || m.created_at) > new Date()).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {scheduledMeetings
                                .filter((m: any) => new Date(m.scheduled_at || m.created_at) > new Date())
                                .slice(0, 4)
                                .map((meeting: any, i: number) => (
                                <div key={i} className="p-6 rounded-[32px] bg-primary/5 border border-primary/20 space-y-4 hover:bg-primary/10 transition-all group cursor-pointer">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="px-3 py-1 rounded-full bg-primary/20 text-[8px] font-black uppercase tracking-widest text-primary mb-2 w-fit">
                                                Upcoming
                                            </div>
                                            <h4 className="text-lg font-bold font-serif mb-1 group-hover:text-primary transition-colors">{meeting.title}</h4>
                                        </div>
                                        <Calendar className="w-4 h-4 text-primary/40 mt-1" />
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-[9px] text-foreground/60 font-bold">
                                        <Clock className="w-3 h-3" />
                                        <span>{format(new Date(meeting.scheduled_at || meeting.created_at), 'MMM dd, yyyy · HH:mm')}</span>
                                    </div>

                                    {/* Pre-read suggestions */}
                                    <div className="pt-3 border-t border-primary/20 space-y-2">
                                        <div className="text-[8px] font-black uppercase tracking-widest text-primary/60">Pre-read Documents</div>
                                        <div className="flex flex-wrap gap-2">
                                            {stats?.recent_documents && stats.recent_documents.length > 0 ? (
                                                stats.recent_documents.map((doc: any, idx: number) => (
                                                    <span key={idx} className="px-2 py-1 rounded text-[8px] font-bold bg-background/40 text-primary truncate max-w-[150px]" title={doc.filename}>
                                                        {doc.filename}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="px-2 py-1 rounded text-[8px] font-bold bg-background/40 text-primary">No pre-reads available</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 rounded-[32px] bg-surface-low border border-dashed border-border flex flex-col items-center justify-center text-center space-y-4">
                            <Calendar className="w-8 h-8 text-foreground/10" />
                            <div className="space-y-2">
                                <div className="text-sm font-serif text-foreground/40 italic">No upcoming meetings</div>
                                <p className="text-[9px] text-foreground/20 font-medium">Schedule your next meeting in the Meeting Center tab</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Cross-Meeting Insights */}
                <div className="space-y-6 mt-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                            <TrendingUp className="w-3 h-3" />
                            <span>Analytics</span>
                        </div>
                        <h3 className="text-2xl font-serif">Cross-Meeting Insights</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Recurring Topics */}
                        <div className="p-6 rounded-[32px] bg-surface-low border border-border space-y-4 hover:bg-surface-high transition-all">
                            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest">
                                <TrendingUp className="w-4 h-4" />
                                <span>Trending Topics</span>
                            </div>
                            <div className="space-y-3">
                                {stats?.trending_topics && stats.trending_topics.length > 0 ? stats.trending_topics.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between group/topic hover:bg-surface-highest/20 p-2 rounded-xl transition-all cursor-default">
                                        <span className="text-sm font-medium text-foreground/70 group-hover/topic:text-primary transition-colors">{item.topic || 'Unknown'}</span>
                                        <span className="text-[8px] font-black px-2 py-1 rounded-full bg-primary/20 text-primary">
                                            Weight {item.weight || 1}
                                        </span>
                                    </div>
                                )) : (
                                    <div className="text-xs text-foreground/40 italic py-4">Gathering insights from recent meetings...</div>
                                )}
                            </div>
                        </div>

                        {/* Pending Decisions */}
                        <div className="p-6 rounded-[32px] bg-surface-low border border-border space-y-4 hover:bg-surface-high transition-all">
                            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Follow-up Items</span>
                            </div>
                            <div className="space-y-3">
                                {stats?.pending_decisions && stats.pending_decisions.length > 0 ? stats.pending_decisions.map((decision: any, i: number) => (
                                    <div key={i} className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-[9px] font-medium leading-relaxed group/decision hover:bg-primary/10 transition-colors">
                                        <strong className="text-primary group-hover/decision:text-primary/80 transition-colors">Decision Needed:</strong> {decision.task}
                                    </div>
                                )) : (
                                    <div className="text-xs text-foreground/40 italic py-4">No follow-ups pending.</div>
                                )}
                            </div>
                        </div>

                        {/* Meeting Frequency */}
                        <div className="p-6 rounded-[32px] bg-surface-low border border-border space-y-4 hover:bg-surface-high transition-all">
                            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest">
                                <Activity className="w-4 h-4" />
                                <span>Patterns</span>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground/70">Avg Meeting Duration</span>
                                    <span className="text-[10px] font-black text-primary">45 min</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground/70">Attendance Rate</span>
                                    <span className="text-[10px] font-black text-primary">{stats?.quorum || 0}%</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground/70">Avg Action Items</span>
                                    <span className="text-[10px] font-black text-primary">{stats?.recent_actions?.length || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
