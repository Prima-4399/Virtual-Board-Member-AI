"use client";

import Link from 'next/link';
import { Video, Database, ArrowRight, BrainCircuit, ShieldCheck, Zap, History } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl w-full flex flex-col items-center text-center space-y-16 py-12 relative z-10">
        {/* Hero Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full border border-white/5 bg-white/5 w-fit mx-auto">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] uppercase font-black tracking-widest text-primary">Boardroom Intelligence Suite 1.0</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-serif font-medium tracking-tight text-foreground/90">
            The Future of <br />
            <span className="text-primary italic">Board Meetings</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-foreground/40 font-medium">
            Securely transcribe, analyze, and cross-reference your corporate history with an AI-powered executive companion.
          </p>
        </div>

        {/* Main Action Hub */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {/* Suite 01: Meeting Center */}
          <Link href="/meeting" className="group relative p-8 rounded-[40px] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 overflow-hidden text-left h-[320px] flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-all group-hover:scale-150 group-hover:bg-primary/20" />

            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                <Video className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-3xl font-serif font-medium text-foreground">Meeting Center</h2>
                <p className="text-foreground/40 text-sm mt-1">Live Meeting Bots & Executive Diarization</p>
              </div>
            </div>

            <div className="flex items-center justify-between font-sans">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-xs font-bold text-foreground/60">
                  <Zap className="w-3 h-3 text-primary" /> Active Bots
                </li>
                <li className="flex items-center gap-2 text-xs font-bold text-foreground/60">
                  <BrainCircuit className="w-3 h-3 text-primary" /> Real-time Transcription
                </li>
              </ul>
              <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary group-hover:text-background transition-all duration-500">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </Link>

          {/* Suite 02: Institutional Memory */}
          <Link href="/memory" className="group relative p-8 rounded-[40px] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 overflow-hidden text-left h-[320px] flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-all group-hover:scale-150 group-hover:bg-primary/20" />

            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                <Database className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-3xl font-serif font-medium text-foreground">Institutional Memory</h2>
                <p className="text-foreground/40 text-sm mt-1">Cross-Reference Archive & RAG Search</p>
              </div>
            </div>

            <div className="flex items-center justify-between font-sans">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-xs font-bold text-foreground/60">
                  <History className="w-3 h-3 text-primary" /> Historical Archive
                </li>
                <li className="flex items-center gap-2 text-xs font-bold text-foreground/60">
                  <ShieldCheck className="w-3 h-3 text-primary" /> Verified Search
                </li>
              </ul>
              <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary group-hover:text-background transition-all duration-500">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
