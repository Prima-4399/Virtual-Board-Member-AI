"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { ShieldAlert, Cpu } from 'lucide-react';
import Link from 'next/link';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    deniedRoles?: string[];
}

export default function RoleGuard({ children, allowedRoles, deniedRoles }: RoleGuardProps) {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const checkRole = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                setRole(profile?.role || 'developer');
            }
            setLoading(false);
        };
        checkRole();
    }, [supabase]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    const isDenied = (deniedRoles && role && deniedRoles.includes(role)) || 
                     (allowedRoles && role && !allowedRoles.includes(role));

    if (isDenied) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-6 text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
                <div className="w-24 h-24 rounded-[32px] bg-red-500/10 flex items-center justify-center text-red-500 ring-8 ring-red-500/5">
                    <ShieldAlert className="w-12 h-12" />
                </div>
                <div className="space-y-4 max-w-md">
                    <h1 className="text-4xl font-serif font-medium">Access Restricted</h1>
                    <p className="text-foreground/40 text-sm font-medium italic">
                        Your current role ({role?.toUpperCase()}) does not have permission to access this executive module.
                    </p>
                </div>
                <Link 
                    href="/chat" 
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-background rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95"
                >
                    <Cpu className="w-4 h-4" />
                    Return to AI Assistant
                </Link>
            </div>
        );
    }

    return <>{children}</>;
}
