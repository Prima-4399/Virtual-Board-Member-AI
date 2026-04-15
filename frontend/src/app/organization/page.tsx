"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { Plus, Users, Calendar, Clock, ChevronRight, FileText, Search, Settings, Building2, UserCircle, Globe, Mail, Shield, Zap, X, Terminal, Database, Cpu, PieChart, Layout, Play, Filter, Download, ExternalLink, RefreshCw, Copy, CheckCircle2, RotateCcw, Briefcase, LayoutDashboard, ShieldAlert, ChevronDown, Pencil, Check, TrendingUp, Target, BookOpen, Trash2, Activity, Video, Trash, History } from 'lucide-react';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { format } from 'date-fns';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const APP_ROLES: Record<string, { label: string, color: string }> = {
    ceo: { label: 'CEO', color: 'bg-primary/20 text-primary' },
    manager: { label: 'Manager', color: 'bg-primary/10 text-primary' },
    developer: { label: 'Developer', color: 'bg-foreground/5 text-foreground/60' },
    intern: { label: 'Intern', color: 'bg-foreground/5 text-foreground/40' }
};

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

export default function OrganizationSuite() {
    const [userProfile, setUserProfile] = useState<any>(null);
    const [organization, setOrganization] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isJoining, setIsJoining] = useState(true);
    const [newJoinCode, setNewJoinCode] = useState('');
    const [newOrgName, setNewOrgName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
    const [editingRoleMemberId, setEditingRoleMemberId] = useState<string | null>(null);
    const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
    const [displayNameInput, setDisplayNameInput] = useState('');
    const [stats, setStats] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'governance' | 'scheduler'>('overview');
    const [isSchedulingModalOpen, setIsSchedulingModalOpen] = useState(false);
    const [scheduledMeetings, setScheduledMeetings] = useState<any[]>([]);
    const [timezone, setTimezone] = useState('UTC');
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [activeInviteLink, setActiveInviteLink] = useState<string | null>(null);
    const [pendingRequest, setPendingRequest] = useState<any>(null);
    const [joinRequests, setJoinRequests] = useState<any[]>([]);

    useEffect(() => {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);


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

            // 1. Get Profile Row First (Persistent identity)
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profileError) throw profileError;

            // 2. If profile is part of an org, fetch org and members sequentially
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

                    const { data: teamMembers, error: membersError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('organization_id', orgData.id);

                    if (membersError) throw membersError;
                    setMembers(teamMembers || []);
                } else {
                    // Org exists in profile but not in table (deleted org) - clean up
                    setOrganization(null);
                    setUserProfile(profile);
                }
            } else {
                setOrganization(null);
                setUserProfile(profile);
                setMembers([]);

                // AUTO-CLAIM PENDING INVITE
                if (profile && !profile.organization_id) {
                    try {
                        const { data: claimData } = await axios.post(`${BACKEND_URL}/api/organizations/claim-invite`, {
                            userId: profile.id,
                            email: profile.email
                        });
                        if (claimData.success) {
                            window.location.reload();
                        }
                    } catch (err) {
                        console.log('No pending invite to auto-claim');
                    }
                }
            }

            // 3. Fetch Analytics
            if (profile?.organization_id) {
                const statsRes = await axios.get(`${BACKEND_URL}/api/organizations/${profile.organization_id}/dashboard-stats`);
                setStats(statsRes.data);

                // Fetch real meetings
                const { data: mtgs } = await supabase
                    .from('meetings')
                    .select('*')
                    .eq('organization_id', profile.organization_id)
                    .order('created_at', { ascending: false })
                    .limit(10);
                setScheduledMeetings(mtgs || []);
            }

            // 4. Check for pending requests if no org
            if (!profile?.organization_id) {
                try {
                    const { data: reqStatus } = await axios.get(`${BACKEND_URL}/api/profiles/${session.user.id}/request-status`);
                    setPendingRequest(reqStatus);
                } catch (err) {
                    console.log('No pending invite to fetch');
                }
            } else if (profile?.role === 'ceo' || profile?.role === 'manager') {
                // 5. If admin, check for pending requests to approve
                try {
                    const { data: requests } = await axios.get(`${BACKEND_URL}/api/organizations/${profile.organization_id}/join-requests`, {
                        params: { adminId: profile.id }
                    });
                    setJoinRequests(requests || []);
                } catch (err) {
                    console.error('Failed to load join requests:', err);
                    // Don't break the page - just log and continue
                    setJoinRequests([]);
                }
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

    const copyCode = () => {
        if (!organization?.join_code) return;
        navigator.clipboard.writeText(organization.join_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleJoinOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) throw new Error("User check failed.");

            const { data } = await axios.post(`${BACKEND_URL}/api/organizations/join-request`, {
                userId: session.user.id,
                joinCode: newJoinCode
            });

            if (data.success) {
                alert(`Request sent to join ${data.organizationName}! Please wait for approval.`);
                setPendingRequest({ organizations: { name: data.organizationName } });
                setNewJoinCode('');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) throw new Error("Executive Seat Verification Failed.");

            // 1. Create Org Identity
            const { data: newOrg, error: newOrgError } = await supabase
                .from('organizations')
                .insert({
                    name: newOrgName,
                    owner_id: session.user.id,
                    join_code: Math.random().toString(36).substring(2, 8).toUpperCase()
                })
                .select()
                .single();

            if (newOrgError) {
                if (newOrgError.code === '23505') throw new Error("This company name is already taken.");
                throw newOrgError;
            }

            // 2. Assign Executive Seat
            const { error: updateError } = await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                organization_id: newOrg.id,
                role: 'ceo'
            });

            if (updateError) throw updateError;
            await loadData();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleBoardRoleChange = async (memberId: string, newRole: string) => {
        try {
            await axios.patch(`${BACKEND_URL}/api/profiles/${memberId}/board-role`, { 
                board_role: newRole,
                adminId: userProfile?.id
            });
            setMembers((prev: any[]) => prev.map((m: any) => m.id === memberId ? { ...m, board_role: newRole } : m));
            setEditingMemberId(null);
        } catch (err: any) {
            console.error('Failed to update board role:', err);
            alert(err.response?.data?.error || 'Failed to update board role');
        }
    };

    const handleOrgRoleChange = async (memberId: string, newRole: string) => {
        try {
            await axios.patch(`${BACKEND_URL}/api/profiles/${memberId}/board-role`, { 
                role: newRole,
                adminId: userProfile?.id
            });
            setMembers((prev: any[]) => prev.map((m: any) => m.id === memberId ? { ...m, role: newRole } : m));
            setEditingRoleMemberId(null);
        } catch (err: any) {
            console.error('Failed to update org role:', err);
            alert(err.response?.data?.error || 'Failed to update org role');
        }
    };

    const handleDisplayNameSave = async (memberId: string) => {
        try {
            await axios.patch(`${BACKEND_URL}/api/profiles/${memberId}/board-role`, { display_name: displayNameInput || null });
            setMembers((prev: any[]) => prev.map((m: any) => m.id === memberId ? { ...m, display_name: displayNameInput || null } : m));
            setEditingDisplayName(null);
        } catch (err: any) {
            console.error('Failed to update display name:', err);
        }
    };

    const handleRevokeSeat = async (memberId: string) => {
        if (!confirm("Are you sure you want to delete this user? Access to files and history will be lost immediately.")) return;
        try {
            await axios.delete(`${BACKEND_URL}/api/organizations/${organization.id}/members/${memberId}`);
            setMembers((prev: any[]) => prev.filter((m: any) => m.id !== memberId));
        } catch (err: any) {
            console.error('Failed to revoke seat:', err);
            alert('Failed to revoke seat: ' + (err.response?.data?.error || err.message));
        }
    };

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
    const handleDeleteCompany = async () => {
        if (!confirm("CRITICAL WARNING: This will delete the entire organization, all meetings, transcripts, and documents for EVERY member. This action cannot be undone. Are you sure?")) return;
        
        const password = prompt("Please type DELETE to confirm:");
        if (password !== "DELETE") return;

        setLoading(true);
        try {
            await axios.delete(`${BACKEND_URL}/api/organizations/${organization.id}`, {
                params: { userId: userProfile?.id }
            });
            window.location.reload();
        } catch (err: any) {
            console.error('Failed to delete organization:', err);
            alert('Failed to delete organization: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleModerateRequest = async (requestId: string, action: 'approve' | 'reject') => {
        try {
            await axios.post(`${BACKEND_URL}/api/organizations/${organization.id}/join-requests/${requestId}/moderate`, {
                adminId: userProfile?.id,
                action
            });
            setJoinRequests((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
            if (action === 'approve') {
                await loadData(); // Refresh member list
            }
        } catch (err: any) {
            alert('Failed to moderate request: ' + (err.response?.data?.error || err.message));
        }
    };


    const handleInviteMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail) return;
        setIsInviting(true);
        setActiveInviteLink(null);
        try {
            const { data } = await axios.post(`${BACKEND_URL}/api/organizations/invite`, {
                email: inviteEmail,
                organization_id: organization?.id,
                inviter_id: userProfile?.id,
                role: 'developer'
            });
            if (data.success) {
                setActiveInviteLink(data.inviteLink);
                setInviteEmail('');
                alert('Invitation link generated! You can copy it below.');
            }
        } catch (err: any) {
            console.error('Invite Error:', err);
            alert('Failed to generate invite: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsInviting(false);
        }
    };

    const canInvite = userProfile?.role === 'ceo' || userProfile?.role === 'manager';
    const canManageRoles = userProfile?.role === 'ceo';
    const canSchedule = userProfile?.role !== 'intern';

    if (loading && !userProfile) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (!organization) return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-6">
            <div className="max-w-md w-full space-y-10 py-12 animate-in fade-in zoom-in-95 duration-700">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-[24px] bg-primary/10 flex items-center justify-center text-primary mx-auto mb-8 ring-8 ring-primary/5">
                        <Briefcase className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl font-serif font-medium text-foreground">Team Portal</h1>
                    <p className="text-foreground/40 text-sm font-medium italic">You haven't joined a company yet.</p>
                </div>

                <div className="flex p-1 rounded-2xl bg-surface-low border border-border">
                    <button
                        onClick={() => setIsJoining(true)}
                        className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${isJoining ? 'bg-primary text-background' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        Join Company
                    </button>
                    <button
                        onClick={() => setIsJoining(false)}
                        className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${!isJoining ? 'bg-primary text-background' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        Launch Company
                    </button>
                </div>

                <form onSubmit={isJoining ? handleJoinOrg : handleCreateOrg} className="space-y-6">
                    {error && (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500 text-sm animate-in slide-in-from-top-2">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {pendingRequest ? (
                        <div className="p-10 rounded-3xl bg-primary/5 border border-primary/20 text-center space-y-6 animate-in zoom-in-95">
                            <Clock className="w-12 h-12 text-primary mx-auto animate-pulse" />
                            <div className="space-y-2">
                                <h3 className="text-xl font-serif text-primary uppercase tracking-widest font-bold">Request Pending</h3>
                                <p className="text-foreground/40 text-xs italic font-medium">You have requested to join <span className="text-primary font-black">{pendingRequest.organizations?.name}</span>. An admin must approve your request before you can enter.</p>
                            </div>
                            <button 
                                onClick={() => setPendingRequest(null)}
                                className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 hover:text-primary transition-colors"
                            >
                                Cancel Request
                            </button>
                        </div>
                    ) : (
                        <>
                            {isJoining ? (
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">6-Digit Invite Code</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="EX: ABCDEF"
                                        value={newJoinCode}
                                        maxLength={6}
                                        onChange={(e) => setNewJoinCode(e.target.value.toUpperCase())}
                                        className="w-full h-14 px-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground font-mono text-xl tracking-[0.5em] text-center outline-none transition-all placeholder:text-foreground/10"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Company Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="EX: Cogniify"
                                        value={newOrgName}
                                        onChange={(e) => setNewOrgName(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                    />
                                </div>
                            )}

                            <button disabled={loading} className="w-full h-14 bg-primary hover:bg-primary/95 text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
                                {loading ? <RotateCcw className="w-5 h-5 animate-spin" /> : (
                                    <span>{isJoining ? 'Join Team' : 'Create Company'}</span>
                                )}
                            </button>
                        </>
                    )}
                </form>
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-1000">
            {/* Executive Branding Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                        <Shield className="w-4 h-4" />
                        <span>AI Assistant</span>
                    </div>
                    <h1 className="text-6xl font-serif font-medium leading-none tracking-tight">{organization.name}</h1>
                    <p className="text-foreground/40 font-medium font-black italic uppercase tracking-widest text-[10px]">Management Dashboard & Records</p>
                </div>

            </header>

            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Quick Stats - Live from DB */}
                    <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                            <Zap className="w-3 h-3" />
                            <span>Quick Stats</span>
                        </div>
                        <h2 className="text-3xl font-serif">Key Metrics</h2>
                        <p className="text-foreground/40 text-sm font-medium italic">Your organization at a glance</p>
                    </div>

                    {/* Metrics Grid - All 4 Required Items */}
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


                    {/* Recent Activity Feed */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                                    <History className="w-3 h-3" />
                                    <span>Recent Activity</span>
                                </div>
                                <h3 className="text-2xl font-serif">Last Meetings</h3>
                            </div>
                            <button onClick={() => router.push('/meetings')} className="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5">
                                View All <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                        
                        {scheduledMeetings.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {scheduledMeetings.slice(0, 5).map((meeting: any, i: number) => (
                                    <div key={i} className="p-6 rounded-[32px] bg-surface-low border border-border hover:bg-surface-high transition-all group cursor-pointer" onClick={() => router.push(`/meetings?meeting=${meeting.id}`)}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="px-3 py-1 rounded-full bg-primary/20 text-[8px] font-black uppercase tracking-widest text-primary">
                                                {new Date(meeting.created_at) > new Date() ? 'Upcoming' : 'Past'}
                                            </div>
                                            <Calendar className="w-4 h-4 text-primary/20" />
                                        </div>
                                        
                                        <h4 className="text-lg font-bold font-serif mb-2 group-hover:text-primary transition-colors line-clamp-2">{meeting.title}</h4>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[9px] text-foreground/40 font-bold">
                                                <Clock className="w-3 h-3" />
                                                <span>{format(new Date(meeting.created_at), 'MMM dd, yyyy · HH:mm')}</span>
                                            </div>
                                            
                                            {/* Attendee Badges */}
                                            {meeting.attendees_summary && meeting.attendees_summary.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                                                    <div className="w-full text-[8px] font-black uppercase tracking-widest text-foreground/20">Attendees</div>
                                                    {meeting.attendees_summary.slice(0, 3).map((attendee: any, idx: number) => (
                                                        <span key={idx} className="px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary">
                                                            {attendee.name || attendee}
                                                        </span>
                                                    ))}
                                                    {meeting.attendees_summary.length > 3 && (
                                                        <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-surface-highest/20 text-foreground/40">
                                                            +{meeting.attendees_summary.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 rounded-[32px] bg-surface-low border border-dashed border-border flex flex-col items-center justify-center text-center space-y-4">
                                <Video className="w-8 h-8 text-foreground/10" />
                                <div className="space-y-2">
                                    <div className="text-sm font-serif text-foreground/40 italic">No meetings yet</div>
                                    <p className="text-[9px] text-foreground/20 font-medium">Your meetings will appear here after they're recorded.</p>
                                </div>
                            </div>
                        )}
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
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                                    <Calendar className="w-3 h-3" />
                                    <span>Intelligence</span>
                                </div>
                                <h3 className="text-2xl font-serif">Upcoming Meetings</h3>
                            </div>
                            <button onClick={() => setActiveTab('scheduler')} className="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5">
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
                                    <p className="text-[9px] text-foreground/20 font-medium">Schedule your next meeting in the Calendar tab</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cross-Meeting Insights */}
                    <div className="space-y-6">
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
                
                <div className="pt-10 border-t border-border mt-10 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="p-8 rounded-[40px] bg-primary/5 border border-primary/20 space-y-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
                                <div className="relative z-10 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary font-bold">Invite Code</span>
                                        <Shield className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <code className="text-4xl font-mono font-black text-primary tracking-widest">{organization.join_code}</code>
                                        <button onClick={copyCode} className="p-3 rounded-2xl bg-primary text-background hover:scale-105 transition-all active:scale-95">
                                            {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] font-bold text-primary/40 leading-tight italic">Share this code to invite team members to your company.</p>
                                </div>
                            </div>

                            <div className="p-8 rounded-[40px] bg-surface-low border border-border space-y-6">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/30 font-bold">
                                    <Settings className="w-3 h-3" />
                                    <span>Company Settings</span>
                                </div>
                                <div className="space-y-3">
                                    <button 
                                        onClick={handleDeleteCompany}
                                        disabled={userProfile?.role !== 'ceo'}
                                        className="w-full py-4 px-6 rounded-2xl bg-red-500/5 border border-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        Delete Company
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-3 space-y-8">
                            {/* Invite Members Section */}
                            <div className="p-10 rounded-[48px] bg-surface-low border border-border space-y-10 group hover:bg-surface-low transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest italic">
                                            <Mail className="w-3 h-3" />
                                            <span>Invitation System</span>
                                        </div>
                                        <h3 className="text-4xl font-serif">Invite Member</h3>
                                        <p className="text-foreground/30 text-xs italic font-medium">Bypass join codes by sending a direct invite link.</p>
                                    </div>
                                </div>

                                <form onSubmit={handleInviteMember} className="space-y-6">
                                    {!canInvite ? (
                                        <div className="p-6 rounded-3xl bg-surface-low border border-dashed border-border flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-foreground/20 italic">
                                            Permission Denied: Only CEOs and Managers can send invites.
                                        </div>
                                    ) : (
                                        <div className="space-y-2 group">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Member Email Address</label>
                                            <div className="flex flex-col md:flex-row gap-4">
                                                <input
                                                    type="email"
                                                    required
                                                    placeholder="EX: director@company.com"
                                                    value={inviteEmail}
                                                    onChange={(e) => setInviteEmail(e.target.value)}
                                                    className="flex-1 h-16 px-6 rounded-2xl bg-surface-low border border-border focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                                />
                                                <button 
                                                    disabled={isInviting}
                                                    className="h-16 px-10 bg-primary hover:bg-primary/90 text-background rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 min-w-[200px]"
                                                >
                                                    {isInviting ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                                    <span>Invite</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {activeInviteLink && (
                                        <div className="p-6 rounded-3xl bg-primary/5 border border-primary/20 space-y-4 animate-in slide-in-from-top-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary italic font-bold">Direct Invitation Link:</p>
                                            <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-border group/link">
                                                <code className="flex-1 text-[10px] text-foreground/60 truncate">{activeInviteLink}</code>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(activeInviteLink);
                                                        alert('Link copied to clipboard!');
                                                    }}
                                                    className="p-2 rounded-lg hover:bg-surface-highest/40 text-primary transition-all active:scale-90"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <p className="text-[8px] text-foreground/20 italic font-bold uppercase tracking-widest">Share this link with them. They will join {organization?.name} instantly on signup.</p>
                                        </div>
                                    )}
                                </form>
                            </div>

                            {/* Pending Join Requests (Moderation) */}
                            {joinRequests.length > 0 && (
                                <div className="space-y-6 p-10 rounded-[48px] bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-4">
                                    <div className="flex items-center gap-3">
                                        <ShieldAlert className="w-6 h-6 text-primary" />
                                        <div>
                                            <h3 className="text-xl font-serif text-primary">Pending Approvals</h3>
                                            <p className="text-[10px] text-primary/40 font-black uppercase tracking-widest italic">New members waiting to enter {organization.name}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {joinRequests.map((req: any) => (
                                            <div key={req.id} className="p-6 rounded-3xl bg-background border border-primary/20 flex items-center justify-between group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                                        <UserCircle className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-foreground/90 font-serif">{req.profiles?.display_name || req.profiles?.email.split('@')[0]}</div>
                                                        <div className="text-[10px] text-foreground/20 italic font-bold tracking-widest uppercase">{req.profiles?.email}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleModerateRequest(req.id, 'reject')}
                                                        className="px-6 py-3 rounded-xl hover:bg-red-500/10 text-foreground/20 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        Decline
                                                    </button>
                                                    <button 
                                                        onClick={() => handleModerateRequest(req.id, 'approve')}
                                                        className="px-8 py-3 bg-primary text-background rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95"
                                                    >
                                                        Approve Access
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-8">
                                <h2 className="text-3xl font-serif">Member List</h2>
                                <div className="px-4 py-2 rounded-full border border-border text-[10px] font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    {members.length} Team Members
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {members.map((member) => {
                                    const boardRole = member.board_role || 'director';
                                    const roleLabel = BOARD_ROLES[boardRole] || boardRole;
                                    const roleColor = BOARD_ROLE_COLORS[boardRole] || 'bg-surface-highest/20 text-foreground/40';
                                    const isEditingRole = editingMemberId === member.id;
                                    const isOwnCard = member.id === (userProfile?.id || "");

                                    return (
                                        <div key={member.id} className="p-8 rounded-[48px] border border-border bg-surface-low hover:bg-surface-high transition-all group flex flex-col gap-6 relative overflow-hidden">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-14 h-14 rounded-[24px] bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                        <UserCircle className="w-8 h-8" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-xl text-foreground/90">{member.username || member.display_name || member.email.split('@')[0]}</h3>
                                                        <div className="text-[10px] text-foreground/20 italic font-bold tracking-widest uppercase">{member.email}</div>
                                                    </div>
                                                </div>
                                                {canManageRoles && !isOwnCard && (
                                                    <button onClick={() => handleRevokeSeat(member.id)} className="p-3 rounded-xl hover:bg-red-500/10 text-foreground/10 hover:text-red-500 transition-all group/btn">
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-border flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {editingRoleMemberId === member.id ? (
                                                            <select
                                                                value={member.role}
                                                                onChange={(e) => handleOrgRoleChange(member.id, e.target.value)}
                                                                onBlur={() => setEditingRoleMemberId(null)}
                                                                autoFocus
                                                                className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-2xl bg-primary/20 border border-primary/20 text-primary outline-none cursor-pointer"
                                                            >
                                                                {Object.entries(APP_ROLES).map(([key, info]) => (
                                                                    <option key={key} value={key} className="bg-[#050505] text-foreground">{info.label}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span 
                                                                onClick={() => canManageRoles && setEditingRoleMemberId(member.id)}
                                                                className={`text-[9px] uppercase font-black tracking-widest px-3 py-1 rounded-full transition-all ${APP_ROLES[member.role as keyof typeof APP_ROLES]?.color || 'bg-surface-high text-foreground/20'} ${canManageRoles ? 'cursor-pointer hover:ring-2 hover:ring-white/20' : ''} flex items-center gap-1.5`}
                                                            >
                                                                {APP_ROLES[member.role as keyof typeof APP_ROLES]?.label || member.role}
                                                                {canManageRoles && <ChevronDown className="w-2.5 h-2.5" />}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {isOwnCard && <div className="absolute top-4 right-4 text-[8px] font-black uppercase tracking-widest text-primary italic">You</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

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
        </div>
    );
}
