"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { Shield, Users, Copy, CheckCircle2, RotateCcw, UserCircle, Briefcase, LayoutDashboard, Settings, ShieldAlert, ChevronDown, Pencil, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const BOARD_ROLES: Record<string, string> = {
    board_chair: 'Board Chair',
    director: 'Director',
    company_secretary: 'Company Secretary',
    legal_compliance: 'Legal & Compliance',
    ceo_exec: 'CEO/Executive'
};

const BOARD_ROLE_COLORS: Record<string, string> = {
    board_chair: 'bg-amber-500/20 text-amber-400',
    director: 'bg-primary/20 text-primary',
    company_secretary: 'bg-blue-500/20 text-blue-400',
    legal_compliance: 'bg-purple-500/20 text-purple-400',
    ceo_exec: 'bg-emerald-500/20 text-emerald-400'
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
    const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
    const [displayNameInput, setDisplayNameInput] = useState('');

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
            }
        } catch (err: any) {
            console.error('Boardroom Persistence Error:', err);
            setError(err.message || 'Governance Sync Interrupted');
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
            if (!session?.user?.id) throw new Error("Executive Seat Verification Failed.");

            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('id')
                .eq('join_code', newJoinCode.toUpperCase())
                .maybeSingle();

            if (orgError) throw orgError;
            if (!orgData) throw new Error("Seat Code Expired or Invalid.");

            const { error: updateError } = await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                organization_id: orgData.id,
                role: 'member'
            });

            if (updateError) throw updateError;
            await loadData();
        } catch (err: any) {
            setError(err.message);
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
                if (newOrgError.code === '23505') throw new Error("This Identity is already registered in our boardroom.");
                throw newOrgError;
            }

            // 2. Assign Executive Seat
            const { error: updateError } = await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                organization_id: newOrg.id,
                role: 'owner'
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
            await axios.patch(`${BACKEND_URL}/api/profiles/${memberId}/board-role`, { board_role: newRole });
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, board_role: newRole } : m));
            setEditingMemberId(null);
        } catch (err: any) {
            console.error('Failed to update board role:', err);
        }
    };

    const handleDisplayNameSave = async (memberId: string) => {
        try {
            await axios.patch(`${BACKEND_URL}/api/profiles/${memberId}/board-role`, { display_name: displayNameInput || null });
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, display_name: displayNameInput || null } : m));
            setEditingDisplayName(null);
        } catch (err: any) {
            console.error('Failed to update display name:', err);
        }
    };

    const canEditRoles = userProfile?.role === 'owner' || userProfile?.role === 'admin';

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
                    <h1 className="text-4xl font-serif font-medium text-foreground">Governance Gate</h1>
                    <p className="text-foreground/40 text-sm font-medium italic">You are currently unassigned.</p>
                </div>

                <div className="flex p-1 rounded-2xl bg-white/[0.02] border border-white/5">
                    <button
                        onClick={() => setIsJoining(true)}
                        className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${isJoining ? 'bg-primary text-background' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        Join Boardroom
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

                    {isJoining ? (
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">6-Digit Seat Code</label>
                            <input
                                type="text"
                                required
                                placeholder="EX: ABCDEF"
                                value={newJoinCode}
                                maxLength={6}
                                onChange={(e) => setNewJoinCode(e.target.value.toUpperCase())}
                                className="w-full h-14 px-6 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground font-mono text-xl tracking-[0.5em] text-center outline-none transition-all placeholder:text-foreground/10"
                            />
                        </div>
                    ) : (
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Corporate Identity</label>
                            <input
                                type="text"
                                required
                                placeholder="EX: Cogniify"
                                value={newOrgName}
                                onChange={(e) => setNewOrgName(e.target.value)}
                                className="w-full h-14 px-6 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                            />
                        </div>
                    )}

                    <button disabled={loading} className="w-full h-14 bg-primary hover:bg-primary/95 text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
                        {loading ? <RotateCcw className="w-5 h-5 animate-spin" /> : (
                            <span>{isJoining ? 'Finalize Seat' : 'Launch Organization'}</span>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-12 animate-in fade-in duration-1000">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/5 pb-12">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-primary uppercase font-black tracking-[0.3em] text-[10px]">
                        <LayoutDashboard className="w-4 h-4" />
                        <span>Corporate Suite</span>
                    </div>
                    <h1 className="text-6xl font-serif font-medium">{organization.name}</h1>
                    <p className="text-foreground/40 font-medium font-black italic uppercase tracking-widest text-[10px]">Boardroom Intelligence Suite & Member Directory</p>
                </div>

                <div className="p-6 rounded-[24px] bg-white/[0.01] border border-white/5 space-y-3 min-w-[320px] relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/40 font-bold">Boardroom Join Code</span>
                            <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <code className="text-4xl font-mono font-black text-primary tracking-widest">{organization.join_code}</code>
                            <button
                                onClick={copyCode}
                                className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-background transition-all active:scale-95"
                            >
                                {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            </button>
                        </div>
                        <p className="mt-4 text-[9px] font-bold text-foreground/20 leading-tight italic">Share this unique code to invite executive members to your boardroom.</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="p-6 rounded-[32px] bg-white/[0.01] border border-white/5 space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60 font-bold">
                            <Settings className="w-3 h-3" />
                            <span>Suite Settings</span>
                        </div>
                        <div className="space-y-3">
                            <button className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-foreground/40 hover:text-foreground hover:bg-white/10 transition-all text-left">
                                Manage Subscription
                            </button>
                            <button className="w-full py-3 px-4 rounded-xl bg-red-500/5 border border-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all text-left">
                                Dissolve Organization
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-3 space-y-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-serif font-medium">Boardroom Members</h2>
                            <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary">
                                {members.length} Registered Executive Seats
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {members.map((member) => {
                            const boardRole = member.board_role || 'director';
                            const roleLabel = BOARD_ROLES[boardRole] || boardRole;
                            const roleColor = BOARD_ROLE_COLORS[boardRole] || 'bg-white/5 text-foreground/40';
                            const isEditingRole = editingMemberId === member.id;
                            const isEditingName = editingDisplayName === member.id;
                            const isOwnCard = member.id === (userProfile?.id || "");

                            return (
                                <div key={member.id} className="p-6 rounded-[32px] border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all group flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-[20px] bg-primary/5 flex items-center justify-center text-primary/40 group-hover:text-primary transition-colors">
                                        <UserCircle className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-bold text-foreground/80">{member.username || member.email}</h3>
                                            <span className={`text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${member.role === 'owner' ? 'bg-white/10 text-foreground/30' : 'bg-white/5 text-foreground/20'}`}>
                                                {member.role}
                                            </span>
                                        </div>

                                        {/* Board Role Badge */}
                                        <div className="flex items-center gap-2">
                                            {isEditingRole ? (
                                                <select
                                                    value={boardRole}
                                                    onChange={(e) => handleBoardRoleChange(member.id, e.target.value)}
                                                    onBlur={() => setEditingMemberId(null)}
                                                    autoFocus
                                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-foreground outline-none cursor-pointer"
                                                >
                                                    {Object.entries(BOARD_ROLES).map(([key, label]) => (
                                                        <option key={key} value={key} className="bg-background text-foreground">{label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span
                                                    className={`text-[10px] uppercase font-black tracking-widest px-3 py-1 rounded-full ${roleColor} ${canEditRoles ? 'cursor-pointer hover:ring-1 hover:ring-white/20' : ''} transition-all flex items-center gap-1.5`}
                                                    onClick={() => canEditRoles && setEditingMemberId(member.id)}
                                                >
                                                    {roleLabel}
                                                    {canEditRoles && <ChevronDown className="w-2.5 h-2.5" />}
                                                </span>
                                            )}
                                        </div>

                                        {/* Display Name (Meeting Identity) */}
                                        <div className="flex items-center gap-2">
                                            {isEditingName ? (
                                                <div className="flex items-center gap-1.5 w-full">
                                                    <input
                                                        type="text"
                                                        value={displayNameInput}
                                                        onChange={(e) => setDisplayNameInput(e.target.value)}
                                                        placeholder="e.g. Jane Smith"
                                                        autoFocus
                                                        className="flex-1 text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-foreground outline-none focus:border-primary"
                                                    />
                                                    <button onClick={() => handleDisplayNameSave(member.id)} className="p-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all">
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => setEditingDisplayName(null)} className="p-1 rounded-lg bg-white/5 text-foreground/40 hover:text-foreground transition-all">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-foreground/30 italic">
                                                        {member.display_name ? `Meeting ID: ${member.display_name}` : 'No meeting display name set'}
                                                    </span>
                                                    {(canEditRoles || isOwnCard) && (
                                                        <button
                                                            onClick={() => { setEditingDisplayName(member.id); setDisplayNameInput(member.display_name || ''); }}
                                                            className="p-0.5 rounded text-foreground/20 hover:text-primary transition-all"
                                                        >
                                                            <Pencil className="w-2.5 h-2.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-[10px] text-foreground/20 font-medium italic">{member.email}</p>
                                        {isOwnCard && (
                                            <div className="text-[9px] italic text-primary font-black uppercase tracking-widest">Your Executive Identity</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
