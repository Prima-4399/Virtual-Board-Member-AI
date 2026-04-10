"use client";

import { useState } from 'react';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Loader2, UserPlus, Mail, Lock } from 'lucide-react';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [isJoining, setIsJoining] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    const [username, setUsername] = useState('');

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // 1. Core Signup
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
            return;
        }

        if (authData.user) {
            // Update profile with username
            await supabase.from('profiles').update({ username }).eq('id', authData.user.id);

            // 2. Organization Logic
            if (isJoining) {
                // Link to existing org via code
                const { data: orgData, error: orgError } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('join_code', joinCode.toUpperCase())
                    .single();

                if (orgError) {
                    setError('Invalid Organization Code. Please contact your administrator.');
                    setLoading(false);
                    return;
                }

                await supabase.from('profiles').update({
                    organization_id: orgData.id,
                    role: 'member'
                }).eq('id', authData.user.id);
            } else {
                // Create new Org
                const { data: newOrg, error: newOrgError } = await supabase
                    .from('organizations')
                    .insert({
                        name: organizationName,
                        owner_id: authData.user.id,
                        join_code: Math.random().toString(36).substring(2, 8).toUpperCase()
                    })
                    .select()
                    .single();

                if (!newOrgError) {
                    await supabase.from('profiles').update({
                        organization_id: newOrg.id,
                        role: 'owner'
                    }).eq('id', authData.user.id);
                }
            }
            setSuccess(true);
        }
        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) setError(error.message);
    };

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
                    <ShieldCheck className="w-10 h-10" />
                </div>
                <div className="max-w-md space-y-4">
                    <h1 className="text-4xl font-serif font-medium text-foreground">Welcome to the Board</h1>
                    <p className="text-foreground/40 text-lg font-medium leading-relaxed">
                        Verification link sent to <span className="text-primary font-bold">{email}</span>. Click it to activate your seat in the suite.
                    </p>
                </div>
                <Link href="/login" className="flex items-center justify-center gap-2 px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-foreground/60 hover:text-foreground hover:bg-white/10 transition-all font-black text-[10px] uppercase tracking-widest tracking-tighter">
                    <span>Finalize Entrance</span>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 relative">
            <div className="max-w-md w-full space-y-10 py-12">
                {/* Branding */}
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-[24px] bg-primary/10 flex items-center justify-center text-primary mx-auto mb-8 ring-8 ring-primary/5">
                        <UserPlus className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl font-serif font-medium text-foreground">Boardroom Registration</h1>
                    <p className="text-foreground/40 text-sm font-medium italic">Secure your seat in the executive intelligence suite</p>
                </div>

                {/* Form Mode Toggle */}
                <div className="flex p-1 rounded-2xl bg-white/[0.02] border border-white/5">
                    <button
                        onClick={() => setIsJoining(true)}
                        className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${isJoining ? 'bg-primary text-background' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        Join Organization
                    </button>
                    <button
                        onClick={() => setIsJoining(false)}
                        className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${!isJoining ? 'bg-primary text-background' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        Create Organization
                    </button>
                </div>

                {/* Form */}
                <div className="space-y-6">
                    <form onSubmit={handleSignup} className="space-y-6">
                        {error && (
                            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500 text-sm">
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Org Field */}
                            {isJoining ? (
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 group-focus-within:text-foreground transition-colors italic">6-Digit Seat Code</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="EX: ABCDEF"
                                        value={joinCode}
                                        maxLength={6}
                                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                        className="w-full h-14 px-6 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground font-mono text-xl tracking-[0.5em] text-center outline-none transition-all placeholder:text-foreground/10"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 group-focus-within:text-foreground transition-colors italic">Company Identity</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="EX: Cogniify"
                                        value={organizationName}
                                        onChange={(e) => setOrganizationName(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                    />
                                </div>
                            )}

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic group-focus-within:text-foreground">Executive Username</label>
                                <div className="relative">
                                    <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="EX: manas_cogniify"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                                        className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all placeholder:text-foreground/10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic">Email Identifier</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input
                                        type="email"
                                        required
                                        placeholder="name@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic">Secure Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-primary focus:bg-white/[0.04] text-foreground outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            className="w-full h-14 bg-primary hover:bg-primary/95 text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>
                                    <span>{isJoining ? 'Secure Seat' : 'Launch Organization'}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 py-2">
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">or register with</span>
                        <div className="h-px flex-1 bg-white/5" />
                    </div>

                    {/* OAuth Area */}
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full h-14 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-center gap-4 transition-all group active:scale-95"
                    >
                        <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.33 0 3.305 2.722 1.34 6.691l3.926 3.074z" />
                            <path fill="#34A853" d="M12 24c3.079 0 5.861-1.011 8.005-2.725l-4.129-3.454C14.734 18.507 13.461 19.091 12 19.091c-2.883 0-5.334-1.948-6.204-4.577L1.87 17.583C3.834 21.552 7.859 24.274 12 24z" />
                            <path fill="#4285F4" d="M23.491 12.273c0-.827-.074-1.624-.21-2.394H12v4.524h6.442c-.279 1.472-1.11 2.722-2.361 3.56l4.129 3.454c2.413-2.222 3.845-5.485 3.845-9.144z" />
                            <path fill="#FBBC05" d="M5.796 14.514a7.076 7.076 0 0 1-.377-2.12c0-.736.13-1.442.366-2.094L1.86 7.227C.674 9.605 0 12.26 0 15c0 2.74.674 5.395 1.86 7.773l3.936-3.076a7.077 7.077 0 0 1-.365-2.183z" />
                        </svg>
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground/60">Executive Google Account</span>
                    </button>
                </div>

                <div className="text-center">
                    <p className="text-foreground/40 text-xs font-bold">
                        Already have access? {' '}
                        <Link href="/login" className="text-primary hover:underline underline-offset-4">Log into the Suite</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
