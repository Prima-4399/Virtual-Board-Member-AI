"use client";

import BotControl from "@/components/BotControl";

export default function MeetingCenter() {
    return (
        <div className="p-8">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Boardroom Header */}
                <header className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-xs font-black uppercase tracking-[0.3em] text-primary whitespace-nowrap">Session Suite 01</span>
                        <div className="h-px flex-1 bg-white/5" />
                    </div>
                    <h1 className="text-5xl font-serif text-center text-foreground font-medium">Meeting Center</h1>
                    <p className="text-center text-foreground/40 max-w-xl mx-auto text-sm font-medium">
                        Initiate AI diarization, join live board sessions, and manage real-time executive transcription.
                    </p>
                </header>

                {/* Bot Control Module */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <BotControl />
                </div>
            </div>
        </div>
    );
}
