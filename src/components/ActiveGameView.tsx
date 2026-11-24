import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  Eye,
  EyeOff,
  Flashlight,
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
import type { LatLng, RoomState } from '../types/game';
import { evaluateOobState, filterVisiblePlayers } from '../game/rules';
import { formatCountdown, haversineMeters } from '../game/geo';
import {
  type ActiveRecorder,
  disableFlashlightTorch,
  enableFlashlightTorch,
  type FlashColor,
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

  // Walkie-Talkie Hold-to-Talk state
  const [recordingRadio, setRecordingRadio] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<ActiveRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  const viewer = room.players.find((p) => p.id === viewerId);
  const role = viewer?.role ?? 'spectator';
  const isHost = room.hostId === viewerId;

  useEffect(() => {
    return () => {
      disableFlashlightTorch();
      recorderRef.current?.cancel();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, []);

  const handleToggleFlashlight = async () => {
    if (flashlightMode !== 'off') {
      disableFlashlightTorch();
      setFlashlightMode('off');
      return;
    }
    const result = await enableFlashlightTorch();
    setFlashlightMode(result);
  };

  const startHoldRadio = async () => {
    if (role !== 'hunter' && role !== 'runner') return;
    if (recordingRadio) return;
    const rec = await startRadioRecording(10);
    if (!rec) return;
    recorderRef.current = rec;
    setRecordingRadio(true);
    setRecordSec(0);
    const started = Date.now();
    recordTimerRef.current = window.setInterval(() => {
      const elapsed = Math.min(10, Math.floor((Date.now() - started) / 1000));
      setRecordSec(elapsed);
      if (elapsed >= 10) {
        void stopHoldRadio();
      }
    }, 250);
  };

  const stopHoldRadio = async () => {
    if (!recordingRadio) return;
    setRecordingRadio(false);
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      const clip = await rec.stop();
      if (clip) {
        onSendRadioClip(clip.base64, clip.mimeType, clip.durationSec);
      }
    }
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
      ? 'HEAD START · SCATTER'
      : room.phase === 'emergency_pause'
      ? 'EMERGENCY PAUSE'
      : room.phase === 'meeting'
      ? 'EMERGENCY MEETING'
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

  // In Solo Practice as Hunter, find closest runner bot for 1-tap test tag
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

  const flashRingClass =
    flashColor === 'crimson'
      ? 'ring-red-500/90'
      : flashColor === 'amber'
      ? 'ring-amber-400/90'
      : flashColor === 'cyan'
      ? 'ring-cyan-400/90'
      : 'ring-emerald-400/90';

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#09090E] select-none">
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

      {/* Top Compact HUD Bar (Pointer-events passthrough wrapper) */}
      <div className="pointer-events-none fixed top-0 inset-x-0 z-30 pt-safe px-3 sm:px-4">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-2">
          {/* Countdown & Phase Readout */}
          <div className="pointer-events-auto rounded-2xl bg-[#09090E]/92 border border-[#282E42] px-3.5 py-2 shadow-xl flex items-center gap-3">
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
              <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                {activeRunnersCount}R · {huntersCount}H
                {nextPingMs !== null && ` · Ping ${formatCountdown(nextPingMs)}`}
              </div>
            </div>
          </div>

          {/* Right Top Controls */}
          <div className="pointer-events-auto flex items-center gap-2">
            {(!isOnline || offlineQueueCount > 0) && (
              <div
                role="status"
                className="min-h-[44px] px-3 rounded-xl bg-amber-500/20 border border-amber-400/60 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <WifiOff className="w-4 h-4" />
                <span>{!isOnline ? 'Offline' : `Syncing (${offlineQueueCount})`}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onOpenMoreMenu}
              aria-label="Open Field Menu and Get Help"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#09090E]/92 hover:bg-[#171A26] border border-[#282E42] flex items-center justify-center text-white shadow-xl"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Two-Stage Out-of-Bounds Alert Banner */}
        {role === 'runner' && oobEval.status !== 'inside' && (
          <div className="pointer-events-auto max-w-md mx-auto mt-2.5 rounded-xl bg-red-600/95 border border-red-300/60 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-white shrink-0" />
              <div className="text-xs font-bold text-white leading-snug">
                {oobEval.status === 'exposed'
                  ? 'OUT OF BOUNDS — YOUR LIVE GPS IS EXPOSED TO HUNTERS!'
                  : 'OUT OF BOUNDS — RETURN TO ZONE!'}
              </div>
            </div>
            <div className="font-mono text-base font-extrabold text-white tabular-nums shrink-0">
              {oobEval.status === 'exposed'
                ? `${oobEval.secondsUntilEliminated}s`
                : `${oobEval.secondsUntilExposed}s`}
            </div>
          </div>
        )}

        {/* Incoming Team Radio Transmission Indicator */}
        {radioStatusText && (
          <div className="pointer-events-auto max-w-xs mx-auto mt-2 rounded-xl bg-[#0B1F19]/95 border border-emerald-400/50 px-3.5 py-2 text-xs font-semibold text-emerald-200 flex items-center justify-center gap-2 shadow-lg">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>{radioStatusText}</span>
          </div>
        )}
      </div>

      {/* Right Edge Tactical Hardware Tool Rail */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setRecenterSignal((n) => n + 1)}
          aria-label="Recenter map on my GPS"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-[#09090E]/92 hover:bg-[#191C2A] border border-[#2A3046] flex items-center justify-center text-white shadow-xl"
        >
          <Crosshair className="w-5 h-5 text-cyan-400" />
        </button>

        <button
          type="button"
          onClick={handleToggleFlashlight}
          aria-label={flashlightMode === 'off' ? 'Turn on Flashlight' : 'Turn off Flashlight'}
          className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shadow-xl transition-colors ${
            flashlightMode !== 'off'
              ? 'bg-amber-400 border-amber-300 text-[#09090E]'
              : 'bg-[#09090E]/92 hover:bg-[#191C2A] border-[#2A3046] text-white'
          }`}
        >
          <Flashlight className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => setPocketMode(true)}
          aria-label="Enable Pocket Battery-Saver Mode"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-[#09090E]/92 hover:bg-[#191C2A] border border-[#2A3046] flex items-center justify-center text-white shadow-xl"
        >
          <Lock className="w-5 h-5 text-slate-200" />
        </button>

        <button
          type="button"
          onClick={onToggleStealthHaptic}
          aria-label={
            stealthHaptic ? 'Disable Stealth Haptic Mode' : 'Enable Stealth Haptic Mode'
          }
          className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shadow-xl transition-colors ${
            stealthHaptic
              ? 'bg-emerald-500 border-emerald-400 text-[#09090E]'
              : 'bg-[#09090E]/92 hover:bg-[#191C2A] border-[#2A3046] text-white'
          }`}
        >
          {stealthHaptic ? <Vibrate className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {room.settings.mode === 'imposter' && room.phase === 'hunt' && (
          <button
            type="button"
            onClick={onCallImposterMeeting}
            aria-label="Call Emergency Meeting"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 border border-amber-300 flex items-center justify-center text-[#09090E] shadow-xl"
          >
            <Siren className="w-5 h-5" />
          </button>
        )}

        {room.isSoloDemo && (
          <button
            type="button"
            onClick={() => setShowSoloTools((v) => !v)}
            aria-label="Toggle Solo Practice Controls"
            className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shadow-xl transition-colors ${
              showSoloTools
                ? 'bg-cyan-500 border-cyan-300 text-[#09090E]'
                : 'bg-[#09090E]/92 hover:bg-[#191C2A] border-[#2A3046] text-cyan-300'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Solo Practice Quick Controls Drawer */}
      {room.isSoloDemo && showSoloTools && (
        <div className="fixed right-16 top-1/2 -translate-y-1/2 z-30 w-56 rounded-2xl bg-[#0E1019]/96 border border-cyan-500/40 p-3 shadow-2xl space-y-2">
          <div className="text-xs font-bold text-cyan-300">Solo Practice Controls</div>
          {isHeadStart && onSoloSkipHeadStart && (
            <button
              type="button"
              onClick={onSoloSkipHeadStart}
              className="w-full min-h-[40px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 text-left"
            >
              Skip Head Start → Hunt
            </button>
          )}
          {onSoloTriggerPing && (
            <button
              type="button"
              onClick={onSoloTriggerPing}
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#171B2A] hover:bg-[#1F2438] border border-[#2C334B] text-xs font-semibold text-white text-left"
            >
              Drop Radar Ping Now
            </button>
          )}
          {onSoloTriggerShrink && (
            <button
              type="button"
              onClick={onSoloTriggerShrink}
              className="w-full min-h-[40px] px-3 rounded-lg bg-[#171B2A] hover:bg-[#1F2438] border border-[#2C334B] text-xs font-semibold text-white text-left"
            >
              Trigger Zone Shrink
            </button>
          )}
          {nearestRunnerBot && onTagBotInSolo && (
            <button
              type="button"
              onClick={() => onTagBotInSolo(nearestRunnerBot.id)}
              className="w-full min-h-[40px] px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-xs font-bold text-red-200 text-left"
            >
              Simulate Tag: {nearestRunnerBot.name}
            </button>
          )}
          {onSoloFinishRound && (
            <button
              type="button"
              onClick={onSoloFinishRound}
              className="w-full min-h-[40px] px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-200 text-left"
            >
              Finish Round &amp; View Poster
            </button>
          )}
        </div>
      )}

      {/* Bottom Ergonomic Thumb-Zone Action Deck */}
      <div className="pointer-events-none fixed bottom-0 inset-x-0 z-30 px-3 sm:px-4 pb-safe">
        <div className="max-w-lg mx-auto space-y-2.5 pb-1">
          {/* Team-Only Walkie-Talkie Hold-to-Talk */}
          {(role === 'hunter' || role === 'runner') && (
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onMouseDown={() => void startHoldRadio()}
                onMouseUp={() => void stopHoldRadio()}
                onMouseLeave={() => void stopHoldRadio()}
                onTouchStart={(e) => {
                  e.preventDefault();
                  void startHoldRadio();
                }}
                onTouchEnd={() => void stopHoldRadio()}
                onTouchCancel={() => void stopHoldRadio()}
                className={`flex-1 min-h-[50px] px-4 rounded-2xl border font-bold text-sm flex items-center justify-center gap-2 shadow-xl transition-colors ${
                  recordingRadio
                    ? 'bg-red-600 border-red-300 text-white'
                    : role === 'hunter'
                    ? 'bg-[#1D1116]/95 hover:bg-[#29161D] border-red-500/50 text-red-100'
                    : 'bg-[#0D1E1A]/95 hover:bg-[#132B25] border-emerald-500/50 text-emerald-100'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>
                  {recordingRadio
                    ? `Transmitting ${recordSec}s / 10s...`
                    : `Hold to Talk · ${role === 'hunter' ? 'Hunters' : 'Runners'} Radio`}
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
            <div className="pointer-events-auto rounded-2xl bg-[#0E1019]/95 border border-[#282E42] px-4 py-3 text-center text-xs text-slate-300">
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
      {isHunterLockedInHeadStart && (
        <div
          className="fixed inset-0 z-40 bg-[#09090E]/96 flex flex-col items-center justify-center p-6 text-center"
          role="dialog"
          aria-modal="true"
          aria-label="Head Start Scatter Countdown"
        >
          <div className="text-xs font-bold uppercase tracking-widest text-red-400">
            Hunter Lockdown · Head Start Active
          </div>
          <div className="mt-3 font-display text-8xl font-extrabold text-white tabular-nums leading-none">
            {formatCountdown(activeCountdownMs)}
          </div>
          <p className="mt-4 max-w-xs text-sm text-slate-400">
            Runners are scattering. Hunt begins at 00:00.
          </p>
          {room.isSoloDemo && onSoloSkipHeadStart && (
            <button
              type="button"
              onClick={onSoloSkipHeadStart}
              className="mt-6 min-h-[48px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#09090E] font-bold text-sm"
            >
              Skip Head Start (Demo)
            </button>
          )}
        </div>
      )}

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
                className="mt-4 w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#09090E] font-bold text-sm"
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
          className="fixed inset-0 z-[75] bg-white text-[#09090E] flex flex-col items-center justify-end p-8 pb-safe cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setFlashlightMode('off')}
            className="min-h-[52px] px-8 rounded-2xl bg-[#09090E] text-white font-bold text-sm shadow-2xl"
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
