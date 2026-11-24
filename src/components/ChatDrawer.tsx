import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Globe,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ChatMessage, ChatScope, PlayerState, RoundPhase } from '../types/game';
import { filterVisibleChatMessages, getCallsignInitial } from '../game/rules';
import {
  type ActiveRecorder,
  createDemoVoiceWavBase64,
  playRadioKeyTone,
  playVoiceClip,
  startRadioRecording,
  type VoicePlaybackHandle,
} from '../services/hardware';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  viewer: PlayerState | undefined;
  phase: RoundPhase;
  isSoloDemo: boolean;
  stealthHaptic: boolean;
  onSendText: (scope: ChatScope, text: string) => void;
  onSendVoice: (
    scope: ChatScope,
    audioBase64: string,
    mimeType: string,
    durationSec: number
  ) => void;
}

const WAVE_BARS = [0.42, 0.78, 1.0, 0.65, 0.92, 0.55, 0.86, 0.6, 0.45];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  viewer,
  phase,
  isSoloDemo,
  stealthHaptic,
  onSendText,
  onSendVoice,
}) => {
  const [activeScope, setActiveScope] = useState<ChatScope>('team');
  const [draft, setDraft] = useState('');
  const [recordingState, setRecordingState] = useState<'idle' | 'connecting' | 'recording'>('idle');
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<ActiveRecorder | null>(null);
  const demoMicActiveRef = useRef(false);
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);
  const playbackRef = useRef<VoicePlaybackHandle | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  const visibleAll = filterVisibleChatMessages(messages, viewer, phase);
  const scopedMessages = visibleAll.filter((m) => m.scope === activeScope);
  const teamCount = visibleAll.filter((m) => m.scope === 'team').length;
  const globalCount = visibleAll.filter((m) => m.scope === 'global').length;

  const teamLabel =
    phase === 'lobby'
      ? 'Squad Team'
      : viewer?.role === 'hunter'
      ? 'Hunters Team'
      : viewer?.role === 'runner'
      ? 'Runners Team'
      : 'Spectators';

  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isOpen, scopedMessages.length, activeScope]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      playbackRef.current?.stop();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  const flashVoiceError = (msg: string) => {
    setVoiceError(msg);
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setVoiceError(null), 3200);
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendText(activeScope, trimmed);
    setDraft('');
  };

  const stopRecordingTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const handleCancelVoice = () => {
    stopRecordingTimer();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    demoMicActiveRef.current = false;
    setRecordingState('idle');
    setRecordElapsedMs(0);
    setAudioLevel(0);
  };

  const handleFinishVoice = async () => {
    if (recordingState === 'idle') return;
    stopRecordingTimer();
    const elapsedSec = Math.max(0.5, (Date.now() - recordStartRef.current) / 1000);
    setRecordingState('idle');
    setRecordElapsedMs(0);
    setAudioLevel(0);

    if (!stealthHaptic) playRadioKeyTone('end');

    const rec = recorderRef.current;
    recorderRef.current = null;

    if (rec) {
      const clip = await rec.stop();
      if (clip) {
        onSendVoice(activeScope, clip.base64, clip.mimeType, clip.durationSec);
      } else {
        flashVoiceError('Voice message was too short — try recording a bit longer.');
      }
      return;
    }

    if (demoMicActiveRef.current) {
      demoMicActiveRef.current = false;
      const demoWav = createDemoVoiceWavBase64(Math.min(3.5, elapsedSec));
      onSendVoice(activeScope, demoWav.base64, demoWav.mimeType, Number(elapsedSec.toFixed(1)));
    }
  };

  const handleStartVoice = async () => {
    if (recordingState !== 'idle') return;
    setVoiceError(null);
    recordStartRef.current = Date.now();
    setRecordElapsedMs(0);
    setRecordingState('connecting');

    if (!stealthHaptic) playRadioKeyTone('start');

    stopRecordingTimer();
    recordTimerRef.current = window.setInterval(() => {
      const ms = Math.min(10_000, Date.now() - recordStartRef.current);
      setRecordElapsedMs(ms);
      if (ms >= 10_000) {
        void handleFinishVoice();
      }
    }, 60);

    const { recorder, error } = await startRadioRecording(10, (lvl) => {
      setAudioLevel(lvl);
    });

    if (!recorder) {
      if (isSoloDemo && error === 'no_device') {
        demoMicActiveRef.current = true;
        setRecordingState('recording');
        return;
      }
      stopRecordingTimer();
      setRecordingState('idle');
      setRecordElapsedMs(0);
      setAudioLevel(0);
      flashVoiceError(
        error === 'permission_denied'
          ? 'Allow microphone permission to send voice messages.'
          : error === 'no_device'
          ? 'No microphone detected on this device.'
          : 'Voice recording is unavailable in this browser.'
      );
      return;
    }

    demoMicActiveRef.current = false;
    recorderRef.current = recorder;
    setRecordingState('recording');
  };

  const handleTogglePlayVoice = (msg: ChatMessage) => {
    if (!msg.audioBase64) return;
    if (playingId === msg.id) {
      playbackRef.current?.stop();
      playbackRef.current = null;
      setPlayingId(null);
      return;
    }
    playbackRef.current?.stop();
    setPlayingId(msg.id);
    playbackRef.current = playVoiceClip(msg.audioBase64, msg.mimeType || 'audio/webm', () => {
      setPlayingId((cur) => (cur === msg.id ? null : cur));
      playbackRef.current = null;
    });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDuration = (sec?: number) => {
    const total = Math.max(1, Math.round(sec ?? 1));
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Team and Global Chat"
        >
          <motion.div
            data-testid="chat-drawer"
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="w-full sm:max-w-md h-[78dvh] sm:h-[620px] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#161514] border-t sm:border border-white/12 shadow-2xl overflow-hidden"
          >
            {/* Header & Scope Switcher */}
            <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.08] bg-[#111010] space-y-3">
              <div className="w-10 h-1 bg-white/25 rounded-full mx-auto sm:hidden" />
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-white leading-tight">
                    Radio
                  </h2>
                  <p className="text-[11px] text-white/50">
                    {activeScope === 'team'
                      ? `${teamLabel} channel · Private frequency`
                      : 'Global channel · Visible to every player in room'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleCancelVoice();
                    onClose();
                  }}
                  aria-label="Close chat"
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Team vs Global Switcher */}
              <div
                role="tablist"
                aria-label="Chat channels"
                className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#07080D] border border-white/[0.07]"
              >
                {(
                  [
                    { id: 'team', label: teamLabel, count: teamCount, Icon: Users },
                    { id: 'global', label: 'Global', count: globalCount, Icon: Globe },
                  ] as const
                ).map((tab) => {
                  const active = activeScope === tab.id;
                  const Icon = tab.Icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveScope(tab.id)}
                      className={`relative min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                        active ? 'text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="chat-scope-tab"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className={`absolute inset-0 rounded-xl ${
                            tab.id === 'team' ? 'bg-[#E62E14]' : 'bg-[#2E2D2A] border border-white/15'
                          }`}
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
                      <span className="relative z-10">{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`relative z-10 font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                            active ? 'bg-black/20 text-[#08090E]' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Messages Feed */}
            <div
              data-testid="chat-feed"
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
              {scopedMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                    {activeScope === 'team' ? (
                      <Users className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <Globe className="w-6 h-6 text-cyan-400" />
                    )}
                  </div>
                  <div className="text-sm font-bold text-white">
                    {activeScope === 'team' ? `${teamLabel} Channel` : 'Global Room Chat'}
                  </div>
                  <p className="mt-1 text-xs text-slate-400 max-w-xs">
                    {activeScope === 'team'
                      ? 'Coordinate routes or drop a quick voice note — only your teammates can see or hear messages here.'
                      : 'Send text or voice messages to everyone currently in the game.'}
                  </p>
                </div>
              ) : (
                scopedMessages.map((msg) => {
                  const isMine = msg.senderId === viewer?.id;
                  const isPlaying = playingId === msg.id;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16 }}
                      className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMine && (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-[#08090E] shrink-0"
                          style={{ backgroundColor: msg.senderColor }}
                        >
                          {getCallsignInitial(msg.senderName)}
                        </div>
                      )}

                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                          isMine
                            ? activeScope === 'global'
                              ? 'bg-cyan-500/20 border border-cyan-400/40 text-white rounded-br-md'
                              : viewer?.role === 'hunter'
                              ? 'bg-red-500/20 border border-red-400/40 text-white rounded-br-md'
                              : 'bg-emerald-500/20 border border-emerald-400/40 text-white rounded-br-md'
                            : 'bg-[#171A27] border border-white/[0.08] text-slate-100 rounded-bl-md'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-[11px] font-bold text-slate-300 truncate">
                            {isMine ? 'You' : msg.senderName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
                            {formatTime(msg.ts)}
                          </span>
                        </div>

                        {msg.kind === 'voice' ? (
                          <div
                            data-testid="voice-message-bubble"
                            className="flex items-center gap-2.5 pt-0.5"
                          >
                            <button
                              type="button"
                              onClick={() => handleTogglePlayVoice(msg)}
                              aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
                              className="w-9 h-9 rounded-full bg-white text-[#08090E] hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
                            >
                              {isPlaying ? (
                                <Pause className="w-4 h-4 fill-current" />
                              ) : (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              )}
                            </button>
                            <div className="flex items-center gap-[3px] h-6 flex-1 min-w-[96px]">
                              {WAVE_BARS.map((bar, idx) => (
                                <span
                                  key={idx}
                                  className={`w-[3px] rounded-full transition-all duration-150 ${
                                    isPlaying ? 'bg-emerald-300' : 'bg-white/65'
                                  }`}
                                  style={{
                                    height: `${Math.round(
                                      (isPlaying
                                        ? 0.35 + 0.65 * Math.abs(Math.sin(Date.now() / 160 + idx))
                                        : bar) * 20
                                    )}px`,
                                  }}
                                />
                              ))}
                            </div>
                            <span className="font-mono text-[11px] font-bold text-slate-200 tabular-nums shrink-0">
                              {formatDuration(msg.durationSec)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm leading-snug break-words">{msg.text}</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Error Notice */}
            {voiceError && (
              <div
                role="alert"
                className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-medium text-red-200 text-center"
              >
                {voiceError}
              </div>
            )}

            {/* Composer: Text + Voice Message Recorder */}
            <div className="p-3 pb-safe border-t border-white/[0.08] bg-[#0A0C13]">
              {recordingState !== 'idle' ? (
                <div
                  data-testid="chat-voice-recorder"
                  className="flex items-center gap-2 rounded-2xl bg-red-500/15 border border-red-400/50 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={handleCancelVoice}
                    aria-label="Cancel voice recording"
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-black/30 hover:bg-black/50 text-slate-300 hover:text-white flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <div
                      data-testid="chat-voice-waveform"
                      className="inline-flex items-center gap-[3px] h-5"
                    >
                      {WAVE_BARS.slice(0, 7).map((mult, i) => {
                        const lvl =
                          0.26 +
                          Math.max(
                            audioLevel,
                            0.24 + 0.28 * Math.abs(Math.sin(recordElapsedMs / 130 + i * 0.85))
                          ) *
                            mult *
                            0.74;
                        return (
                          <span
                            key={i}
                            className="w-[3px] rounded-full bg-red-300 transition-transform duration-75"
                            style={{
                              height: '18px',
                              transform: `scaleY(${Math.min(1, Math.max(0.24, lvl))})`,
                            }}
                          />
                        );
                      })}
                    </div>
                    <span className="font-mono text-xs font-bold text-white tabular-nums">
                      {(recordElapsedMs / 1000).toFixed(1)}s / 10s
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleFinishVoice()}
                    aria-label="Stop and send voice message"
                    className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Send</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitText} className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="chat-voice-btn"
                    onClick={() => void handleStartVoice()}
                    aria-label="Record voice message"
                    className="min-h-[46px] min-w-[46px] rounded-xl bg-[#151824] hover:bg-[#1E2233] border border-white/10 text-emerald-400 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                  <input
                    data-testid="chat-text-input"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={240}
                    placeholder={
                      activeScope === 'team'
                        ? `Message ${teamLabel}...`
                        : 'Message everyone in room...'
                    }
                    className="flex-1 min-w-0 min-h-[46px] px-3.5 rounded-xl bg-[#131622] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    data-testid="chat-send-btn"
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="Send message"
                    className="min-h-[46px] min-w-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-[#08090E] flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
