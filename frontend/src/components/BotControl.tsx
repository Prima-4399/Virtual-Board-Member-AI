'use client'
import { useState, useEffect } from 'react'
import { Video, Database, Cpu, LogOut, Plus, ChevronRight, ShieldCheck, BookOpen, History, CheckCircle, Clock, User } from 'lucide-react'
import axios from 'axios'
import { createClient } from '@/utils/supabase'
const BACKEND_URL = 'http://localhost:3001'

interface TranscriptWord {
    text: string
    start_timestamp: {
        relative: number
        absolute: string
    }
}

interface TranscriptEntry {
    participant: {
        name: string
    }
    words: TranscriptWord[]
}

export default function BotControl() {
    const [meetingUrl, setMeetingUrl] = useState('')
    const [botId, setBotId] = useState<string | null>(null)
    const [botStatus, setBotStatus] = useState<string | null>(null)
    const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [orgId, setOrgId] = useState<string | null>(null)
    const [minutes, setMinutes] = useState<string>('')
    const [actions, setActions] = useState<any[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [isExtractingActions, setIsExtractingActions] = useState(false)
    const [activeTab, setActiveTab] = useState<'transcript' | 'minutes' | 'actions'>('transcript')

    const supabase = createClient()

    useEffect(() => {
        const getOrg = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', session.user.id)
                    .single()
                if (profile?.organization_id) setOrgId(profile.organization_id)
            }
        }
        getOrg()
    }, [supabase])

    const startBot = async () => {
        setLoading(true)
        setError(null)
        setBotId(null)
        setBotStatus(null)
        setTranscript(null)

        if (!orgId) {
            setError('Account not linked to an organization. Please join one first.')
            setLoading(false)
            return
        }

        try {
            const response = await axios.post(`${BACKEND_URL}/api/bot`, {
                meeting_url: meetingUrl,
                organization_id: orgId,
                mode: 'prioritize_low_latency' // Default to low latency for real-time feel
            })
            setBotId(response.data.id)
            setBotStatus('starting')
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to start bot')
        } finally {
            setLoading(false)
        }
    }

    const generateAIMinutes = async () => {
        if (!botId) return
        setIsGenerating(true)
        try {
            const res = await axios.post(`${BACKEND_URL}/api/bot/${botId}/minutes`)
            setMinutes(res.data.minutes)
            setActiveTab('minutes')
        } catch (err: any) {
            console.error('Failed to generate minutes:', err)
            const detail = err.response?.data?.error || err.response?.data?.detail || err.message
            alert(`Strategic Advisor Error: ${detail}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const saveManualMinutes = async () => {
        // Find meeting ID by botId
        const { data: meeting } = await supabase.from('meetings').select('id').eq('recall_bot_id', botId).maybeSingle();
        if (meeting) {
            await axios.patch(`${BACKEND_URL}/api/meetings/${meeting.id}/minutes`, { minutes });
        }
    }

    const extractActionItems = async () => {
        if (!botId) return
        setIsExtractingActions(true)
        try {
            const res = await axios.post(`${BACKEND_URL}/api/bot/${botId}/actions`)
            setActions(res.data.actions || [])
            setActiveTab('actions')
        } catch (err: any) {
            console.error('Failed to extract actions:', err)
        } finally {
            setIsExtractingActions(false)
        }
    }

    const toggleActionStatus = async (index: number) => {
        const newActions = [...actions]
        newActions[index].status = newActions[index].status === 'done' ? 'pending' : 'done'
        setActions(newActions)
        
        const { data: meeting } = await supabase.from('meetings').select('id').eq('recall_bot_id', botId).maybeSingle();
        if (meeting) {
            await axios.patch(`${BACKEND_URL}/api/meetings/${meeting.id}/actions`, { actions: newActions });
        }
    }

    useEffect(() => {
        let interval: any
        if (botId) {
            console.log(`[POLLING] Started status sync for bot: ${botId}`)
            interval = setInterval(async () => {
                try {
                    const statusRes = await axios.get(`${BACKEND_URL}/api/bot/${botId}`)
                    const newStatus = statusRes.data.status
                    console.log(`[STATUS SYNC] Bot: ${botId} is currently: ${newStatus}`)
                    setBotStatus(newStatus)

                    // Fetch transcript even during recording for live feel
                    if (newStatus !== 'fatal' && newStatus !== 'starting') {
                        const transRes = await axios.get(`${BACKEND_URL}/api/bot/${botId}/transcript`)
                        if (transRes.data && Array.isArray(transRes.data) && transRes.data.length > 0) {
                            setTranscript(transRes.data)
                        }
                    }

                    if (newStatus === 'done' || newStatus === 'fatal') {
                        // One last fetch to ensure final segments
                        setTimeout(async () => {
                            const finalRes = await axios.get(`${BACKEND_URL}/api/bot/${botId}/transcript`)
                            if (finalRes.data && Array.isArray(finalRes.data) && finalRes.data.length > 0) {
                                setTranscript(finalRes.data)
                            }
                            // Auto-generate final outputs
                            generateAIMinutes()
                            extractActionItems()
                        }, 2000)
                        
                        clearInterval(interval)
                        console.log(`[POLLING] Sync complete for bot: ${botId}`)
                    }
                } catch (err) {
                    console.error('Error polling status:', err)
                }
            }, 5000)
        }
        return () => clearInterval(interval)
    }, [botId])

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8 animate-in fade-in duration-700">
            {/* Header / Stats Section */}
            {!botId && !transcript && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bento-panel flex flex-col items-center text-center">
                        <i className="fas fa-hourglass-half text-2xl text-primary/40 mb-4"></i>
                        <div className="text-2xl font-black text-primary">1,420</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted">Minutes Analyzed</div>
                    </div>
                    <div className="bento-panel flex flex-col items-center text-center">
                        <i className="fas fa-file-invoice text-2xl text-primary/40 mb-4"></i>
                        <div className="text-2xl font-black text-primary">4,290</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted">Transcripts Saved</div>
                    </div>
                    <div className="bento-panel flex flex-col items-center text-center">
                        <i className="fas fa-check-double text-2xl text-secondary/40 mb-4"></i>
                        <div className="text-2xl font-black text-secondary">128</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted">Action Items</div>
                    </div>
                </div>
            )}

            <div className="bento-panel shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21.355r7.106-7.106a12.066 12.066 0 001.907-3.045m-7.106 7.106l-7.106-7.106a12.066 12.066 0 01-1.907-3.045m7.106 7.106V11.355m0 0a3.001 3.001 0 110-6.002 3.001 3.001 0 010 6.002z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-foreground tracking-tight">Deploy Board Member</h2>
                        <p className="text-muted text-sm font-medium">Dispatch AI to record and diarize your board session.</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Enter meeting URL (Google Meet / Zoom / Teams)"
                            className="w-full bg-background border-b-2 border-muted/20 px-4 py-4 text-foreground outline-none focus:border-primary transition-all text-lg font-medium placeholder:text-muted/40"
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startBot}
                        disabled={loading || !meetingUrl}
                        className="w-full bg-primary text-primary-foreground py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-primary/20"
                    >
                        {loading ? 'Initializing Agent...' : 'Deploy Board Member'}
                    </button>

                    {error && <div className="p-4 bg-secondary/10 border border-secondary/30 text-secondary font-bold rounded-xl mb-4 animate-pulse text-sm">{error}</div>}

                    {botId && (
                        <div className="mt-8 pt-8 border-t border-muted/10 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Session ID</span>
                                <span className="text-xs text-foreground font-mono bg-surface-high px-3 py-1 rounded-full">{botId}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Meeting Phase</span>
                                <div className="flex flex-col items-end gap-3">
                                    <div className="flex items-center gap-2 px-3 py-1 bg-surface-high rounded-full">
                                        <div className={`w-2 h-2 rounded-full animate-pulse ${botStatus === 'done' ? 'bg-emerald-500' :
                                            botStatus === 'in_waiting_room' ? 'bg-secondary' :
                                                botStatus === 'recording' ? 'bg-red-500' : 'bg-primary'
                                            }`} />
                                        <span className="text-xs font-bold capitalize text-foreground">
                                            {botStatus?.replace(/_/g, ' ') || 'Initializing...'}
                                        </span>
                                    </div>
                                    
                                    {botStatus === 'recording' && (
                                        <div className="flex gap-2 items-center text-[10px] uppercase font-black tracking-widest text-primary animate-pulse">
                                            <Database className="w-3 h-3" />
                                            <span>Syncing to Institutional Ledger...</span>
                                        </div>
                                    )}

                                    {botId && botStatus !== 'done' && botStatus !== 'fatal' && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setBotId(null)
                                                    setBotStatus(null)
                                                    setTranscript(null)
                                                }}
                                                className="text-[10px] uppercase font-black tracking-widest px-3 py-1.5 bg-surface-high text-muted rounded hover:text-foreground transition-all active:scale-95"
                                            >
                                                Clear Dashboard
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await axios.post(`${BACKEND_URL}/api/bot/${botId}/leave`)
                                                        setBotStatus('leaving_call')
                                                    } catch (err) {
                                                        console.error('Failed to command bot to leave:', err)
                                                    }
                                                }}
                                                className="text-[10px] uppercase font-black tracking-widest px-3 py-1.5 bg-secondary text-secondary-foreground rounded hover:brightness-110 transition-all shadow-lg active:scale-95"
                                            >
                                                Leave Meeting
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {transcript && (
                <div className="bento-panel shadow-sm animate-in slide-in-from-bottom-8 duration-1000 min-h-[600px] flex flex-col">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-secondary-foreground shadow-lg shadow-secondary/20 font-black text-xs">
                                {activeTab === 'transcript' ? 'LIVE' : 'AI'}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-foreground tracking-tight">
                                    {activeTab === 'transcript' ? 'Boardroom Ledger' : 'Automated Minutes'}
                                </h2>
                                <p className="text-muted text-sm font-medium">
                                    {activeTab === 'transcript' ? 'Direct diarized stream of the active session.' : 'Structured AI summary of discussions and decisions.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2 bg-surface-high p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab('transcript')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'transcript' ? 'bg-background text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                            >
                                Transcript
                            </button>
                            <button
                                onClick={() => setActiveTab('minutes')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'minutes' ? 'bg-background text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                            >
                                AI Minutes
                            </button>
                            <button
                                onClick={() => setActiveTab('actions')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'actions' ? 'bg-background text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                            >
                                Actions
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto pr-4 custom-scrollbar">
                        {activeTab === 'transcript' ? (
                            transcript.map((entry: any, i: number) => (
                                <div key={i} className="group p-6 bg-background rounded-2xl border border-muted/5 hover:border-primary/20 transition-all">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-surface-highest flex items-center justify-center text-[10px] font-black text-primary">
                                                {entry.participant.name.charAt(0)}
                                            </div>
                                            <p className="font-extrabold text-sm text-primary uppercase tracking-widest">{entry.participant.name}</p>
                                        </div>
                                    </div>
                                    <p className="text-foreground/80 leading-relaxed text-md font-medium">
                                        {entry.words.map((w: any) => w.text).join(' ')}
                                    </p>
                                </div>
                            ))
                        ) : activeTab === 'minutes' ? (
                            <div className="h-full flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={generateAIMinutes}
                                        disabled={isGenerating || transcript.length < 5}
                                        className="px-6 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-30"
                                    >
                                        {isGenerating ? (
                                            <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        ) : (
                                            <Cpu className="w-3 h-3" />
                                        )}
                                        <span>Refresh Automated Output</span>
                                    </button>
                                    
                                    {minutes && (
                                        <button
                                            onClick={saveManualMinutes}
                                            className="px-6 py-3 bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                                        >
                                            <Database className="w-3 h-3" />
                                            <span>Save & Approve Minutes</span>
                                        </button>
                                    )}
                                </div>

                                {minutes ? (
                                    <div className="flex-1 flex flex-col gap-4">
                                        <div
                                            contentEditable
                                            onBlur={(e) => setMinutes(e.currentTarget.innerHTML)}
                                            dangerouslySetInnerHTML={{ __html: minutes }}
                                            className="flex-1 min-h-[400px] w-full bg-surface-low border border-muted/10 rounded-3xl p-8 font-serif text-lg leading-relaxed text-foreground/80 focus:border-primary/40 focus:bg-surface-high outline-none transition-all custom-scrollbar overflow-y-auto prose prose-invert max-w-none prose-h3:text-primary prose-h3:text-2xl prose-h3:font-serif prose-h3:mb-2 prose-li:text-foreground/70"
                                        />
                                        <div className="flex items-center justify-between px-4 text-[9px] uppercase font-black tracking-widest text-muted italic">
                                            <span>Click to edit rich text. Changes auto-save on blur.</span>
                                            <span className="flex items-center gap-1"><Cpu className="w-2 h-2" /> Strategic Advisor Sync</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center py-24 text-center space-y-6 opacity-30">
                                        <Cpu className="w-16 h-16 animate-pulse" />
                                        <div className="space-y-2">
                                            <h3 className="text-xl font-serif italic">Pending AI Synthesis</h3>
                                            <p className="text-sm max-w-xs">We need sufficient meeting data to generate a structured board report. Keep the session active.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={extractActionItems}
                                        disabled={isExtractingActions || transcript.length < 3}
                                        className="px-6 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-30"
                                    >
                                        {isExtractingActions ? (
                                            <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        ) : (
                                            <ShieldCheck className="w-3 h-3" />
                                        )}
                                        <span>Refresh Actions</span>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {actions.length > 0 ? (
                                        actions.map((action, idx) => (
                                            <div key={idx} className={`p-6 rounded-2xl border transition-all flex items-start justify-between group ${action.status === 'done' ? 'bg-primary/5 border-primary/20 opacity-60' : 'bg-surface-high border-white/5 hover:border-primary/20'}`}>
                                                <div className="flex items-start gap-4">
                                                    <button onClick={() => toggleActionStatus(idx)} className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${action.status === 'done' ? 'bg-primary border-primary text-background' : 'border-muted/30 hover:border-primary/50'}`}>
                                                        {action.status === 'done' && <CheckCircle className="w-4 h-4" />}
                                                    </button>
                                                    <div className="space-y-2">
                                                        <p className={`text-lg font-bold leading-none ${action.status === 'done' ? 'line-through text-foreground/40' : 'text-foreground'}`}>
                                                            {action.task}
                                                        </p>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[9px] font-black uppercase tracking-widest text-primary">
                                                                <User className="w-2.5 h-2.5" />
                                                                {action.owner || 'Unassigned'}
                                                            </div>
                                                            {action.deadline && action.deadline !== 'N/A' && (
                                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/5 border border-secondary/10 text-[9px] font-black uppercase tracking-widest text-secondary">
                                                                    <Clock className="w-2.5 h-2.5" />
                                                                    {action.deadline}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-24 flex flex-col items-center justify-center text-center opacity-30 space-y-6">
                                            <ShieldCheck className="w-16 h-16" />
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-serif italic">Scanning for Intent</h3>
                                                <p className="text-sm max-w-xs">The Action Extraction Agent is listening for assignments and commitments.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function FeatureCard({ title, desc, icon }: { title: string, desc: string, icon: string }) {
    return (
        <div className="p-6 bg-slate-900/50 border border-slate-800/50 rounded-2xl hover:bg-slate-800/50 transition-all cursor-default group">
            <span className="text-2xl mb-4 block group-hover:scale-125 transition-transform">{icon}</span>
            <h4 className="font-bold text-white mb-2">{title}</h4>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
        </div>
    )
}
