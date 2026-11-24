import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Crosshair,
  Eye,
  EyeOff,
  Flashlight,
  Layers,
  Lock,
  Mic,
  MoreHorizontal,
  Radio,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Vibrate,
  Volume2,
  WifiOff,
} from 'lucide-react';
import type { LatLng, MapTheme, RoomState } from '../types/game';
import { evaluateOobState, filterVisiblePlayers } from '../game/rules';
import { formatCountdown, haversineMeters } from '../game/geo';
import {
  type ActiveRecorder,
  disableFlashlightTorch,
  enableFlashlightTorch,
  type FlashColor,
  playRadioKeyTone,
  startRadioRecording,
} from '../services/hardware';
import { TacticalMap } from './TacticalMap';
import { SlideToConfirm } from './SlideToConfirm';
import { PocketModeOverlay } from './PocketModeOverlay';
import { ImposterMeetingModal } from './ImposterMeetingModal';

interface ActiveGameViewProps {
  room: RoomState;
  viewerId: string;
  userPos: LatLng;
  nowMs: number;
  isOnline: boolean;
  offlineQueueCount: number;
  stealthHaptic: boolean;
  flashColor: FlashColor | null;
  radioStatusText: string | null;
  onToggleStealthHaptic: () => void;
  onChangeMapTheme: (theme: MapTheme) => void;
  onOpenMoreMenu: () => void;
  onRunnerGotTagged: () => void;
  onTagBotInSolo?: (botId: string) => void;
  onSendRadioClip: (audioBase64: string, mimeType: string, durationSec: number) => void;
  onResolveEmergency: () => void;
  onCallImposterMeeting: () => void;
  onCastMeetingVote: (targetId: string) => void;
  onResolveMeeting: () => void;
  onSoloSkipHeadStart?: () => void;
  onSoloTriggerPing?: () => void;
  onSoloTriggerShrink?: () => void;
  onSoloFinishRound?: () => void;
}

const THEME_CYCLE: { id: MapTheme; label: string }[] = [
  { id: 'night', label: 'Night' },
  { id: 'standard', label: 'Street' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'snow', label: 'Snow' },
];

const WAVE_MULTIPLIERS = [0.45, 0.78, 1.0, 0.85, 0.96, 0.72, 0.5];

export const ActiveGameView: React.FC<ActiveGameViewProps> = ({
  room,
  viewerId,
  userPos,
  nowMs,
  isOnline,
  offlineQueueCount,
  stealthHaptic,
  flashColor,
  radioStatusText,
  onToggleStealthHaptic,
  onChangeMapTheme,
  onOpenMoreMenu,
  onRunnerGotTagged,
  onTagBotInSolo,
  onSendRadioClip,
  onResolveEmergency,
  onCallImposterMeeting,
  onCastMeetingVote,
  onResolveMeeting,
  onSoloSkipHeadStart,
  onSoloTriggerPing,
  onSoloTriggerShrink,
  onSoloFinishRound,
}) => {
  const [pocketMode, setPocketMode] = useState(false);
  const [flashlightMode, setFlashlightMode] = useState<'off' | 'hardware' | 'screen'>('off');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [revealSecretRole, setRevealSecretRole] = useState(false);
  const [showSoloTools, setShowSoloTools] = useState(false);
  const [themeToast, setThemeToast] = useState<string | null>(null);

  // Overhauled Walkie-Talkie Hold-to-Talk state (race-free Pointer Capture + live audio levels)
  const [radioState, setRadioState] = useState<'idle' | 'connecting' | 'transmitting'>('idle');
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [localRadioBanner, setLocalRadioBanner] = useState<string | null>(null);

  const holdActiveRef = useRef(false);
  const demoSimulatedMicRef = useRef(false);
  const recorderRef = useRef<ActiveRecorder | null>(null);
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const themeToastTimerRef = useRef<number | null>(null);

  const viewer = room.players.find((p) => p.id === viewerId);
  const role = viewer?.role ?? 'spectator';
  const isHost = room.hostId === viewerId;

  const showTempBanner = (text: string, durationMs = 2600) => {
    setLocalRadioBanner(text);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setLocalRadioBanner(null), durationMs);
  };

  useEffect(() => {
    return () => {
      holdActiveRef.current = false;
      disableFlashlightTorch();
      recorderRef.current?.cancel();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      if (themeToastTimerRef.current) window.clearTimeout(themeToastTimerRef.current);
    };
  }, []);

  const handleCycleMapTheme = () => {
    const idx = THEME_CYCLE.findIndex((t) => t.id === room.settings.mapTheme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    onChangeMapTheme(next.id);
    setThemeToast(`Map: ${next.label}`);
    if (themeToastTimerRef.current) window.clearTimeout(themeToastTimerRef.current);
    themeToastTimerRef.current = window.setTimeout(() => setThemeToast(null), 1500);
  };

  const handleToggleFlashlight = async () => {
    if (flashlightMode !== 'off') {
      disableFlashlightTorch();
      setFlashlightMode('off');
      return;
    }
    const result = await enableFlashlightTorch();
    setFlashlightMode(result);
  };

  const finishRadioHold = async () => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;

    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    const elapsedSec = Math.max(0.2, (Date.now() - recordStartRef.current) / 1000);
    setRadioState('idle');
    setRecordElapsedMs(0);
    setAudioLevel(0);

    if (!stealthHaptic) {
      playRadioKeyTone('end');
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(25);
      } catch {
        // ignore
      }
    }

    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      const clip = await rec.stop();
      if (clip) {
        onSendRadioClip(clip.base64, clip.mimeType, clip.durationSec);
      } else if (elapsedSec < 0.35) {
        showTempBanner('Hold longer to transmit voice', 1800);
      }
    } else if (demoSimulatedMicRef.current) {
      demoSimulatedMicRef.current = false;
      showTempBanner(
        `Radio Check (${elapsedSec.toFixed(1)}s) · Connect a mic for live voice`,
        2800
      );
    }
  };

  const beginRadioHold = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (role !== 'hunter' && role !== 'runner') return;
    if (holdActiveRef.current) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic events without pointerId
    }

    holdActiveRef.current = true;
    recordStartRef.current = Date.now();
    setRecordElapsedMs(0);
    setRadioState('connecting');

    if (!stealthHaptic) {
      playRadioKeyTone('start');
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(35);
      } catch {
        // ignore
      }
    }

    // Start smooth elapsed timer immediately so hold animation feels instant from frame 1
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    recordTimerRef.current = window.setInterval(() => {
      if (!holdActiveRef.current) return;
      const ms = Math.min(10_000, Date.now() - recordStartRef.current);
      setRecordElapsedMs(ms);
      if (ms >= 10_000) {
        void finishRadioHold();
      }
    }, 60);

    const { recorder, error } = await startRadioRecording(10, (lvl) => {
      if (holdActiveRef.current) setAudioLevel(lvl);
    });

    // If user already let go while mic was initializing, cleanly abort
    if (!holdActiveRef.current) {
      recorder?.cancel();
      return;
    }

    if (!recorder) {
      // In Solo Demo on devices without a physical mic (e.g. desktop without headset),
      // keep the live hold animation active so players can test PTT ergonomics cleanly.
      if (room.isSoloDemo && error === 'no_device') {
        demoSimulatedMicRef.current = true;
        setRadioState('transmitting');
        return;
      }
      holdActiveRef.current = false;
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRadioState('idle');
      setRecordElapsedMs(0);
      setAudioLevel(0);
      const msg =
        error === 'permission_denied'
          ? 'Allow microphone permission to use Walkie-Talkie'
          : error === 'no_device'
          ? 'No microphone detected on this device'
          : 'Walkie-Talkie voice recording unavailable in this browser';
      showTempBanner(msg, 3200);
      return;
    }

    demoSimulatedMicRef.current = false;
    recorderRef.current = recorder;
    setRadioState('transmitting');
  };

  // Phase countdown calculations
  const isHeadStart = room.phase === 'head_start';
  const activeCountdownMs = isHeadStart
    ? Math.max(0, (room.headStartEndsAt ?? nowMs) - nowMs)
    : Math.max(0, (room.roundEndsAt ?? nowMs) - nowMs);

  const nextPingMs =
    room.phase === 'hunt' && room.nextPingAt ? Math.max(0, room.nextPingAt - nowMs) : null;

  const phaseLabel =
    room.phase === 'head_start'
      ? 'HEAD START'
      : room.phase === 'emergency_pause'
      ? 'EMERGENCY PAUSE'
      : room.phase === 'meeting'
      ? 'MEETING'
      : room.settings.mode.toUpperCase();

  // OOB evaluation for viewer
  const oobEval = evaluateOobState(
    viewer?.oobStatus !== 'inside' && !!viewer?.oobStartedAt,
    viewer?.oobStartedAt,
    nowMs
  );

  // Strict asymmetrical fog-of-war markers
  const visibleMarkers = filterVisiblePlayers(viewer, room, nowMs);

  // Only Hunters & authorized Spectators see Runner Radar Pings (and never during Head Start)
  const visiblePings =
    room.phase === 'hunt' &&
    (role === 'hunter' ||
      (role === 'spectator' && room.settings.spectatorAccess !== 'disabled'))
      ? room.pings
      : [];

  const activeRunnersCount = room.players.filter(
    (p) => p.role === 'runner' && !p.eliminated
  ).length;
  const huntersCount = room.players.filter((p) => p.role === 'hunter').length;

  const nearestRunnerBot =
    room.isSoloDemo && role === 'hunter' && room.phase === 'hunt'
      ? room.players
          .filter((p) => p.isBot && p.role === 'runner' && !p.eliminated && p.lastPos)
          .sort(
            (a, b) =>
              haversineMeters(userPos, a.lastPos!) - haversineMeters(userPos, b.lastPos!)
          )[0]
      : undefined;

  const isHunterLockedInHeadStart = isHeadStart && role === 'hunter';
  const isHoldingRadio = radioState !== 'idle';
  const radioProgressPct = Math.min(100, (recordElapsedMs / 10_000) * 100);
  const activeBanner = localRadioBanner || radioStatusText || themeToast;

  const flashRingClass =
    flashColor === 'crimson'
      ? 'ring-red-500/90'
      : flashColor === 'amber'
      ? 'ring-amber-400/90'
      : flashColor === 'cyan'
      ? 'ring-cyan-400/90'
      : 'ring-emerald-400/90';

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#08090E] select-none">
      {/* Full-Bleed Tactical Map */}
      <TacticalMap
        center={viewer?.lastPos ?? userPos}
        mapTheme={room.settings.mapTheme}
        activeZone={room.currentZone}
        nextZonePreview={room.settings.zoneShrinkEnabled ? room.nextZonePreview : null}
        visibleMarkers={visibleMarkers}
        pings={visiblePings}
        viewerId={viewerId}
        nowMs={nowMs}
        recenterSignal={recenterSignal}
        className="w-full h-full"
      />

      {/* Stealth Mode Visual Screen-Edge Flash Overlay */}
      {flashColor && (
        <div
          aria-hidden="true"
          className={`fk-edge-flash pointer-events-none fixed inset-0 z-50 ring-[10px] ring-inset ${flashRingClass}`}
        />
      )}

      {/* Top Compact Frosted HUD Bar */}
      <div className="pointer-events-none fixed top-0 inset-x-0 z-30 pt-safe px-3 sm:px-4">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-2">
          <div className="pointer-events-auto rounded-2xl bg-[#090A10]/88 backdrop-blur-md border border-white/12 px-3.5 py-2 shadow-2xl flex items-center gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-400 leading-none">
                {phaseLabel}
              </div>
              <div
                data-testid="hud-countdown"
                className="font-display text-3xl font-extrabold text-white leading-none tabular-nums mt-0.5"
              >
                {formatCountdown(activeCountdownMs)}
              </div>
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="text-xs leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-bold uppercase ${
                    role === 'hunter'
                      ? 'text-red-400'
                      : role === 'runner'
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {role}
                </span>
                {room.settings.mode === 'imposter' && viewer && (
                  <button
                    type="button"
                    onClick={() => setRevealSecretRole((v) => !v)}
                    aria-label="Toggle secret imposter role visibility"
                    className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5 text-[11px] font-semibold"
                  >
                    {revealSecretRole ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>{viewer.isImposter ? 'IMPOSTER' : 'LOYAL'}</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Role</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-300 tabular-nums mt-0.5">
                {activeRunnersCount}R · {huntersCount}H
                {nextPingMs !== null && ` · Ping ${formatCountdown(nextPingMs)}`}
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {(!isOnline || offlineQueueCount > 0) && (
              <div
                role="status"
                className="min-h-[44px] px-3 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/60 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <WifiOff className="w-4 h-4" />
                <span>{!isOnline ? 'Offline' : `Syncing (${offlineQueueCount})`}</span>
              </div>
            )}
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onOpenMoreMenu}
              aria-label="Open Field Menu and Get Help"
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#090A10]/88 backdrop-blur-md hover:bg-[#171A26] border border-white/12 flex items-center justify-center text-white shadow-2xl"
            >
              <MoreHorizontal className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Two-Stage Out-of-Bounds Alert Banner */}
        <AnimatePresence>
          {role === 'runner' && oobEval.status !== 'inside' && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              className="pointer-events-auto max-w-md mx-auto mt-2.5 rounded-2xl bg-red-600/95 border border-red-300/60 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-white shrink-0" />
                <div className="text-xs font-bold text-white leading-snug">
                  {oobEval.status === 'exposed'
                    ? 'OUT OF BOUNDS — LIVE GPS EXPOSED TO HUNTERS!'
                    : 'OUT OF BOUNDS — RETURN TO ZONE!'}
                </div>
              </div>
              <div className="font-mono text-base font-extrabold text-white tabular-nums shrink-0">
                {oobEval.status === 'exposed'
                  ? `${oobEval.secondsUntilEliminated}s`
                  : `${oobEval.secondsUntilExposed}s`}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Status Toast (Radio / Map Style) */}
        <AnimatePresence>
          {activeBanner && (
            <motion.div
              key={activeBanner}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              role="status"
              className="pointer-events-auto max-w-xs mx-auto mt-2 rounded-xl bg-[#0A0E14]/92 backdrop-blur-md border border-emerald-400/45 px-3.5 py-2 text-xs font-semibold text-emerald-100 flex items-center justify-center gap-2 shadow-xl text-center"
            >
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{activeBanner}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Edge Unified Frosted Tool Rail */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-[#090A10]/82 backdrop-blur-md border border-white/12 shadow-2xl">
        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={() => setRecenterSignal((n) => n + 1)}
          aria-label="Recenter map on my GPS"
          className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-white/10 flex items-center justify-center text-white transition-colors"
        >
          <Crosshair className="w-5 h-5 text-cyan-400" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={handleCycleMapTheme}
          aria-label="Switch map theme"
          title={`Map Theme: ${room.settings.mapTheme}`}
          className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-white/10 flex items-center justify-center text-white transition-colors"
        >
          <Layers className="w-5 h-5 text-emerald-400" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={handleToggleFlashlight}
          aria-label={flashlightMode === 'off' ? 'Turn on Flashlight' : 'Turn off Flashlight'}
          className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center transition-colors ${
            flashlightMode !== 'off'
              ? 'bg-amber-400 text-[#08090E]'
              : 'hover:bg-white/10 text-white'
          }`}
        >
          <Flashlight className="w-5 h-5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={() => setPocketMode(true)}
          aria-label="Enable Pocket Battery-Saver Mode"
          className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-200 transition-colors"
        >
          <Lock className="w-5 h-5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={onToggleStealthHaptic}
          aria-label={
            stealthHaptic ? 'Disable Stealth Haptic Mode' : 'Enable Stealth Haptic Mode'
          }
          className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center transition-colors ${
            stealthHaptic ? 'bg-emerald-500 text-[#08090E]' : 'hover:bg-white/10 text-white'
          }`}
        >
          {stealthHaptic ? <Vibrate className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </motion.button>

        {room.settings.mode === 'imposter' && room.phase === 'hunt' && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="button"
            onClick={onCallImposterMeeting}
            aria-label="Call Emergency Meeting"
            className="min-h-[42px] min-w-[42px] rounded-xl bg-amber-500 hover:bg-amber-400 flex items-center justify-center text-[#08090E]"
          >
            <Siren className="w-5 h-5" />
          </motion.button>
        )}

        {room.isSoloDemo && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="button"
            onClick={() => setShowSoloTools((v) => !v)}
            aria-label="Toggle Solo Practice Controls"
            className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center transition-colors ${
              showSoloTools
                ? 'bg-cyan-400 text-[#08090E]'
                : 'hover:bg-white/10 text-cyan-300'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </motion.button>
        )}
      </div>

      {/* Solo Practice Quick Controls Drawer */}
      <AnimatePresence>
        {room.isSoloDemo && showSoloTools && (
          <motion.div
            initial={{ opacity: 0, x: 14, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 14, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-[68px] top-1/2 -translate-y-1/2 z-30 w-56 rounded-2xl bg-[#0B0E17]/95 backdrop-blur-md border border-cyan-500/40 p-3 shadow-2xl space-y-2"
          >
            <div className="text-xs font-bold text-cyan-300">Solo Practice Controls</div>
            {isHeadStart && onSoloSkipHeadStart && (
              <button
                type="button"
                onClick={onSoloSkipHeadStart}
                className="w-full min-h-[40px] px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 text-left"
              >
                Skip Head Start → Hunt
              </button>
            )}
            {onSoloTriggerPing && (
              <button
                type="button"
                onClick={onSoloTriggerPing}
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#151927] hover:bg-[#1E2336] border border-white/10 text-xs font-semibold text-white text-left"
              >
                Drop Radar Ping Now
              </button>
            )}
            {onSoloTriggerShrink && (
              <button
                type="button"
                onClick={onSoloTriggerShrink}
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#151927] hover:bg-[#1E2336] border border-white/10 text-xs font-semibold text-white text-left"
              >
                Trigger Zone Shrink
              </button>
            )}
            {nearestRunnerBot && onTagBotInSolo && (
              <button
                type="button"
                onClick={() => onTagBotInSolo(nearestRunnerBot.id)}
                className="w-full min-h-[40px] px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-xs font-bold text-red-200 text-left"
              >
                Simulate Tag: {nearestRunnerBot.name}
              </button>
            )}
            {onSoloFinishRound && (
              <button
                type="button"
                onClick={onSoloFinishRound}
                className="w-full min-h-[40px] px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-200 text-left"
              >
                Finish Round &amp; Recap
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Ergonomic Thumb-Zone Action Deck */}
      <div className="pointer-events-none fixed bottom-0 inset-x-0 z-30 px-3 sm:px-4 pb-safe">
        <div className="max-w-lg mx-auto space-y-2.5 pb-1">
          {/* Overhauled Team-Only Walkie-Talkie Hold-to-Talk with Live Waveform & Pulse Rings */}
          {(role === 'hunter' || role === 'runner') && (
            <div className="pointer-events-auto relative">
              {isHoldingRadio && (
                <div
                  aria-hidden="true"
                  className={`fk-radio-ring pointer-events-none absolute -inset-1 rounded-2xl border-2 ${
                    role === 'hunter' ? 'border-red-400' : 'border-emerald-400'
                  }`}
                />
              )}
              <button
                type="button"
                data-testid="walkie-talkie-btn"
                data-transmitting={isHoldingRadio ? 'true' : 'false'}
                onPointerDown={(e) => void beginRadioHold(e)}
                onPointerUp={() => void finishRadioHold()}
                onPointerCancel={() => void finishRadioHold()}
                onContextMenu={(e) => e.preventDefault()}
                className={`fk-ptt-btn relative overflow-hidden w-full min-h-[54px] px-4 rounded-2xl border font-bold text-sm flex items-center justify-center gap-3 shadow-2xl touch-none select-none transition-transform duration-150 ${
                  isHoldingRadio
                    ? role === 'hunter'
                      ? 'scale-[0.98] bg-red-600 border-red-300 text-white'
                      : 'scale-[0.98] bg-emerald-500 border-emerald-200 text-[#08090E]'
                    : role === 'hunter'
                    ? 'bg-[#180E13]/92 backdrop-blur-md hover:bg-[#24131B] border-red-500/45 text-red-100'
                    : 'bg-[#0B1B17]/92 backdrop-blur-md hover:bg-[#112822] border-emerald-500/45 text-emerald-100'
                }`}
              >
                {/* Live 10-second progress sweep fill */}
                {isHoldingRadio && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-white/20 pointer-events-none"
                    style={{ width: `${radioProgressPct}%` }}
                  />
                )}

                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  <Mic className={`w-4 h-4 shrink-0 ${isHoldingRadio ? 'scale-110' : ''}`} />
                  {isHoldingRadio ? (
                    <>
                      {/* Live 7-Bar Audio-Reactive Voice Waveform */}
                      <span
                        aria-hidden="true"
                        data-testid="walkie-waveform"
                        className="inline-flex items-center gap-[3px] h-5"
                      >
                        {WAVE_MULTIPLIERS.map((mult, i) => {
                          const dynamicWave =
                            0.28 +
                            Math.max(
                              audioLevel,
                              0.22 + 0.25 * Math.abs(Math.sin(recordElapsedMs / 135 + i * 0.9))
                            ) *
                              mult *
                              0.72;
                          return (
                            <span
                              key={i}
                              className={`w-[3px] rounded-full transition-transform duration-75 ${
                                role === 'hunter' ? 'bg-white' : 'bg-[#08090E]'
                              }`}
                              style={{
                                height: '18px',
                                transform: `scaleY(${Math.min(1, Math.max(0.22, dynamicWave))})`,
                              }}
                            />
                          );
                        })}
                      </span>
                      <span className="font-mono tabular-nums">
                        {radioState === 'connecting'
                          ? 'Connecting Mic...'
                          : `LIVE ${(recordElapsedMs / 1000).toFixed(1)}s / 10s`}
                      </span>
                    </>
                  ) : (
                    <span>
                      Hold to Talk · {role === 'hunter' ? 'Hunters' : 'Runners'} Radio
                    </span>
                  )}
                </span>
              </button>
            </div>
          )}

          {/* Runner Deliberate Slide-to-Confirm Tag Control */}
          {role === 'runner' && room.phase === 'hunt' && (
            <div className="pointer-events-auto">
              <SlideToConfirm
                label="Slide to Confirm: I Got Tagged"
                confirmedLabel="Tag Reported"
                accent="crimson"
                onConfirm={onRunnerGotTagged}
                ariaLabel="Slide to confirm I Got Tagged"
              />
            </div>
          )}

          {/* Spectator Status Bar */}
          {role === 'spectator' && (
            <div className="pointer-events-auto rounded-2xl bg-[#0D0F18]/92 backdrop-blur-md border border-white/10 px-4 py-3 text-center text-xs text-slate-300">
              <strong className="text-white">Spectator Mode</strong> ·{' '}
              {room.settings.spectatorAccess === 'live'
                ? 'Viewing all players live'
                : room.settings.spectatorAccess === 'delayed_1m'
                ? 'Viewing positions on 1-minute delay'
                : 'Map feed disabled by host'}
            </div>
          )}
        </div>
      </div>

      {/* Phase 1 Hunter Head-Start Lockout Overlay */}
      <AnimatePresence>
        {isHunterLockedInHeadStart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#08090E]/96 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
            role="dialog"
            aria-modal="true"
            aria-label="Head Start Scatter Countdown"
          >
            <div className="text-xs font-bold uppercase tracking-widest text-red-400">
              Hunter Lockdown · Head Start Active
            </div>
            <motion.div
              key={Math.ceil(activeCountdownMs / 1000)}
              initial={{ scale: 1.06, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="mt-3 font-display text-8xl font-extrabold text-white tabular-nums leading-none"
            >
              {formatCountdown(activeCountdownMs)}
            </motion.div>
            <p className="mt-4 max-w-xs text-sm text-slate-400">
              Runners are scattering into the zone. The hunt begins at 00:00.
            </p>
            {room.isSoloDemo && onSoloSkipHeadStart && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={onSoloSkipHeadStart}
                className="mt-6 min-h-[48px] px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-bold text-sm"
              >
                Skip Head Start (Demo)
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Pause Freeze Overlay */}
      {room.phase === 'emergency_pause' && room.emergency?.active && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe bg-gradient-to-t from-black via-black/95 to-transparent"
          role="alertdialog"
          aria-label="Emergency Game Pause"
        >
          <div className="max-w-md mx-auto rounded-2xl bg-[#1A0D10] border-2 border-red-500 p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 text-red-400 shrink-0" />
              <div>
                <h2 className="text-base font-extrabold text-white">
                  GAME PAUSED — EMERGENCY ALERT
                </h2>
                <p className="text-xs text-red-200">
                  {room.emergency.triggeredByName} requested help · Live GPS pinned on map
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-black/50 p-3 font-mono text-xs text-amber-200 tabular-nums">
              {room.emergency.address || 'Exact Coordinates'}: {room.emergency.lat.toFixed(5)},{' '}
              {room.emergency.lng.toFixed(5)}
            </div>
            {(room.emergency.triggeredById === viewerId || isHost) && (
              <button
                type="button"
                onClick={onResolveEmergency}
                className="mt-4 w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-bold text-sm"
              >
                {room.emergency.triggeredById === viewerId
                  ? "I'm OK — Resume Game"
                  : 'Host Resume Game'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Screen-Torch High-Brightness White Fallback */}
      {flashlightMode === 'screen' && (
        <div
          onClick={() => setFlashlightMode('off')}
          role="dialog"
          aria-label="Screen Flashlight Active"
          className="fixed inset-0 z-[75] bg-white text-[#08090E] flex flex-col items-center justify-end p-8 pb-safe cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setFlashlightMode('off')}
            className="min-h-[52px] px-8 rounded-2xl bg-[#08090E] text-white font-bold text-sm shadow-2xl"
          >
            Tap Anywhere to Turn Off Flashlight
          </button>
        </div>
      )}

      {/* Pocket Battery-Saver Mode Overlay */}
      {pocketMode && (
        <PocketModeOverlay
          countdownLabel={formatCountdown(activeCountdownMs)}
          phaseLabel={phaseLabel}
          role={role}
          oobStatus={oobEval.status}
          oobSecondsLeft={
            oobEval.status === 'exposed'
              ? oobEval.secondsUntilEliminated
              : oobEval.secondsUntilExposed
          }
          onUnlock={() => setPocketMode(false)}
        />
      )}

      {/* Imposter Emergency Meeting Modal */}
      {room.phase === 'meeting' && room.meeting?.active && (
        <ImposterMeetingModal
          meeting={room.meeting}
          players={room.players}
          viewerId={viewerId}
          nowMs={nowMs}
          isHost={isHost}
          onCastVote={onCastMeetingVote}
          onResolveMeeting={onResolveMeeting}
        />
      )}
    </div>
  );
};
