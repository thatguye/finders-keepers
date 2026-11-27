import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Map as MapIcon,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  QrCode,
  Radio,
  Save,
  ShieldAlert,
  Trash2,
  UserMinus,
} from 'lucide-react';
import type {
  ActiveZone,
  CustomPreset,
  LatLng,
  MapTheme,
  RoomSettings,
  RoomState,
  SpectatorAccess,
  TeamPreference,
  UnitSystem,
} from '../types/game';
import {
  applyBuiltInPreset,
  BUILT_IN_PRESETS,
  formatRoomCodeInput,
  getCallsignInitial,
  type VisiblePlayerMarker,
} from '../game/rules';
import { formatZoneSize } from '../game/geo';
import { TacticalMap } from './TacticalMap';
import { GAME_MODES, ModePickerSheet } from './ModePickerSheet';
import { MAP_THEME_OPTIONS, MapPickerSheet } from './MapPickerSheet';
import { PlayZoneEditorSheet } from './PlayZoneEditorSheet';

interface LobbyViewProps {
  room: RoomState;
  viewerId: string;
  userPos: LatLng;
  personalMapTheme: MapTheme;
  customPresets: CustomPreset[];
  unreadChatCount?: number;
  onUpdateSettings: (settings: RoomSettings) => void;
  onChangePersonalMapTheme: (theme: MapTheme) => void;
  onChangeRoomCode: (newCode: string) => void;
  onUpdatePreference: (pref: TeamPreference) => void;
  onCycleBotPreference?: (botId: string) => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onStartRound: () => void;
  onLeaveLobby: () => void;
  onShowQr: () => void;
  onOpenChat: () => void;
  onOpenHowToPlay: () => void;
  onOpenGetHelp: () => void;
  onOpenMoreMenu: () => void;
}

const ROUND_STEPS = [10, 15, 20, 30, 45, 60, 90, 120, 180];
const HEAD_START_STEPS = [0, 1, 2, 3, 5, 10, 15, 20, 30];
const PING_STEPS = [0, 1, 2, 3, 5, 10, 15, 20, 30];

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  viewerId,
  userPos,
  personalMapTheme,
  customPresets,
  unreadChatCount = 0,
  onUpdateSettings,
  onChangePersonalMapTheme,
  onChangeRoomCode,
  onUpdatePreference,
  onCycleBotPreference,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onRemovePlayer,
  onStartRound,
  onLeaveLobby,
  onShowQr,
  onOpenChat,
  onOpenHowToPlay,
  onOpenGetHelp,
  onOpenMoreMenu,
}) => {
  const [copied, setCopied] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(room.code);
  const [showModeSheet, setShowModeSheet] = useState(false);
  const [showMapSheet, setShowMapSheet] = useState(false);
  const [showZoneEditor, setShowZoneEditor] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetName, setPresetName] = useState('');

  const viewer = room.players.find((p) => p.id === viewerId);
  const isHost = room.hostId === viewerId;
  const s = room.settings;

  const activeModeMeta = GAME_MODES.find((m) => m.id === s.mode) ?? GAME_MODES[0];
  const activeMapMeta =
    MAP_THEME_OPTIONS.find((m) => m.id === personalMapTheme) ?? MAP_THEME_OPTIONS[0];

  const lobbyPlayerMarkers: VisiblePlayerMarker[] = useMemo(
    () =>
      room.players.map((p) => ({
        player: p,
        position: p.lastPos ?? {
          lat: s.zone.center.lat,
          lng: s.zone.center.lng,
          ts: p.lastSeenAt,
        },
        isExposedOob: false,
        isEmergencyPin: false,
        isDelayed: false,
      })),
    [room.players, s.zone.center.lat, s.zone.center.lng]
  );

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?code=${room.code}`
      : `?code=${room.code}`;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleCommitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = formatRoomCodeInput(codeDraft);
    if (cleaned.length === 6 && cleaned !== room.code) {
      onChangeRoomCode(cleaned);
    }
    setEditingCode(false);
  };

  const patchSettings = (patch: Partial<RoomSettings>) => {
    if (!isHost) return;
    onUpdateSettings({ ...s, ...patch });
  };

  const stepOption = (values: number[], current: number, delta: -1 | 1): number => {
    if (delta > 0) {
      return values.find((v) => v > current) ?? values[values.length - 1];
    }
    const lower = [...values].reverse().find((v) => v < current);
    return lower !== undefined ? lower : values[0];
  };

  const activePresetId = useMemo(() => {
    if (s.roundLengthMin === 15 && s.pingIntervalMin === 1 && s.headStartMin === 1) return 'quick';
    if (s.roundLengthMin === 60 && s.pingIntervalMin === 2 && s.headStartMin === 3)
      return 'standard';
    if (s.roundLengthMin === 120 && s.pingIntervalMin === 5 && s.headStartMin === 5)
      return 'big_park';
    return null;
  }, [s.roundLengthMin, s.pingIntervalMin, s.headStartMin]);

  const formatRoundLength = (min: number) => {
    if (min < 60) return `${min} min`;
    const hrs = Math.floor(min / 60);
    const rem = min % 60;
    return rem === 0 ? `${hrs} hr` : `${hrs}h ${rem}m`;
  };

  const zoneSummary =
    s.zone.shape === 'off'
      ? 'Off · play anywhere without boundaries'
      : s.zone.shape === 'polygon'
      ? `Drawn (${s.zone.polygon.length} corners)${
          s.zoneShrinkEnabled
            ? ` · Shrinks to ${formatZoneSize(s.finalZoneDiameterMeters, s.units)}`
            : ' · Fixed'
        }`
      : `${formatZoneSize(s.zone.diameterMeters, s.units)} across${
          s.zoneShrinkEnabled
            ? ` · Shrinks to ${formatZoneSize(s.finalZoneDiameterMeters, s.units)}`
            : ' · Fixed'
        }`;

  const hunterPrefCount = room.players.filter((p) => p.preference === 'hunter').length;
  const runnerPrefCount = room.players.filter((p) => p.preference === 'runner').length;
  const randomPrefCount = room.players.filter((p) => p.preference === 'random').length;
  const maxHunters = room.players.length >= 2 ? Math.floor(room.players.length / 2) : 1;
  const minHunters = room.players.length >= 2 ? Math.max(1, Math.ceil(room.players.length / 10)) : 1;

  const handleSavePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed);
    setPresetName('');
  };

  return (
    <div className="min-h-dvh bg-[#08090E] text-[#F4F5F9] flex flex-col">
      {/* Clean Sticky Lobby Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0A0C13]/92 backdrop-blur-xl pt-safe">
        <div
          data-testid="lobby-header-bar"
          className="relative max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1 min-w-0 z-10">
            <button
              type="button"
              onClick={onLeaveLobby}
              aria-label="Leave lobby"
              className="min-h-[44px] px-2 -ml-1 rounded-xl text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 text-sm font-bold shrink-0"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              <span>Back</span>
            </button>
          </div>

          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-display text-[22px] sm:text-2xl font-extrabold tracking-wide text-white leading-none text-center whitespace-nowrap">
            {room.isSoloDemo ? 'Demo Lobby' : 'Lobby'}
          </h1>

          <div data-testid="lobby-header-actions" className="flex items-center gap-1.5 shrink-0 z-10">
            <button
              type="button"
              onClick={onShowQr}
              aria-label="Show QR Code"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-[#151824] hover:bg-[#1E2334] border border-white/[0.09] flex items-center justify-center text-emerald-400"
            >
              <QrCode className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenChat}
              aria-label="Open Lobby Radio"
              className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-[#151824] hover:bg-[#1E2334] border border-white/[0.09] flex items-center justify-center text-emerald-400"
            >
              <Radio className="w-4 h-4" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-400 text-[#08090E] text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                  {unreadChatCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenMoreMenu}
              aria-label="More options"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-[#151824] hover:bg-[#1E2334] border border-white/[0.09] flex items-center justify-center text-white"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content: Single Scannable Scroll Column on Mobile, 2-Column with Live Map on Desktop */}
      <main
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        style={{ paddingBottom: 'calc(98px + max(env(safe-area-inset-bottom, 0px), 12px))' }}
      >
        <div className="lg:col-span-6 space-y-4">
          {/* 1. GAME CODE CARD (Editable Custom 6-Char Code + Copy) */}
          <section className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div data-testid="lobby-room-code-block" className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Game code · {room.isSoloDemo ? 'Practice' : isHost ? 'Hosting' : 'Joined'}
                </div>

                {editingCode ? (
                  <form onSubmit={handleCommitCode} className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      data-testid="custom-code-input"
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={codeDraft}
                      onChange={(e) => setCodeDraft(formatRoomCodeInput(e.target.value))}
                      className="flex-1 min-w-[128px] max-w-[164px] min-h-[42px] px-3 rounded-xl bg-[#08090E] border border-emerald-400 font-mono text-xl font-extrabold tracking-[0.18em] text-emerald-300 uppercase focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={codeDraft.length !== 6}
                      className="min-h-[42px] px-3.5 rounded-xl bg-emerald-500 disabled:opacity-40 text-[#08090E] text-xs font-extrabold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCodeDraft(room.code);
                        setEditingCode(false);
                      }}
                      className="min-h-[42px] px-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div
                    data-testid="lobby-code-value"
                    className="mt-1 font-mono text-3xl sm:text-4xl font-extrabold tracking-[0.18em] text-emerald-400 leading-none tabular-nums"
                  >
                    {room.code}
                  </div>
                )}
              </div>

              {!editingCode && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-white inline-flex items-center gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      data-testid="change-room-code-btn"
                      onClick={() => {
                        setCodeDraft(room.code);
                        setEditingCode(true);
                      }}
                      className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-slate-200"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 2. GAME MODE & YOUR MAP COMPACT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Game Mode Card */}
            <section className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeModeMeta.art}
                  alt={activeModeMeta.name}
                  className="w-12 h-14 rounded-xl object-cover border border-white/15 shrink-0 bg-[#08090E]"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Game mode
                  </div>
                  <div className="text-base font-extrabold text-white truncate">
                    {activeModeMeta.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {activeModeMeta.tagline}
                  </div>
                </div>
              </div>
              <button
                type="button"
                data-testid="lobby-change-mode-btn"
                onClick={() => setShowModeSheet(true)}
                className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-emerald-300 shrink-0"
              >
                Change
              </button>
            </section>

            {/* Personal Map Theme Card */}
            <section className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-12 h-14 rounded-xl border border-white/15 flex items-center justify-center shrink-0"
                  style={{ backgroundColor: activeMapMeta.previewBg }}
                >
                  <MapIcon
                    className="w-5 h-5"
                    style={{ color: activeMapMeta.zoneColor }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Your map
                  </div>
                  <div className="text-base font-extrabold text-white truncate">
                    {activeMapMeta.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">Only on your screen.</div>
                </div>
              </div>
              <button
                type="button"
                data-testid="lobby-change-map-btn"
                onClick={() => setShowMapSheet(true)}
                className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-emerald-300 shrink-0"
              >
                Change
              </button>
            </section>
          </div>

          {/* 3. HOUSE RULES CARD (Presets + Thumb-Friendly Steppers + Hunters Can Talk + Play Zone Sheet) */}
          <section className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                House rules
              </h2>
              {!isHost && (
                <span className="text-[11px] text-slate-500">Host controls rules</span>
              )}
            </div>

            {/* 3-Way Preset Segmented Bar */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#08090E] border border-white/[0.07]">
                {BUILT_IN_PRESETS.map((preset) => {
                  const active = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateSettings(applyBuiltInPreset(s, preset.id))}
                      className={`min-h-[40px] rounded-xl text-xs font-bold transition-colors disabled:opacity-70 ${
                        active
                          ? 'bg-emerald-500 text-[#08090E]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 px-1">
                {activePresetId
                  ? BUILT_IN_PRESETS.find((p) => p.id === activePresetId)?.summary
                  : 'Custom house rules active'}
              </p>
            </div>

            {/* Stepper Rows */}
            <div className="divide-y divide-white/[0.07]">
              {/* Round Length */}
              <div className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Round length</div>
                  <div className="text-xs text-slate-400">Total hunt timer</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!isHost || s.roundLengthMin <= ROUND_STEPS[0]}
                    onClick={() =>
                      patchSettings({
                        roundLengthMin: stepOption(ROUND_STEPS, s.roundLengthMin, -1),
                      })
                    }
                    aria-label="Decrease round length"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-bold text-white min-w-[58px] text-center tabular-nums">
                    {formatRoundLength(s.roundLengthMin)}
                  </span>
                  <button
                    type="button"
                    disabled={!isHost || s.roundLengthMin >= ROUND_STEPS[ROUND_STEPS.length - 1]}
                    onClick={() =>
                      patchSettings({
                        roundLengthMin: stepOption(ROUND_STEPS, s.roundLengthMin, 1),
                      })
                    }
                    aria-label="Increase round length"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Head Start */}
              <div className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Head start</div>
                  <div className="text-xs text-slate-400">Time for Runners to scatter</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!isHost || s.headStartMin <= 0}
                    onClick={() =>
                      patchSettings({
                        headStartMin: stepOption(HEAD_START_STEPS, s.headStartMin, -1),
                      })
                    }
                    aria-label="Decrease head start"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-bold text-amber-300 min-w-[58px] text-center tabular-nums">
                    {s.headStartMin === 0 ? 'Off' : `${s.headStartMin} min`}
                  </span>
                  <button
                    type="button"
                    disabled={!isHost || s.headStartMin >= 30}
                    onClick={() =>
                      patchSettings({
                        headStartMin: stepOption(HEAD_START_STEPS, s.headStartMin, 1),
                      })
                    }
                    aria-label="Increase head start"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Radar Pings */}
              <div className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Pings</div>
                  <div className="text-xs text-slate-400">How often Runners blip on radar</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!isHost || s.pingIntervalMin <= 0}
                    onClick={() =>
                      patchSettings({
                        pingIntervalMin: stepOption(PING_STEPS, s.pingIntervalMin, -1),
                      })
                    }
                    aria-label="Decrease ping interval"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-bold text-cyan-300 min-w-[58px] text-center tabular-nums">
                    {s.pingIntervalMin === 0 ? 'Off' : `${s.pingIntervalMin} min`}
                  </span>
                  <button
                    type="button"
                    disabled={!isHost || s.pingIntervalMin >= 30}
                    onClick={() =>
                      patchSettings({
                        pingIntervalMin: stepOption(PING_STEPS, s.pingIntervalMin, 1),
                      })
                    }
                    aria-label="Increase ping interval"
                    className="w-10 h-10 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-35 border border-white/[0.09] flex items-center justify-center text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Hunters Can Talk Toggle */}
              <div className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Hunters can talk</div>
                  <div className="text-xs text-slate-400">Private Hunter team radio channel</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.huntersCanTalk !== false}
                  disabled={!isHost}
                  onClick={() => patchSettings({ huntersCanTalk: !(s.huntersCanTalk !== false) })}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                    s.huntersCanTalk !== false ? 'bg-emerald-500' : 'bg-[#252A3B]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                      s.huntersCanTalk !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Play Zone Toggle + Full-Screen Editor Trigger */}
              <div className="pt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Play zone</div>
                    <div className="text-xs text-slate-400">Out-of-bounds auto-eliminates in 30s</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.zone.shape !== 'off'}
                    disabled={!isHost}
                    onClick={() =>
                      patchSettings({
                        zone: {
                          ...s.zone,
                          shape: s.zone.shape === 'off' ? 'circle' : 'off',
                        },
                      })
                    }
                    className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                      s.zone.shape !== 'off' ? 'bg-emerald-500' : 'bg-[#252A3B]'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                        s.zone.shape !== 'off' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {s.zone.shape !== 'off' && (
                  <button
                    type="button"
                    data-testid="open-play-zone-editor-btn"
                    disabled={!isHost}
                    onClick={() => setShowZoneEditor(true)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-[#090B12] hover:bg-[#141827] border border-emerald-500/25 flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-75"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-emerald-300 truncate tabular-nums">
                      {zoneSummary}
                    </span>
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Advanced Settings (Spectators, Units, Saved Presets) */}
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full min-h-[38px] flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white"
              >
                <span>Units, spectators &amp; saved setups</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>

              {showAdvanced && (
                <div className="pt-3 space-y-4">
                  {/* Distance Units */}
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-1.5">Distance units</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['mi', 'km'] as UnitSystem[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          disabled={!isHost}
                          onClick={() => patchSettings({ units: u })}
                          className={`min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${
                            s.units === u
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                              : 'bg-[#08090E] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          {u === 'mi' ? 'Miles & Feet (US)' : 'Kilometers'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spectator Access (Classic Mode) */}
                  {s.mode === 'classic' && (
                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-1.5">
                        Spectator map feed
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'live', label: 'Live' },
                            { id: 'delayed_1m', label: '1m Delay' },
                            { id: 'disabled', label: 'Off' },
                          ] as { id: SpectatorAccess; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!isHost}
                            onClick={() => patchSettings({ spectatorAccess: opt.id })}
                            className={`min-h-[38px] rounded-xl text-xs font-bold border ${
                              s.spectatorAccess === opt.id
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                : 'bg-[#08090E] border-white/[0.08] text-slate-400'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save Custom Preset */}
                  {isHost && (
                    <div className="space-y-2">
                      <form onSubmit={handleSavePresetSubmit} className="flex gap-2">
                        <input
                          type="text"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="Save setup as preset..."
                          className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#08090E] border border-white/10 text-xs text-white placeholder:text-slate-500"
                        />
                        <button
                          type="submit"
                          disabled={!presetName.trim()}
                          className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500 disabled:opacity-40 text-[#08090E] text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                      </form>
                      {customPresets.map((cp) => (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#08090E] border border-white/[0.08]"
                        >
                          <button
                            type="button"
                            onClick={() => onUpdateSettings(cp.settings)}
                            className="flex-1 text-left text-xs font-semibold text-emerald-300 truncate"
                          >
                            {cp.name} · {cp.settings.mode} · {cp.settings.roundLengthMin}m
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCustomPreset(cp.id)}
                            aria-label={`Delete preset ${cp.name}`}
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 4. YOU PLAY AS SECTION */}
          <section className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 sm:p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              You play as
            </h2>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#08090E] border border-white/[0.07]">
              {(['hunter', 'runner', 'random'] as TeamPreference[]).map((pref) => {
                const active = viewer?.preference === pref;
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => onUpdatePreference(pref)}
                    className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-bold capitalize transition-colors ${
                      active
                        ? pref === 'hunter'
                          ? 'bg-red-500 text-white'
                          : pref === 'runner'
                          ? 'bg-emerald-500 text-[#08090E]'
                          : 'bg-emerald-400 text-[#08090E]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              With {room.players.length} {room.players.length === 1 ? 'player' : 'players'}:{' '}
              {minHunters === maxHunters
                ? `${minHunters} hunter`
                : `${minHunters} to ${maxHunters} hunters`}
              . Random fills whichever team needs it and unlocks tap-to-reveal.
            </p>
          </section>

          {/* 5. PLAYERS LIST */}
          <section
            data-testid="lobby-players-list"
            className="rounded-[24px] bg-[#10131E] border border-white/[0.09] p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Players ({room.players.length})
              </h2>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {hunterPrefCount} hunters · {runnerPrefCount} runners · {randomPrefCount} random
              </span>
            </div>

            {room.isSoloDemo && (
              <p className="text-[11px] text-emerald-300/80">
                Tap any AI bot below to switch their team pick before starting.
              </p>
            )}

            <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#090B12] border border-white/[0.07] overflow-hidden">
              {room.players.map((p) => {
                const isSelf = p.id === viewerId;
                const canTapBot = room.isSoloDemo && p.isBot && !!onCycleBotPreference;

                const rowContent = (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-[#08090E] shrink-0"
                        style={{ backgroundColor: p.color }}
                      >
                        {getCallsignInitial(p.name)}
                      </span>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-bold text-white truncate">
                          {p.name.replace(' (AI)', '')}
                          {isSelf ? ' (You)' : p.isBot ? ' · Bot' : ''}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {p.isHost ? 'Host · Ready' : p.connected ? 'Ready' : 'Reconnecting'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-bold capitalize px-2.5 py-1 rounded-lg ${
                          p.preference === 'hunter'
                            ? 'bg-red-500/15 text-red-300'
                            : p.preference === 'runner'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-white/[0.07] text-slate-200'
                        }`}
                      >
                        {p.preference}
                      </span>
                      {!room.isSoloDemo && isHost && !isSelf && (
                        <button
                          type="button"
                          onClick={() => onRemovePlayer(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/15"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </>
                );

                if (canTapBot) {
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onCycleBotPreference?.(p.id)}
                      className="w-full px-3.5 py-3 flex items-center justify-between gap-2 hover:bg-white/[0.03] transition-colors"
                    >
                      {rowContent}
                    </button>
                  );
                }

                return (
                  <div
                    key={p.id}
                    className="px-3.5 py-3 flex items-center justify-between gap-2"
                  >
                    {rowContent}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 6. GET HELP QUICK ROW */}
          <button
            type="button"
            data-testid="lobby-get-help-btn"
            onClick={onOpenGetHelp}
            className="w-full min-h-[54px] px-5 rounded-2xl bg-[#10131E] hover:bg-[#161A28] border border-red-500/25 flex items-center justify-between text-sm font-bold text-red-200 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <span>Get help</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Desktop Right Column: Live MapLibre GL JS Zone Preview */}
        <aside className="hidden lg:flex lg:col-span-6 flex-col rounded-[28px] bg-[#10131E] border border-white/[0.09] overflow-hidden h-[calc(100dvh-160px)] sticky top-20">
          <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">Live Play Zone Preview</div>
              <div className="text-xs text-slate-400">{zoneSummary}</div>
            </div>
            {isHost && s.zone.shape !== 'off' && (
              <button
                type="button"
                onClick={() => setShowZoneEditor(true)}
                className="min-h-[38px] px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-xs font-bold text-emerald-300"
              >
                Edit Zone
              </button>
            )}
          </div>
          <div className="flex-1 relative">
            <TacticalMap
              center={s.zone.center || userPos}
              mapTheme={personalMapTheme}
              activeZone={s.zone}
              visibleMarkers={lobbyPlayerMarkers}
              viewerId={viewerId}
              centerLabel={viewer?.name || 'Host'}
              editableZone={isHost}
              onZoneChange={(nextZone: ActiveZone) => patchSettings({ zone: nextZone })}
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </aside>
      </main>

      {/* Sticky Bottom Start Game CTA */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0A0C13]/94 backdrop-blur-xl border-t border-white/[0.08] px-4 py-3 pb-safe">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block text-xs text-slate-400">
            {activeModeMeta.name} · {formatRoundLength(s.roundLengthMin)} ·{' '}
            {s.headStartMin > 0 ? `${s.headStartMin}m head start` : 'No head start'} ·{' '}
            {s.pingIntervalMin > 0 ? `${s.pingIntervalMin}m pings` : 'Pings off'}
          </div>
          {isHost ? (
            <motion.button
              whileTap={{ scale: 0.985 }}
              type="button"
              data-testid="lobby-start-game-btn"
              onClick={onStartRound}
              className="w-full sm:w-auto sm:min-w-[240px] min-h-[52px] px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-extrabold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-colors"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start game</span>
            </motion.button>
          ) : (
            <div className="w-full sm:w-auto text-center text-sm font-semibold text-slate-300 py-2">
              Waiting for host to start the round...
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sheets & Full-Screen Play Zone Editor */}
      <AnimatePresence>
        {showModeSheet && (
          <ModePickerSheet
            selectedMode={s.mode}
            canEdit={isHost}
            onSelectMode={(mode) => patchSettings({ mode })}
            onOpenHowToPlay={onOpenHowToPlay}
            onClose={() => setShowModeSheet(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMapSheet && (
          <MapPickerSheet
            selectedTheme={personalMapTheme}
            onSelectTheme={onChangePersonalMapTheme}
            onClose={() => setShowMapSheet(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showZoneEditor && (
          <PlayZoneEditorSheet
            initialZone={s.zone}
            initialShrinkEnabled={s.zoneShrinkEnabled}
            initialFinalDiameterMeters={s.finalZoneDiameterMeters}
            roundLengthMin={s.roundLengthMin}
            units={s.units}
            mapTheme={personalMapTheme}
            userPos={userPos}
            onChangeMapTheme={onChangePersonalMapTheme}
            onSave={(nextZone, nextShrink, nextFinal) =>
              patchSettings({
                zone: nextZone,
                zoneShrinkEnabled: nextShrink,
                finalZoneDiameterMeters: nextFinal,
              })
            }
            onClose={() => setShowZoneEditor(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
