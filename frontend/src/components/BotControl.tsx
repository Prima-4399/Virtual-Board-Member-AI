'use client'
import { useState, useEffect } from 'react'
import { Video, Database, Cpu, LogOut, Plus, ChevronRight, ShieldCheck, BookOpen, History, CheckCircle, Clock, User, FileText } from 'lucide-react'
import axios from 'axios'
import { createClient } from '@/utils/supabase'
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

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
    const [attendeesMap, setAttendeesMap] = useState<Record<string, { role: string; roleKey: string; matched: boolean }>>({})

    const supabase = createClient()

    const BOARD_ROLE_COLORS: Record<string, string> = {
        board_chair: 'bg-primary/20 text-primary',
        director: 'bg-foreground/5 text-foreground/40',
        secretary: 'bg-foreground/5 text-foreground/40',
        legal: 'bg-foreground/10 text-foreground/60',
        ceo_exec: 'bg-primary/10 text-primary'
    }

    // Persist bot session to localStorage so it survives navigation
    const saveSession = (id: string, status: string) => {
        localStorage.setItem('vbma_bot_session', JSON.stringify({ botId: id, status, timestamp: Date.now() }))
    }

    const clearSession = () => {
        localStorage.removeItem('vbma_bot_session')
    }

    useEffect(() => {
        const init = async () => {
            // 1. Load org
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', session.user.id)
                    .single()
                if (profile?.organization_id) setOrgId(profile.organization_id)
            }

            // 2. Restore bot session from localStorage
            try {
                const saved = localStorage.getItem('vbma_bot_session')
                if (saved) {
                    const { botId: savedBotId, status: savedStatus, timestamp } = JSON.parse(saved)
                    // Only restore if session is less than 4 hours old
                    if (savedBotId && Date.now() - timestamp < 4 * 60 * 60 * 1000) {
                        // Verify bot is still valid by checking its status
                        const res = await axios.get(`${BACKEND_URL}/api/bot/${savedBotId}`)
                        const currentStatus = res.data.status
                        setBotId(savedBotId)
                        setBotStatus(currentStatus)

                        // If bot is done, also try to load existing transcript/minutes/actions
                        if (currentStatus === 'done' || currentStatus === 'recording' || currentStatus === 'in_call_not_recording') {
                            try {
                                const transRes = await axios.get(`${BACKEND_URL}/api/bot/${savedBotId}/transcript`)
                                if (transRes.data && Array.isArray(transRes.data) && transRes.data.length > 0) {
                                    setTranscript(transRes.data)
                                }
                            } catch (e) { /* no transcript yet */ }

                            // Load minutes and actions from DB
                            const { data: meeting } = await supabase.from('meetings').select('minutes, actions, attendees_summary').eq('recall_bot_id', savedBotId).maybeSingle()
                            if (meeting?.minutes) setMinutes(meeting.minutes)
                            if (meeting?.actions) setActions(meeting.actions)
                            if (meeting?.attendees_summary) {
                                const map: Record<string, { role: string; roleKey: string; matched: boolean }> = {}
                                for (const a of meeting.attendees_summary) {
                                    if (a.board_role) map[a.name] = { role: a.board_role, roleKey: a.board_role_key || '', matched: a.matched }
                                }
                                setAttendeesMap(map)
                            }
                        }

                        // If done or fatal, clear persisted session
                        if (currentStatus === 'done' || currentStatus === 'fatal') {
                            clearSession()
                        } else {
                            saveSession(savedBotId, currentStatus)
                        }
                    } else {
                        clearSession()
                    }
                }
            } catch (e) {
                clearSession()
            }
        }
        init()
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
            saveSession(response.data.id, 'starting')
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
            alert(`AI Summary Error: ${detail}`)
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
                    saveSession(botId, newStatus)

                    // Fetch transcript even during recording for live feel
                    if (newStatus !== 'fatal' && newStatus !== 'starting') {
                        const transRes = await axios.get(`${BACKEND_URL}/api/bot/${botId}/transcript`)
                        if (transRes.data && Array.isArray(transRes.data) && transRes.data.length > 0) {
                            setTranscript(transRes.data)
                        }

                        // Fetch attendees summary for role badges
                        try {
                            const { data: meeting } = await supabase.from('meetings').select('attendees_summary').eq('recall_bot_id', botId).maybeSingle()
                            if (meeting?.attendees_summary) {
                                const map: Record<string, { role: string; roleKey: string; matched: boolean }> = {}
                                for (const a of meeting.attendees_summary) {
                                    if (a.board_role) {
                                        map[a.name] = { role: a.board_role, roleKey: a.board_role_key || '', matched: a.matched }
                                    }
                                }
                                setAttendeesMap(map)
                            }
                        } catch (e) { /* non-critical */ }
                    }

                    if (newStatus === 'done' || newStatus === 'fatal') {
                        clearSession()
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
                    <div className="p-8 rounded-2xl bg-surface-low border border-border flex flex-col items-center text-center shadow-sm">
                        <Clock className="w-6 h-6 text-primary/40 mb-4" />
                        <div className="text-2xl font-black text-primary">1,420</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Minutes Analyzed</div>
                    </div>
                    <div className="p-8 rounded-2xl bg-surface-low border border-border flex flex-col items-center text-center shadow-sm">
                        <FileText className="w-6 h-6 text-primary/40 mb-4" />
                        <div className="text-2xl font-black text-primary">4,290</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Transcripts Saved</div>
                    </div>
                    <div className="p-8 rounded-2xl bg-surface-low border border-border flex flex-col items-center text-center shadow-sm">
                        <ShieldCheck className="w-6 h-6 text-primary/40 mb-4" />
                        <div className="text-2xl font-black text-primary">128</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Action Items</div>
                    </div>
                </div>
            )}

            <div className="p-10 rounded-[32px] bg-surface-low border border-border shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21.355r7.106-7.106a12.066 12.066 0 001.907-3.045m-7.106 7.106l-7.106-7.106a12.066 12.066 0 01-1.907-3.045m7.106 7.106V11.355m0 0a3.001 3.001 0 110-6.002 3.001 3.001 0 010 6.002z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-foreground tracking-tight">Start Recording</h2>
                        <p className="text-muted text-sm font-medium">Add the AI to your meeting to record and take notes.</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Enter meeting URL (Google Meet / Zoom / Teams)"
                            className="w-full bg-transparent border-b-2 border-border px-4 py-4 text-foreground outline-none focus:border-primary transition-all text-lg font-medium placeholder:text-foreground/20 italic font-serif"
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startBot}
                        disabled={loading || !meetingUrl}
                        className="w-full bg-primary text-primary-foreground py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-primary/20"
                    >
                        {loading ? 'Starting...' : 'Start Recording'}
                    </button>

                    {error && <div className="p-4 bg-secondary/10 border border-secondary/30 text-secondary font-bold rounded-xl mb-4 animate-pulse text-sm">{error}</div>}

                    {botId && (
                        <div className="mt-8 pt-8 border-t border-muted/10 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Meeting ID</span>
                                <span className="text-xs text-foreground font-mono bg-surface-high px-3 py-1 rounded-full">{botId}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Bot Status</span>
                                <div className="flex flex-col items-end gap-3">
                                    <div className="flex items-center gap-2 px-3 py-1 bg-background border border-border rounded-full">
                                        <div className={`w-2 h-2 rounded-full animate-pulse ${botStatus === 'done' ? 'bg-primary' :
                                            botStatus === 'in_waiting_room' ? 'bg-amber-600' :
                                                botStatus === 'recording' ? 'bg-red-500' : 'bg-primary/40'
                                            }`} />
                                        <span className="text-xs font-bold capitalize text-foreground">
                                            {botStatus?.replace(/_/g, ' ') || 'Initializing...'}
                                        </span>
                                    </div>
                                    
                                    {botStatus === 'recording' && (
                                        <div className="flex gap-2 items-center text-[10px] uppercase font-black tracking-widest text-primary animate-pulse">
                                            <Database className="w-3 h-3" />
                                            <span>Saving to history...</span>
                                        </div>
                                    )}

                                    {botId && botStatus !== 'done' && botStatus !== 'fatal' && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setBotId(null)
                                                    setBotStatus(null)
                                                    setTranscript(null)
                                                    setMinutes('')
                                                    setActions([])
                                                    setAttendeesMap({})
                                                    clearSession()
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
                <div className="p-10 rounded-[40px] bg-surface-low border border-border shadow-sm animate-in slide-in-from-bottom-8 duration-1000 min-h-[600px] flex flex-col shadow-xl shadow-primary/5">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-secondary-foreground shadow-lg shadow-secondary/20 font-black text-xs">
                                {activeTab === 'transcript' ? 'LIVE' : 'AI'}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-foreground tracking-tight">
                                    {activeTab === 'transcript' ? 'Meeting Notes' : 'AI Summary'}
                                </h2>
                                <p className="text-muted text-sm font-medium">
                                    {activeTab === 'transcript' ? 'Live transcript with speaker ID.' : 'AI-generated summary of the discussion.'}
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
                                AI Summary
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
                            transcript.map((entry: any, i: number) => {
                                const speakerInfo = attendeesMap[entry.participant.name]
                                const roleColor = speakerInfo?.roleKey ? (BOARD_ROLE_COLORS[speakerInfo.roleKey] || 'bg-surface-highest/20 text-foreground/40') : ''
                                return (
                                <div key={i} className="group p-8 bg-background rounded-2xl border border-border hover:border-primary/40 transition-all shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-surface-highest flex items-center justify-center text-[10px] font-black text-primary">
                                                {entry.participant.name.charAt(0)}
                                            </div>
                                            <p className="font-extrabold text-sm text-primary uppercase tracking-widest">{entry.participant.name}</p>
                                            {speakerInfo?.role && (
                                                <span className={`text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${roleColor}`}>
                                                    {speakerInfo.role}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-foreground/80 leading-relaxed text-md font-medium">
                                        {entry.words.map((w: any) => w.text).join(' ')}
                                    </p>
                                </div>
                                )
                            })
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
                                        <span>Update AI Summary</span>
                                    </button>
                                    
                                    {minutes && (
                                        <button
                                            onClick={saveManualMinutes}
                                            className="px-6 py-3 bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                                        >
                                            <Database className="w-3 h-3" />
                                            <span>Save Summary</span>
                                        </button>
                                    )}
                                </div>

                                {minutes ? (
                                    <div className="flex-1 flex flex-col gap-4">
                                        <div
                                            contentEditable
                                            onBlur={(e) => setMinutes(e.currentTarget.innerHTML)}
                                            dangerouslySetInnerHTML={{ __html: minutes }}
                                            className="flex-1 min-h-[400px] w-full bg-background border border-border rounded-2xl p-10 font-serif text-lg leading-relaxed text-foreground/80 focus:border-primary/40 focus:bg-surface-low outline-none transition-all custom-scrollbar overflow-y-auto prose prose-neutral dark:prose-invert max-w-none prose-h3:text-primary prose-h3:text-2xl prose-h3:font-serif prose-h3:mb-2 prose-li:text-foreground/70"
                                        />
                                        <div className="flex items-center justify-between px-4 text-[9px] uppercase font-black tracking-widest text-muted italic">
                                            <span>Click to edit. Changes save when you click outside.</span>
                                            <span className="flex items-center gap-1"><Cpu className="w-2 h-2" /> AI Assistant</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center py-24 text-center space-y-6 opacity-30">
                                        <Cpu className="w-16 h-16 animate-pulse" />
                                        <div className="space-y-2">
                                            <h3 className="text-xl font-serif italic">Wait for AI...</h3>
                                            <p className="text-sm max-w-xs">We need more meeting data to generate a summary. Keep the meeting going.</p>
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
                                            <div key={idx} className={`p-6 rounded-2xl border transition-all flex items-start justify-between group ${action.status === 'done' ? 'bg-primary/5 border-primary/20 opacity-60' : 'bg-surface-high border-border hover:border-primary/20'}`}>
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
                                                            {action.owner_role && action.owner_role !== 'guest' && (
                                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${BOARD_ROLE_COLORS[action.owner_role] || 'bg-surface-highest/20 text-foreground/40'}`}>
                                                                    {action.owner_role.replace(/_/g, ' ')}
                                                                </div>
                                                            )}
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
                                                <h3 className="text-xl font-serif italic">Looking for tasks...</h3>
                                                <p className="text-sm max-w-xs">The AI is listening for action items and assignments.</p>
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
