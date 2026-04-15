"use client";

import { useState } from 'react';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, ArrowRight, Loader2, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let loginEmail = identifier;

        // Resolve username if not an email
        if (!identifier.includes('@')) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier.toLowerCase())
                .single();

            if (profileError || !profile) {
                setError('User not found.');
                setLoading(false);
                return;
            }
            loginEmail = (profile as any).email;
        }

        const { error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.push('/');
            router.refresh();
        }
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

    return (
        <div className="flex flex-col lg:flex-row items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12 gap-8 relative max-w-7xl mx-auto">
            
            {/* Visual Branding Pane */}
            <div className="hidden lg:flex flex-col justify-between w-full lg:w-1/2 h-[700px] p-12 rounded-[48px] bg-surface-low border border-border relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 transition-transform group-hover:scale-150 duration-1000" />
                
                <div className="relative z-10 space-y-6">
                    <div className="w-16 h-16 rounded-[24px] bg-primary/10 border border-primary/20 flex flex-col items-center justify-center text-primary shadow-sm">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-5xl font-serif font-medium text-foreground tracking-tight leading-snug">Secure Board Access</h1>
                    <p className="text-foreground/60 text-lg font-medium max-w-sm">Log in to view executive summaries, upcoming meetings, and AI-driven board intelligence.</p>
                </div>
                
                <div className="relative z-10 grid grid-cols-2 gap-4">
                    <div className="p-6 rounded-[32px] bg-background/50 border border-border backdrop-blur-sm">
                        <ShieldAlert className="w-6 h-6 text-primary mb-4" />
                        <h4 className="text-sm font-bold text-foreground">Encrypted Vault</h4>
                        <p className="text-xs text-foreground/40 mt-1 font-medium">Bank-level security for sensitive documents.</p>
                    </div>
                    <div className="p-6 rounded-[32px] bg-background/50 border border-border backdrop-blur-sm">
                        <Lock className="w-6 h-6 text-primary mb-4" />
                        <h4 className="text-sm font-bold text-foreground">Role Based</h4>
                        <p className="text-xs text-foreground/40 mt-1 font-medium">Granular access control constraints.</p>
                    </div>
                </div>
            </div>

            {/* Form Pane */}
            <div className="w-full lg:w-1/2 max-w-md space-y-10 py-12 px-2">
                <div className="lg:hidden text-center space-y-6">
                    <div className="w-16 h-16 rounded-xl bg-surface-low border border-border flex items-center justify-center text-primary mx-auto mb-8 shadow-lg shadow-primary/5">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl font-serif font-medium text-foreground tracking-tight">Login</h1>
                    <p className="text-foreground/40 text-sm font-medium italic font-serif">Access your company dashboard</p>
                </div>
                <div className="space-y-6">
                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500 text-sm animate-in fade-in zoom-in-95">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic group-focus-within:text-foreground transition-colors font-bold">Email or Username</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Email or Username"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 rounded-xl bg-surface-low border border-border focus:border-primary focus:bg-surface-high text-foreground outline-none transition-all placeholder:text-foreground/10 shadow-sm"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 italic font-bold">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 rounded-xl bg-surface-low border border-border focus:border-primary focus:bg-surface-high text-foreground outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            className="w-full h-14 bg-primary hover:bg-primary/95 text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>
                                    <span>Login</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 py-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">or continue with</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* OAuth Area */}
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full h-14 rounded-xl border border-border bg-surface-low hover:bg-surface-high flex items-center justify-center gap-4 transition-all group active:scale-95 shadow-sm"
                    >
                        <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.33 0 3.305 2.722 1.34 6.691l3.926 3.074z" />
                            <path fill="#34A853" d="M12 24c3.079 0 5.861-1.011 8.005-2.725l-4.129-3.454C14.734 18.507 13.461 19.091 12 19.091c-2.883 0-5.334-1.948-6.204-4.577L1.87 17.583C3.834 21.552 7.859 24.274 12 24z" />
                            <path fill="#4285F4" d="M23.491 12.273c0-.827-.074-1.624-.21-2.394H12v4.524h6.442c-.279 1.472-1.11 2.722-2.361 3.56l4.129 3.454c2.413-2.222 3.845-5.485 3.845-9.144z" />
                            <path fill="#FBBC05" d="M5.796 14.514a7.076 7.076 0 0 1-.377-2.12c0-.736.13-1.442.366-2.094L1.86 7.227C.674 9.605 0 12.26 0 15c0 2.74.674 5.395 1.86 7.773l3.936-3.076a7.077 7.077 0 0 1-.365-2.183z" />
                        </svg>
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground/60">Google Account</span>
                    </button>
                </div>

                <div className="text-center">
                    <p className="text-foreground/40 text-xs font-bold">
                        Don't have an account? {' '}
                        <Link href="/signup" className="text-primary hover:underline underline-offset-4">Create an account</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
