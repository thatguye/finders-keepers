import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  EyeOff,
  Flashlight,
  Map as MapIcon,
  Mic,
  MoreHorizontal,
  Radio,
  ShieldAlert,
  Siren,
  Vibrate,
  Volume2,
  WifiOff,
} from 'lucide-react';
import type { ChatMessage, ChatScope, LatLng, RoomState } from '../types/game';
import { evaluateOobState, filterVisiblePlayers } from '../game/rules';
import { formatCountdown, formatZoneSize } from '../game/geo';
import {
  disableFlashlightTorch,
  enableFlashlightTorch,
  type FlashColor,
} from '../services/hardware';
import { TacticalMap } from './TacticalMap';
import { SlideToConfirm } from './SlideToConfirm';
import { PocketModeOverlay } from './PocketModeOverlay';
import { ImposterMeetingModal } from './ImposterMeetingModal';
import { RadioView } from './RadioView';

interface ActiveGameViewProps {
  room: RoomState;
  viewerId: string;
  userPos: LatLng;
  nowMs: number;
  isOnline: boolean;
  offlineQueueCount: number;
  stealthHaptic: boolean;
  flashColor: FlashColor | null;
  unreadChatCount: number;
  latestChatMsg: ChatMessage | null;
  pocketModeOpen: boolean;
  onSetPocketMode: (open: boolean) => void;
  onRadioVisibilityChange: (isOpen: boolean) => void;
  onToggleStealthHaptic: () => void;
  onSendText: (scope: ChatScope, text: string) => void;
  onSendVoice: (
    scope: ChatScope,
    audioBase64: string,
    mimeType: string,
    durationSec: number
  ) => void;
  onOpenMoreMenu: () => void;
  onRunnerGotTagged: () => void;
  onResolveEmergency: () => void;
  onCallImposterMeeting: () => void;
  onCastMeetingVote: (targetId: string) => void;
  onResolveMeeting: () => void;
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
  unreadChatCount,
  latestChatMsg,
  pocketModeOpen,
  onSetPocketMode,
  onRadioVisibilityChange,
  onToggleStealthHaptic,
  onSendText,
  onSendVoice,
  onOpenMoreMenu,
  onRunnerGotTagged,
  onResolveEmergency,
  onCallImposterMeeting,
  onCastMeetingVote,
  onResolveMeeting,
}) => {
  const [activeTab, setActiveTab] = useState<'map' | 'radio'>('map');
  const [autoRecordSignal, setAutoRecordSignal] = useState(0);
  const [flashlightMode, setFlashlightMode] = useState<'off' | 'hardware' | 'screen'>('off');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [revealSecretRole, setRevealSecretRole] = useState(false);

  const prevTabRef = useRef<'map' | 'radio'>('map');

  const viewer = room.players.find((p) => p.id === viewerId);
  const role = viewer?.role ?? 'spectator';
  const isHost = room.hostId === viewerId;

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      onRadioVisibilityChange(activeTab === 'radio');
    }
  }, [activeTab, onRadioVisibilityChange]);

  useEffect(() => {
    return () => {
      disableFlashlightTorch();
      onRadioVisibilityChange(false);
    };
  }, [onRadioVisibilityChange]);

  const handleToggleFlashlight = async () => {
    if (flashlightMode !== 'off') {
      disableFlashlightTorch();
      setFlashlightMode('off');
      return;
    }
    const result = await enableFlashlightTorch();
    setFlashlightMode(result);
  };

  const handleOpenRadioForVoice = () => {
    setActiveTab('radio');
    setAutoRecordSignal((n) => n + 1);
  };

  // Phase & Countdown telemetry
  const isHeadStart = room.phase === 'head_start';
  const activeCountdownMs = isHeadStart
    ? Math.max(0, (room.headStartEndsAt ?? nowMs) - nowMs)
    : Math.max(0, (room.roundEndsAt ?? nowMs) - nowMs);

  const pingIntervalMs = Math.max(1, room.settings.pingIntervalMin * 60_000);
  const nextPingMs = isHeadStart
    ? activeCountdownMs
    : room.nextPingAt
    ? Math.max(0, room.nextPingAt - nowMs)
    : null;

  const pingProgress =
    nextPingMs !== null
      ? Math.max(0, Math.min(1, 1 - nextPingMs / (isHeadStart ? Math.max(1, room.settings.headStartMin * 60_000) : pingIntervalMs)))
      : 0;

  const shrinkMs =
    room.settings.zoneShrinkEnabled && room.nextZoneTransitionAt
      ? Math.max(0, room.nextZoneTransitionAt - nowMs)
      : null;

  const zoneSubtext =
    room.currentZone.shape === 'circle'
      ? `${formatZoneSize(room.currentZone.diameterMeters, room.settings.units)} across${
          shrinkMs !== null ? ` · shrinks in ${formatCountdown(shrinkMs)}` : ''
        }`
      : room.currentZone.shape === 'polygon'
      ? `Custom polygon${shrinkMs !== null ? ` · shrinks in ${formatCountdown(shrinkMs)}` : ''}`
      : 'Open world · no boundary';

  const leftMetricLabel =
    room.phase === 'head_start'
      ? 'Head start'
      : room.phase === 'emergency_pause'
      ? 'Paused'
      : room.phase === 'meeting'
      ? 'Meeting'
      : room.settings.mode === 'curfew'
      ? 'Curfew'
      : 'Time left';

  // Runners remaining bar
  const totalRunners = Math.max(
    1,
    room.players.filter((p) => (p.initialRole ?? p.role) === 'runner').length
  );
  const activeRunnersCount = room.players.filter(
    (p) => p.role === 'runner' && !p.eliminated
  ).length;
  const runnersProgressPct = Math.max(0, Math.min(100, (activeRunnersCount / totalRunners) * 100));

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

  const flashRingClass =
    flashColor === 'crimson'
      ? 'ring-red-500/90'
      : flashColor === 'amber'
      ? 'ring-amber-400/90'
      : flashColor === 'cyan'
      ? 'ring-cyan-400/90'
      : 'ring-emerald-400/90';

  const previewSender = latestChatMsg
    ? latestChatMsg.senderId === viewerId
      ? 'You'
      : latestChatMsg.senderName.replace(' (AI)', '')
    : null;

  const previewBody = latestChatMsg
    ? latestChatMsg.kind === 'voice'
      ? `Voice message (${Math.max(1, Math.round(latestChatMsg.durationSec ?? 1))}s)`
      : latestChatMsg.text ?? ''
    : 'Tap to open Team & Global Radio';

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0E0E0D] select-none">
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

      {/* Map HUD Elements (visible when on Map tab) */}
      {activeTab === 'map' && (
        <>
          {/* Top Unified 2-Column Dark Glass HUD Card */}
          <div className="pointer-events-none fixed top-0 inset-x-0 z-30 pt-safe px-3 sm:px-4">
            <div className="max-w-lg mx-auto space-y-2">
              <div
                data-testid="hud-top-card"
                className="pointer-events-auto rounded-[24px] bg-[#141312]/92 backdrop-blur-xl border border-white/[0.1] shadow-2xl overflow-hidden"
              >
                {/* Top 2-Column Split */}
                <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white/60">{leftMetricLabel}</span>
                      {room.settings.mode === 'imposter' && viewer && (
                        <button
                          type="button"
                          onClick={() => setRevealSecretRole((v) => !v)}
                          aria-label="Toggle secret imposter role visibility"
                          className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 text-[11px] font-bold"
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
                    <div
                      data-testid="hud-countdown"
                      className="mt-1 font-display text-[2.6rem] font-extrabold text-white leading-none tabular-nums tracking-tight"
                    >
                      {formatCountdown(activeCountdownMs)}
                    </div>
                  </div>

                  <div className="px-4 py-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white/60">Next ping</span>
                      <span className="font-mono text-sm font-bold text-white tabular-nums">
                        {nextPingMs !== null ? formatCountdown(nextPingMs) : 'Off'}
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-white/[0.12] overflow-hidden my-2">
                      <div
                        className="h-full rounded-full bg-[#EA3419] transition-all duration-500"
                        style={{ width: `${Math.round(pingProgress * 100)}%` }}
                      />
                    </div>

                    <div className="text-[11px] text-white/55 truncate tabular-nums">
                      {zoneSubtext}
                    </div>
                  </div>
                </div>

                {/* Bottom Runners Left Progress Bar */}
                <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center gap-3">
                  <span className="text-xs font-medium text-white/65 shrink-0">Runners left</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.14] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-300"
                      style={{ width: `${runnersProgressPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-white tabular-nums shrink-0">
                    {activeRunnersCount} of {totalRunners}
                  </span>
                </div>
              </div>

              {/* Offline Syncing Indicator & Compass Recenter Row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  {(!isOnline || offlineQueueCount > 0) && (
                    <div
                      role="status"
                      className="pointer-events-auto min-h-[38px] px-3 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-400/50 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>{!isOnline ? 'Offline' : `Syncing (${offlineQueueCount})`}</span>
                    </div>
                  )}
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => setRecenterSignal((n) => n + 1)}
                  aria-label="Recenter map on my GPS"
                  className="pointer-events-auto w-11 h-11 rounded-full bg-[#141312]/92 backdrop-blur-xl border border-white/[0.12] shadow-xl flex flex-col items-center justify-center text-white hover:bg-[#1E1D1B] transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#EA3419] mb-0.5"
                  />
                  <span className="text-[10px] font-extrabold leading-none tracking-tight">N</span>
                </motion.button>
              </div>

              {/* Two-Stage Out-of-Bounds Alert Banner */}
              <AnimatePresence>
                {role === 'runner' && oobEval.status !== 'inside' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                    className="pointer-events-auto rounded-2xl bg-[#E62E14] border border-red-300/60 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3"
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
            </div>
          </div>

          {/* Floating Lower-Edge Circular Map Buttons & Preview Banner (stacked cleanly above bottom dock) */}
          <div className="pointer-events-none fixed bottom-[86px] inset-x-0 z-30 px-3 sm:px-4">
            <div className="max-w-lg mx-auto space-y-3">
              {/* Left & Right Floating Circular Action Buttons */}
              <div className="flex items-end justify-between">
                <div className="flex flex-col gap-2.5 pointer-events-auto">
                  {room.settings.mode === 'imposter' && room.phase === 'hunt' && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      onClick={onCallImposterMeeting}
                      aria-label="Call Emergency Meeting"
                      className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-[#141413] shadow-xl flex items-center justify-center transition-colors"
                    >
                      <Siren className="w-5 h-5" />
                    </motion.button>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={handleToggleFlashlight}
                    aria-label={flashlightMode === 'off' ? 'Turn on Flashlight' : 'Turn off Flashlight'}
                    className={`w-12 h-12 rounded-full backdrop-blur-xl border shadow-xl flex items-center justify-center transition-colors ${
                      flashlightMode !== 'off'
                        ? 'bg-amber-400 border-amber-300 text-[#141413]'
                        : 'bg-[#141312]/92 border-white/[0.12] text-white hover:bg-[#1F1E1C]'
                    }`}
                  >
                    <Flashlight className="w-5 h-5" />
                  </motion.button>
                </div>

                <div className="flex flex-col items-center gap-2.5 pointer-events-auto">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={onToggleStealthHaptic}
                    aria-label={
                      stealthHaptic ? 'Disable Stealth Haptic Mode' : 'Enable Stealth Haptic Mode'
                    }
                    className={`w-11 h-11 rounded-full backdrop-blur-xl border shadow-xl flex items-center justify-center transition-colors ${
                      stealthHaptic
                        ? 'bg-[#E62E14] border-[#FF6B52] text-white'
                        : 'bg-[#141312]/92 border-white/[0.12] text-white hover:bg-[#1F1E1C]'
                    }`}
                  >
                    {stealthHaptic ? (
                      <Vibrate className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    data-testid="map-quick-mic-btn"
                    onClick={handleOpenRadioForVoice}
                    aria-label="Open Radio and record voice message"
                    className="w-14 h-14 rounded-full bg-[#1A1514]/95 hover:bg-[#2A1B18] backdrop-blur-xl border border-[#EA3419]/35 text-[#FF5733] shadow-2xl flex items-center justify-center transition-colors"
                  >
                    <Mic className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>

              {/* Latest Radio Message Preview + Contextual Status / Slide-to-Tag Card */}
              <div className="pointer-events-auto rounded-[24px] bg-[#141312]/94 backdrop-blur-xl border border-white/[0.1] p-2.5 shadow-2xl space-y-2">
                <button
                  type="button"
                  data-testid="radio-preview-row"
                  onClick={() => setActiveTab('radio')}
                  className="w-full min-h-[38px] px-2.5 flex items-center justify-between gap-2 text-left rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 text-sm">
                    {previewSender && (
                      <span className="font-bold text-white shrink-0">{previewSender}</span>
                    )}
                    <span className="text-white/75 truncate">{previewBody}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/45 shrink-0" />
                </button>

                {isHeadStart && role === 'hunter' && (
                  <div className="rounded-[18px] bg-[#21201E] px-4 py-3 text-center">
                    <div className="text-base font-bold text-white/85">Runners are hiding</div>
                    <div className="text-xs text-white/50 tabular-nums mt-0.5">
                      You&apos;re out in {formatCountdown(activeCountdownMs)}
                    </div>
                  </div>
                )}

                {isHeadStart && role === 'runner' && (
                  <div className="rounded-[18px] bg-[#11281E] border border-emerald-500/30 px-4 py-3 text-center">
                    <div className="text-base font-bold text-emerald-300">Run &amp; hide now</div>
                    <div className="text-xs text-emerald-200/70 tabular-nums mt-0.5">
                      Hunters release in {formatCountdown(activeCountdownMs)}
                    </div>
                  </div>
                )}

                {role === 'runner' && room.phase === 'hunt' && (
                  <SlideToConfirm
                    label="Slide to Confirm: I Got Tagged"
                    confirmedLabel="Tag Reported"
                    accent="crimson"
                    onConfirm={onRunnerGotTagged}
                    ariaLabel="Slide to confirm I Got Tagged"
                  />
                )}

                {role === 'spectator' && (
                  <div className="rounded-[18px] bg-[#21201E] px-4 py-2.5 text-center text-xs text-white/70">
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
          </div>
        </>
      )}

      {/* Full-Screen Radio View (Team & Global + Voice Messages) */}
      <AnimatePresence>
        {activeTab === 'radio' && (
          <RadioView
            room={room}
            viewer={viewer}
            nowMs={nowMs}
            stealthHaptic={stealthHaptic}
            onToggleStealthHaptic={onToggleStealthHaptic}
            onBackToMap={() => setActiveTab('map')}
            onSendText={onSendText}
            onSendVoice={onSendVoice}
            autoRecordSignal={autoRecordSignal}
          />
        )}
      </AnimatePresence>

      {/* Bottom Floating Navigation Dock: Map | Radio Pill + Circular More (...) Button */}
      <div className="pointer-events-none fixed bottom-0 inset-x-0 z-40 px-3 sm:px-4 pb-safe">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <nav
            aria-label="Primary game navigation"
            className="pointer-events-auto flex-1 rounded-full bg-[#141312]/95 backdrop-blur-xl border border-white/[0.11] p-1.5 grid grid-cols-2 gap-1 shadow-2xl"
          >
            <button
              type="button"
              data-testid="nav-map-tab"
              onClick={() => setActiveTab('map')}
              aria-current={activeTab === 'map' ? 'page' : undefined}
              className={`min-h-[48px] rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeTab === 'map'
                  ? 'bg-[#3A1813] text-[#FF5733]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <MapIcon className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Map</span>
            </button>

            <button
              type="button"
              data-testid="nav-radio-tab"
              onClick={() => setActiveTab('radio')}
              aria-current={activeTab === 'radio' ? 'page' : undefined}
              className={`relative min-h-[48px] rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeTab === 'radio'
                  ? 'bg-[#3A1813] text-[#FF5733]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <div className="relative">
                <Radio className="w-5 h-5" />
                {unreadChatCount > 0 && activeTab !== 'radio' && (
                  <span
                    data-testid="radio-unread-badge"
                    className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EA3419] text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums shadow"
                  >
                    {unreadChatCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold leading-none">Radio</span>
            </button>
          </nav>

          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            data-testid="nav-more-btn"
            onClick={onOpenMoreMenu}
            aria-label="Open Controls and Get Help"
            className="pointer-events-auto w-[60px] h-[60px] rounded-full bg-[#141312]/95 hover:bg-[#1F1E1C] backdrop-blur-xl border border-white/[0.11] shadow-2xl flex items-center justify-center text-white shrink-0 transition-colors"
          >
            <MoreHorizontal className="w-6 h-6" />
          </motion.button>
        </div>
      </div>

      {/* Emergency Pause Freeze Overlay */}
      {room.phase === 'emergency_pause' && room.emergency?.active && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe bg-gradient-to-t from-black via-black/95 to-transparent"
          role="alertdialog"
          aria-label="Emergency Game Pause"
        >
          <div className="max-w-md mx-auto rounded-3xl bg-[#1A0D10] border-2 border-[#E62E14] p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 text-[#FF5733] shrink-0" />
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
                className="mt-4 w-full min-h-[48px] rounded-2xl bg-white hover:bg-white/90 text-[#141413] font-bold text-sm"
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
          className="fixed inset-0 z-[75] bg-white text-[#141413] flex flex-col items-center justify-end p-8 pb-safe cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setFlashlightMode('off')}
            className="min-h-[52px] px-8 rounded-2xl bg-[#141413] text-white font-bold text-sm shadow-2xl"
          >
            Tap Anywhere to Turn Off Flashlight
          </button>
        </div>
      )}

      {/* Pocket Battery-Saver Mode Overlay */}
      {pocketModeOpen && (
        <PocketModeOverlay
          countdownLabel={formatCountdown(activeCountdownMs)}
          phaseLabel={leftMetricLabel.toUpperCase()}
          role={role}
          oobStatus={oobEval.status}
          oobSecondsLeft={
            oobEval.status === 'exposed'
              ? oobEval.secondsUntilEliminated
              : oobEval.secondsUntilExposed
          }
          onUnlock={() => onSetPocketMode(false)}
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
