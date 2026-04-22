"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { LayoutDashboard, Database, Video, Settings, History, User, LogOut, Cpu, BookOpen, Sun, Moon } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function Navbar() {
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const supabase = createClient();

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            // AUTO-CLAIM INVITATION ON EVERY NAVIGATION
            if (currentUser) {
                try {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('organization_id')
                        .eq('id', currentUser.id)
                        .single();

                    // FIRING even if profile is missing (!profile) or has no org
                    if (!profile || !profile.organization_id) {
                        const { data: claimData } = await axios.post(`${BACKEND_URL}/api/organizations/claim-invite`, {
                            userId: currentUser.id,
                            email: currentUser.email
                        });
                        if (claimData.success) {
                            window.location.reload();
                        }
                    }
                } catch (err) {
                    // Silently fail if no invite or other issue
                }
            }
        };

        getSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [supabase.auth]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const [userRole, setUserRole] = useState<string | null>(null);
    const [brand, setBrand] = useState<{name: string, logo: string | null, isAma: boolean}>({ name: 'COGNIIFY', logo: '/cogniify_logo.png', isAma: false });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname.toLowerCase();
            if (hostname.includes('persistent')) {
                setBrand({ name: 'PERSISTENT', logo: '/persistent_logo.png', isAma: false });
            } else if (hostname.includes('ama')) {
                setBrand({ name: 'AMA GLOBAL', logo: null, isAma: true });
            } else {
                setBrand({ name: 'COGNIIFY', logo: '/cogniify_logo.png', isAma: false });
            }
        }
    }, []);


    useEffect(() => {
        const getProfile = async () => {
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                setUserRole(profile?.role || null);
            }
        };
        getProfile();
    }, [user, supabase]);

    const navItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', description: 'Overview' },
        { name: 'Meeting Center', icon: Video, path: '/meeting', description: 'Live meetings' },
        { name: 'AI Assistant', icon: Cpu, path: '/chat', description: 'Talk to AI' },
        { name: 'Past Meetings', icon: History, path: '/meetings', description: 'See history' },
        { name: 'Documents', icon: BookOpen, path: '/memory', description: 'Your files' },
        { name: 'Settings', icon: Settings, path: '/organization', description: 'Account & Team' },
    ].filter(item => {
        if (userRole === 'intern') {
            return item.path === '/chat' || item.path === '/organization';
        }
        return true;
    });

    return (
        <nav className="fixed top-0 left-0 right-0 h-20 border-b border-border bg-background/80 backdrop-blur-xl z-50 px-8 flex items-center justify-between">
            <div className="flex items-center gap-12">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-3 group">
                    {brand.logo && (
                        <img
                            src={brand.logo}
                            alt={brand.name}
                            className="w-10 h-10 rounded-xl shadow-lg shadow-primary/20 transition-transform group-hover:scale-105 object-contain"
                        />
                    )}
                    <div className="flex flex-col gap-1">
                        <h1
                            className="text-base font-bold tracking-tight leading-none"
                            style={brand.isAma ? { color: '#00AEEF', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, letterSpacing: '-0.025em' } : {}}
                        >
                            {!brand.isAma && <span className="font-black tracking-tighter text-foreground">{brand.name}</span>}
                            {brand.isAma && brand.name}
                        </h1>
                        {user ? (
                            <span
                                className="text-[10px] font-semibold uppercase leading-none"
                                style={brand.isAma ? { fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', letterSpacing: '0.05em', marginTop: '0.25rem' } : { letterSpacing: '0.2em' }}
                            >
                                <span className={brand.isAma ? 'text-foreground/50' : 'text-primary'}>{userRole ? userRole.toUpperCase() : 'AI Helper'}</span>
                            </span>
                        ) : (
                            <span
                                className="text-[10px] font-semibold uppercase italic leading-none"
                                style={brand.isAma ? { fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', letterSpacing: '0.05em', marginTop: '0.25rem' } : { letterSpacing: '0.2em' }}
                            >
                                <span className={brand.isAma ? 'text-foreground/40' : 'text-foreground/40'}>Please Log In</span>
                            </span>
                        )}
                    </div>
                </Link>

                {/* Primary Nav Items */}
                <div className="hidden md:flex items-center gap-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`flex items-center gap-3 px-6 py-2.5 rounded-2xl transition-all duration-300 relative group ${isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-foreground/40 hover:text-foreground/60 hover:bg-surface-highest/20'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : 'text-foreground/20'}`} />
                                <div className="flex flex-col">
                                    <span className="text-xs font-black uppercase tracking-widest leading-tight">{item.name}</span>
                                    {isActive && <span className="text-[8px] uppercase tracking-[0.2em] font-black opacity-60">Status: Active</span>}
                                </div>
                                {isActive && (
                                    <div className="absolute -bottom-[22px] left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full shadow-[0_0_12px_rgba(184,134,11,0.5)]" />
                                )}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Account/System Status */}
            <div className="flex items-center gap-4">
                {user ? (
                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex flex-col items-end">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1 text-right">Logged In</span>
                            <span className="text-[9px] font-medium text-foreground/20 font-mono tracking-tighter text-right italic">{user.email}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2.5 rounded-xl border border-border bg-surface-highest/20 hover:bg-red-500/10 hover:text-red-400 text-foreground/40 transition-all group"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Link href="/login" className="px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-widest text-foreground hover:bg-surface-highest/20 transition-all">Login</Link>
                        <Link href="/signup" className="px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-widest bg-primary text-background hover:bg-primary/95 transition-all">Register</Link>
                    </div>
                )}
                <ThemeToggle />
            </div>
        </nav>
    );
}
