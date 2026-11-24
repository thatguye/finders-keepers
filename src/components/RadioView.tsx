import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Globe,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  Trash2,
  Users,
  Vibrate,
  Volume2,
} from 'lucide-react';
import type { ChatMessage, ChatScope, PlayerState, RoomState } from '../types/game';
import { filterVisibleChatMessages } from '../game/rules';
import { formatCountdown } from '../game/geo';
import {
  type ActiveRecorder,
  createDemoVoiceWavBase64,
  playRadioKeyTone,
  playVoiceClip,
  startRadioRecording,
  type VoicePlaybackHandle,
} from '../services/hardware';

interface RadioViewProps {
  room: RoomState;
  viewer: PlayerState | undefined;
  nowMs: number;
  stealthHaptic: boolean;
  onToggleStealthHaptic: () => void;
  onBackToMap: () => void;
  onSendText: (scope: ChatScope, text: string) => void;
  onSendVoice: (
    scope: ChatScope,
    audioBase64: string,
    mimeType: string,
    durationSec: number
  ) => void;
  /** Increment to immediately begin voice recording when launched from map mic button */
  autoRecordSignal?: number;
}

const WAVE_BARS = [0.42, 0.78, 1.0, 0.65, 0.92, 0.55, 0.86, 0.6, 0.45];

export const RadioView: React.FC<RadioViewProps> = ({
  room,
  viewer,
  nowMs,
  stealthHaptic,
  onToggleStealthHaptic,
  onBackToMap,
  onSendText,
  onSendVoice,
  autoRecordSignal = 0,
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
  const handledAutoRecordRef = useRef(autoRecordSignal);

  const visibleAll = filterVisibleChatMessages(room.chatMessages, viewer, room.phase);
  const scopedMessages = visibleAll.filter((m) => m.scope === activeScope);
  const teamCount = visibleAll.filter((m) => m.scope === 'team').length;
  const globalCount = visibleAll.filter((m) => m.scope === 'global').length;

  const teamMembersOnline = room.players.filter(
    (p) => (room.phase === 'lobby' ? true : p.role === viewer?.role) && p.connected
  ).length;
  const totalOnline = room.players.filter((p) => p.connected).length;

  const teamChannelLabel =
    room.phase === 'lobby'
      ? 'Squad'
      : viewer?.role === 'hunter'
      ? 'Hunters'
      : viewer?.role === 'runner'
      ? 'Runners'
      : 'Spectators';

  const quickReplies =
    activeScope === 'global'
      ? ['Good luck!', 'Anyone nearby?', 'Nice move!', 'Watch the zone']
      : viewer?.role === 'hunter'
      ? ['Spotted one!', 'Cover the flank', 'Where are you?', 'Closing in']
      : ['Coast is clear', 'Moving now', 'Hunter nearby!', 'Stay low'];

  const remainingMs =
    room.phase === 'head_start'
      ? Math.max(0, (room.roundEndsAt ?? nowMs) - nowMs)
      : Math.max(0, (room.roundEndsAt ?? nowMs) - nowMs);

  const headStartLabel =
    room.settings.headStartMin >= 1
      ? `${Math.round(room.settings.headStartMin)} min`
      : `${Math.round(room.settings.headStartMin * 60)} sec`;

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [scopedMessages.length, activeScope]);

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
      if (room.isSoloDemo && error === 'no_device') {
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

  // Auto-trigger voice recording when opened via the Map floating Mic shortcut
  useEffect(() => {
    if (autoRecordSignal > handledAutoRecordRef.current) {
      handledAutoRecordRef.current = autoRecordSignal;
      void handleStartVoice();
    }
  }, [autoRecordSignal]);

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendText(activeScope, trimmed);
    setDraft('');
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

  const formatRelativeTime = (ts: number) => {
    const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (diffSec < 45) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDuration = (sec?: number) => {
    const total = Math.max(1, Math.round(sec ?? 1));
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <motion.div
      data-testid="radio-view"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-30 bg-[#0F0F0E] text-white flex flex-col pt-safe"
    >
      {/* Top Radio Bar */}
      <header className="px-4 pt-2 pb-3 border-b border-white/[0.07] bg-[#0F0F0E]">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => {
                  handleCancelVoice();
                  onBackToMap();
                }}
                aria-label="Back to Map"
                className="min-h-[44px] min-w-[36px] -ml-2 flex items-center justify-center text-[#EA3419] hover:text-[#FF5733] transition-colors"
              >
                <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-extrabold tracking-tight leading-none text-white">
                  Radio
                </h1>
                <p className="text-xs text-white/50 mt-0.5 truncate">
                  {activeScope === 'team'
                    ? `${teamChannelLabel} channel · ${teamMembersOnline} on air`
                    : `Global channel · ${totalOnline} on air`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onToggleStealthHaptic}
                aria-label={stealthHaptic ? 'Unmute radio alerts' : 'Switch to stealth haptic alerts'}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  stealthHaptic
                    ? 'bg-[#E62E14] text-white'
                    : 'bg-[#22211F] text-white/85 hover:bg-[#2C2A28]'
                }`}
              >
                {stealthHaptic ? <Vibrate className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="px-3.5 h-10 rounded-full bg-[#22211F] text-sm font-bold text-white/95 flex items-center justify-center font-mono tabular-nums">
                {formatCountdown(remainingMs)}
              </div>
            </div>
          </div>

          {/* Team vs Global Channel Switcher */}
          <div
            role="tablist"
            aria-label="Radio channels"
            className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#1A1918] border border-white/[0.06]"
          >
            {(
              [
                { id: 'team', label: `${teamChannelLabel} Team`, count: teamCount, Icon: Users },
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
                  className={`relative min-h-[38px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    active ? 'text-white' : 'text-white/50 hover:text-white/85'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="radio-channel-tab"
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
                      className={`relative z-10 font-mono text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                        active ? 'bg-black/25 text-white' : 'bg-white/10 text-white/70'
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
      </header>

      {/* Scrollable Radio Messages Feed */}
      <div
        data-testid="chat-feed"
        className="flex-1 overflow-y-auto px-4 pt-4 pb-3"
      >
        <div className="max-w-lg mx-auto min-h-full flex flex-col justify-end space-y-3.5">
          {/* System Round Event Notice */}
          <div className="text-center space-y-2 py-2">
            <p className="text-[11px] text-white/35">
              {activeScope === 'team'
                ? `Private ${teamChannelLabel.toLowerCase()} frequency · Only teammates receive these broadcasts.`
                : 'Open frequency · Every player in the room receives these broadcasts.'}
            </p>
            {room.settings.headStartMin > 0 && (
              <p className="text-xs font-semibold text-[#F04427]">
                {room.phase === 'head_start'
                  ? `Runners have a ${headStartLabel} head start. Hold tight.`
                  : `Head start complete · Hunt is live.`}
              </p>
            )}
          </div>

          {scopedMessages.map((msg) => {
            const isMine = msg.senderId === viewer?.id;
            const isPlaying = playingId === msg.id;
            const senderDisplay = isMine ? 'You' : msg.senderName.replace(' (AI)', '');

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] font-medium text-white/45 mb-1 px-1">
                  {senderDisplay} · {formatRelativeTime(msg.ts)}
                </div>

                <div
                  className={`max-w-[82%] rounded-[20px] px-4 py-3 ${
                    isMine
                      ? activeScope === 'team'
                        ? 'bg-[#3C1914] border border-[#E62E14]/45 text-white rounded-br-md'
                        : 'bg-[#1D2A33] border border-cyan-400/35 text-white rounded-br-md'
                      : 'bg-[#232220] text-white/95 rounded-bl-md'
                  }`}
                >
                  {msg.kind === 'voice' ? (
                    <div
                      data-testid="voice-message-bubble"
                      className="flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => handleTogglePlayVoice(msg)}
                        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
                        className="w-9 h-9 rounded-full bg-white text-[#141413] hover:bg-white/90 flex items-center justify-center shrink-0 transition-colors"
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
                              isPlaying ? 'bg-[#FF5733]' : 'bg-white/65'
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
                      <span className="font-mono text-xs font-bold text-white/85 tabular-nums shrink-0">
                        {formatDuration(msg.durationSec)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[15px] leading-snug break-words">{msg.text}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      </div>

      {/* Voice Error Banner */}
      {voiceError && (
        <div className="px-4 pb-2">
          <div
            role="alert"
            className="max-w-lg mx-auto px-3.5 py-2 rounded-xl bg-red-500/20 border border-red-500/45 text-xs font-medium text-red-200 text-center"
          >
            {voiceError}
          </div>
        </div>
      )}

      {/* Quick Replies + Composer (leaves exact clearance for bottom Map/Radio dock) */}
      <div className="px-4 pb-[92px] pt-2 bg-[#0F0F0E]">
        <div className="max-w-lg mx-auto space-y-2.5">
          {/* Quick-Reply Tactical Chips */}
          {recordingState === 'idle' && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {quickReplies.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => onSendText(activeScope, phrase)}
                  className="shrink-0 min-h-[38px] px-4 rounded-full bg-[#1C1B1A] hover:bg-[#282624] border border-white/12 text-xs font-semibold text-white/95 whitespace-nowrap transition-colors"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}

          {/* Composer or Live Voice Recorder */}
          {recordingState !== 'idle' ? (
            <div
              data-testid="chat-voice-recorder"
              className="flex items-center gap-2 rounded-full bg-[#2E1410] border border-[#E62E14]/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={handleCancelVoice}
                aria-label="Cancel voice recording"
                className="w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 text-white/75 hover:text-white flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF462B] animate-pulse shrink-0" />
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
                        className="w-[3px] rounded-full bg-[#FF6E57] transition-transform duration-75"
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
                className="h-10 px-4 rounded-full bg-white hover:bg-white/90 text-[#141413] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Send</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitText} className="flex items-center gap-2.5">
              <input
                data-testid="chat-text-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={240}
                placeholder={
                  activeScope === 'team' ? 'Message your team' : 'Message everyone on global'
                }
                className="flex-1 min-w-0 min-h-[48px] px-4 rounded-full bg-[#1C1B1A] border border-white/12 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E62E14]"
              />
              {draft.trim() ? (
                <button
                  data-testid="chat-send-btn"
                  type="submit"
                  aria-label="Send radio message"
                  className="w-12 h-12 rounded-full bg-[#E62E14] hover:bg-[#F23C22] text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="chat-voice-btn"
                  onClick={() => void handleStartVoice()}
                  aria-label="Record voice message"
                  className="w-12 h-12 rounded-full bg-[#2E1612] hover:bg-[#3F1D17] border border-[#E62E14]/35 text-[#FF5733] flex items-center justify-center shrink-0 transition-colors"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
};
