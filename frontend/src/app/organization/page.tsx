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

            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
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

        </div>
    );
}
