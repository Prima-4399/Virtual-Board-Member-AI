"use client";

import Link from 'next/link';
import { Video, Database, ArrowRight, BrainCircuit, ShieldCheck, Zap, History } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 relative overflow-hidden bg-background">
      {/* Background Decoration */}
      <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none opacity-50" />
      <div className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none opacity-50" />

      <div className="max-w-6xl w-full flex flex-col items-center text-center space-y-16 py-12 relative z-10">
        {/* Hero Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full border border-border bg-surface-low w-fit mx-auto shadow-sm">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] uppercase font-black tracking-widest text-primary">AI Meeting Assistant 1.0</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-serif font-medium tracking-tight text-foreground/90 leading-[0.9]">
            The Future of <br />
            <span className="text-primary italic">Team Meetings</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-foreground/40 font-medium font-serif italic">
            Transcribe, search, and analyze your meetings with a smart AI helper.
          </p>
        </div>

        {/* Main Action Hub */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
          {/* Suite 01: Meeting Center */}
          <Link href="/meeting" className="group relative p-10 rounded-2xl border border-border bg-surface-low hover:bg-surface-high transition-all duration-500 overflow-hidden text-left h-[340px] flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-primary/5">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-all group-hover:scale-150 group-hover:bg-primary/20" />

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-xl border border-border bg-background flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm">
                <Video className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-3xl font-serif font-medium text-foreground">Meeting Center</h2>
                <p className="text-foreground/40 text-sm mt-1 font-medium font-serif italic">Meeting Recorder & Speaker ID</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-foreground/60">
                  <Zap className="w-3 h-3 text-primary" /> Recording Bots
                </li>
                <li className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-foreground/60">
                  <BrainCircuit className="w-3 h-3 text-primary" /> Live Notes
                </li>
              </ul>
              <div className="w-14 h-14 rounded-full border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary group-hover:text-background transition-all duration-500 shadow-sm">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>

          {/* Suite 02: Institutional Memory */}
          <Link href="/memory" className="group relative p-10 rounded-2xl border border-border bg-surface-low hover:bg-surface-high transition-all duration-500 overflow-hidden text-left h-[340px] flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-primary/5">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-all group-hover:scale-150 group-hover:bg-primary/20" />

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-xl border border-border bg-background flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm">
                <Database className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-3xl font-serif font-medium text-foreground">Knowledge Base</h2>
                <p className="text-foreground/40 text-sm mt-1 font-medium font-serif italic">Search Past Meetings & Files</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-foreground/60">
                  <History className="w-3 h-3 text-primary" /> Past Meetings
                </li>
                <li className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-foreground/60">
                  <ShieldCheck className="w-3 h-3 text-primary" /> Accurate Answers
                </li>
              </ul>
              <div className="w-14 h-14 rounded-full border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary group-hover:text-background transition-all duration-500 shadow-sm">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
