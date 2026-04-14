"use client";

import BotControl from "@/components/BotControl";
import RoleGuard from "@/components/RoleGuard";

export default function MeetingCenter() {
    return (
        <RoleGuard deniedRoles={['intern']}>
            <div className="p-8">
                <div className="max-w-6xl mx-auto space-y-12">
                    {/* Boardroom Header */}
                    <header className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary whitespace-nowrap">Meeting Room 01</span>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <h1 className="text-6xl font-serif text-center text-foreground font-medium tracking-tight">Meeting Center</h1>
                        <p className="text-center text-foreground/40 max-w-xl mx-auto text-sm font-medium font-serif italic">
                            Record your meeting, get a live transcript, and let the AI take notes.
                        </p>
                    </header>

                    {/* Bot Control Module */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <BotControl />
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
