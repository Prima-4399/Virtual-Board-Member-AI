"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { LayoutDashboard, Database, Video, Settings, History, User, LogOut, Cpu, BookOpen } from 'lucide-react';

export default function Navbar() {
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const supabase = createClient();

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
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

    const navItems = [
        { name: 'Meeting Center', icon: Video, path: '/meeting', description: 'Live Board Session' },
        { name: 'Advisory Chat', icon: Cpu, path: '/chat', description: 'Consult AI Advisor' },
        { name: 'Meeting Ledger', icon: History, path: '/meetings', description: 'Session History' },
        { name: 'Shared Memory', icon: BookOpen, path: '/memory', description: 'RAG Knowledge' },
        { name: 'Executive Suite', icon: LayoutDashboard, path: '/organization', description: 'Board Governance' },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 h-20 border-b border-white/5 bg-background/80 backdrop-blur-xl z-50 px-8 flex items-center justify-between">
            <div className="flex items-center gap-12">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-background font-black text-xl shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                        VB
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tighter text-foreground leading-none">VIRTUAL BOARD</h1>
                        {user ? (
                            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">Intelligence Suite</span>
                        ) : (
                            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-foreground/40 italic">Lobby Access Only</span>
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
                                    : 'text-foreground/40 hover:text-foreground/60 hover:bg-white/5'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : 'text-foreground/20'}`} />
                                <div className="flex flex-col">
                                    <span className="text-xs font-black uppercase tracking-widest leading-tight">{item.name}</span>
                                    {isActive && <span className="text-[8px] uppercase tracking-[0.2em] font-black opacity-60">Status: Active</span>}
                                </div>
                                {isActive && (
                                    <div className="absolute -bottom-[22px] left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full shadow-[0_0_12px_rgba(26,77,46,0.5)]" />
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
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1 text-right">Chairman Active</span>
                            <span className="text-[9px] font-medium text-foreground/20 font-mono tracking-tighter text-right italic">{user.email}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-foreground/40 transition-all group"
                            title="Deactivate Board Access"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Link href="/login" className="px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-widest text-foreground hover:bg-white/5 transition-all">Login</Link>
                        <Link href="/signup" className="px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-widest bg-primary text-background hover:bg-primary/95 transition-all">Register</Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
