import React, { useState } from 'react';
import {
  Check,
  Copy,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  QrCode,
  Save,
  Trash2,
  UserMinus,
} from 'lucide-react';
import type {
  ActiveZone,
  CustomPreset,
  GameMode,
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
} from '../game/rules';
import {
  createDefaultPolygonAround,
  formatZoneSize,
  roundCoord,
} from '../game/geo';
import { TacticalMap } from './TacticalMap';

interface LobbyViewProps {
  room: RoomState;
  viewerId: string;
  userPos: LatLng;
  customPresets: CustomPreset[];
  onUpdateSettings: (settings: RoomSettings) => void;
  onUpdatePreference: (pref: TeamPreference) => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onStartRound: () => void;
  onShowQr: () => void;
  onOpenMoreMenu: () => void;
}

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'classic', label: 'Classic', desc: 'Tagged Runners become Spectators' },
  { id: 'infection', label: 'Infection', desc: 'Tagged Runners join Hunters' },
  { id: 'curfew', label: 'Curfew', desc: 'Zone teleports inside boundary' },
  { id: 'imposter', label: 'Imposter', desc: 'Secret Imposters + live votes' },
];

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  viewerId,
  userPos,
  customPresets,
  onUpdateSettings,
  onUpdatePreference,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onRemovePlayer,
  onStartRound,
  onShowQr,
  onOpenMoreMenu,
}) => {
  const [copied, setCopied] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [mobileSection, setMobileSection] = useState<'setup' | 'zone'>('setup');

  const viewer = room.players.find((p) => p.id === viewerId);
  const isHost = room.hostId === viewerId;
  const s = room.settings;

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

  const patchSettings = (patch: Partial<RoomSettings>) => {
    if (!isHost) return;
    onUpdateSettings({ ...s, ...patch });
  };

  const handleZoneShapeChange = (shape: ActiveZone['shape']) => {
    if (!isHost) return;
    const nextPolygon =
      s.zone.polygon.length >= 3 ? s.zone.polygon : createDefaultPolygonAround(s.zone.center, 450);
    patchSettings({
      zone: {
        ...s.zone,
        shape,
        polygon: nextPolygon,
      },
    });
  };

  const handleAddPolygonVertex = () => {
    if (!isHost || s.zone.polygon.length < 2) return;
    const poly = s.zone.polygon;
    const last = poly[poly.length - 1];
    const first = poly[0];
    const mid: LatLng = {
      lat: roundCoord((last.lat + first.lat) / 2 + 0.0004),
      lng: roundCoord((last.lng + first.lng) / 2 + 0.0004),
    };
    patchSettings({ zone: { ...s.zone, polygon: [...poly, mid] } });
  };

  const handleRemovePolygonVertex = () => {
    if (!isHost || s.zone.polygon.length <= 3) return;
    patchSettings({ zone: { ...s.zone, polygon: s.zone.polygon.slice(0, -1) } });
  };

  const handleSavePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed);
    setPresetName('');
    setShowPresetForm(false);
  };

  return (
    <div className="min-h-dvh bg-[#09090E] text-[#F4F5F9] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#1F2333] bg-[#0C0D15]/95 backdrop-blur-md pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400">Room Code</div>
            <div className="font-mono text-2xl font-bold tracking-[0.18em] text-emerald-400 leading-none tabular-nums">
              {room.code}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyInvite}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#171A27] hover:bg-[#1F2436] border border-[#2A3046] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-cyan-400" />
              )}
              <span>{copied ? 'Copied' : 'Copy Invite Link'}</span>
            </button>
            <button
              type="button"
              onClick={onShowQr}
              aria-label="Show QR Code"
              className="min-h-[44px] px-3 rounded-xl bg-[#171A27] hover:bg-[#1F2436] border border-[#2A3046] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Show QR Code</span>
            </button>
            <button
              type="button"
              onClick={onOpenMoreMenu}
              aria-label="More options and Get Help"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#171A27] hover:bg-[#1F2436] border border-[#2A3046] flex items-center justify-center text-white"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Section Switcher */}
      <div className="lg:hidden px-4 pt-3">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#11131D] border border-[#232738]">
          <button
            type="button"
            onClick={() => setMobileSection('setup')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              mobileSection === 'setup' ? 'bg-emerald-500 text-[#09090E]' : 'text-slate-300'
            }`}
          >
            Squad &amp; Rules
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('zone')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              mobileSection === 'zone' ? 'bg-emerald-500 text-[#09090E]' : 'text-slate-300'
            }`}
          >
            Play Zone Map
          </button>
        </div>
      </div>

      {/* Main Responsive Split */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Roster, Team Pref, Mode, Presets, Sliders */}
        <section
          className={`lg:col-span-5 space-y-5 ${
            mobileSection === 'zone' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Team Preference */}
          <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-4">
            <h2 className="text-sm font-bold text-white mb-2.5">Team</h2>
            <div className="grid grid-cols-3 gap-2">
              {(['hunter', 'runner', 'random'] as TeamPreference[]).map((pref) => {
                const active = viewer?.preference === pref;
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => onUpdatePreference(pref)}
                    className={`min-h-[44px] rounded-xl text-xs font-bold border transition-colors capitalize ${
                      active
                        ? pref === 'hunter'
                          ? 'bg-red-500/20 border-red-400 text-red-200'
                          : pref === 'runner'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-[#0B0C13] border-[#252A3D] text-slate-400 hover:text-white'
                    }`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Squad Roster */}
          <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-4">
            <h2 className="text-sm font-bold text-white mb-3">
              Players ({room.players.length})
            </h2>
            <div className="space-y-2">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#0B0C13] border border-[#1E2232]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      {p.name}
                      {p.id === viewerId ? ' (You)' : ''}
                    </span>
                    {p.isHost && (
                      <span className="text-[11px] font-semibold text-cyan-400 shrink-0">Host</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 capitalize">{p.preference}</span>
                    {isHost && p.id !== viewerId && (
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
                </div>
              ))}
            </div>
          </div>

          {/* Game Mode Selection */}
          <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-4">
            <h2 className="text-sm font-bold text-white mb-3">Game Mode</h2>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!isHost}
                  onClick={() => patchSettings({ mode: m.id })}
                  className={`p-3 rounded-xl border text-left transition-colors disabled:opacity-75 ${
                    s.mode === m.id
                      ? 'bg-[#17212C] border-emerald-500 text-white'
                      : 'bg-[#0B0C13] border-[#222739] text-slate-300 hover:bg-[#141724]'
                  }`}
                >
                  <div className="text-sm font-bold">{m.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Presets (Built-in + Unlimited Saved Custom Presets) */}
          <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">Rule Presets</h2>
              {isHost && (
                <button
                  type="button"
                  onClick={() => setShowPresetForm((v) => !v)}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Custom</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {BUILT_IN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isHost}
                  onClick={() => onUpdateSettings(applyBuiltInPreset(s, preset.id))}
                  className="min-h-[54px] px-2.5 py-2 rounded-xl bg-[#0B0C13] hover:bg-[#171B2A] border border-[#252A3D] text-left transition-colors disabled:opacity-60"
                >
                  <div className="text-xs font-bold text-white">{preset.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    {preset.summary}
                  </div>
                </button>
              ))}
            </div>

            {showPresetForm && isHost && (
              <form onSubmit={handleSavePresetSubmit} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name"
                  className="flex-1 min-h-[42px] px-3 rounded-lg bg-[#0A0B11] border border-[#2C3146] text-xs text-white placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-3.5 rounded-lg bg-emerald-500 text-[#09090E] text-xs font-bold"
                >
                  Save
                </button>
              </form>
            )}

            {customPresets.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {customPresets.map((cp) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0B0C13] border border-[#222739]"
                  >
                    <button
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateSettings(cp.settings)}
                      className="flex-1 text-left text-xs font-semibold text-cyan-300 hover:text-cyan-200 truncate"
                    >
                      {cp.name} · {cp.settings.mode} · {cp.settings.roundLengthMin}m
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomPreset(cp.id)}
                      aria-label={`Delete preset ${cp.name}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sliders & Toggles */}
          <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-4 space-y-4">
            <h2 className="text-sm font-bold text-white">Round Rules &amp; Sliders</h2>

            {/* Round Length */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="slider-round-len" className="text-slate-300 font-medium">
                  Round Length
                </label>
                <span className="font-mono font-bold text-white tabular-nums">
                  {s.roundLengthMin >= 60
                    ? `${Math.floor(s.roundLengthMin / 60)}h ${s.roundLengthMin % 60}m`
                    : `${s.roundLengthMin} min`}
                </span>
              </div>
              <input
                id="slider-round-len"
                type="range"
                min={5}
                max={180}
                step={5}
                disabled={!isHost}
                value={s.roundLengthMin}
                onChange={(e) => patchSettings({ roundLengthMin: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Ping Interval */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="slider-ping-int" className="text-slate-300 font-medium">
                  Runner Radar Ping Interval
                </label>
                <span className="font-mono font-bold text-cyan-400 tabular-nums">
                  {s.pingIntervalMin === 0 ? 'Off' : `Every ${s.pingIntervalMin} min`}
                </span>
              </div>
              <input
                id="slider-ping-int"
                type="range"
                min={0}
                max={30}
                step={1}
                disabled={!isHost}
                value={s.pingIntervalMin}
                onChange={(e) => patchSettings({ pingIntervalMin: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Head Start */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="slider-head-start" className="text-slate-300 font-medium">
                  Head Start (Scatter)
                </label>
                <span className="font-mono font-bold text-amber-400 tabular-nums">
                  {s.headStartMin === 0 ? 'None' : `${s.headStartMin} min`}
                </span>
              </div>
              <input
                id="slider-head-start"
                type="range"
                min={0}
                max={30}
                step={1}
                disabled={!isHost}
                value={s.headStartMin}
                onChange={(e) => patchSettings({ headStartMin: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
            </div>

            {/* Zone Shrink Toggle + Final Size */}
            <div className="pt-2 border-t border-[#202436] space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-white">
                  {s.mode === 'curfew' ? 'Curfew Zone Teleports' : 'Shrinking Zone'}
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => patchSettings({ zoneShrinkEnabled: !s.zoneShrinkEnabled })}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
                    s.zoneShrinkEnabled
                      ? 'bg-emerald-500 text-[#09090E]'
                      : 'bg-[#0A0B11] text-slate-400 border border-[#292E42]'
                  }`}
                >
                  {s.zoneShrinkEnabled ? 'On' : 'Off'}
                </button>
              </div>

              {s.zoneShrinkEnabled && s.zone.shape !== 'off' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="slider-final-zone" className="text-slate-300 font-medium">
                      Final Shrink Size
                    </label>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {formatZoneSize(s.finalZoneDiameterMeters, s.units)}
                    </span>
                  </div>
                  <input
                    id="slider-final-zone"
                    type="range"
                    min={150}
                    max={Math.max(300, Math.min(3000, s.zone.diameterMeters - 50))}
                    step={50}
                    disabled={!isHost}
                    value={Math.min(s.finalZoneDiameterMeters, s.zone.diameterMeters)}
                    onChange={(e) =>
                      patchSettings({ finalZoneDiameterMeters: Number(e.target.value) })
                    }
                    className="w-full accent-amber-400"
                  />
                </div>
              )}
            </div>

            {/* Spectator Access (Classic) */}
            {s.mode === 'classic' && (
              <div className="pt-2 border-t border-[#202436]">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Eliminated Spectator Map Access
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'live', label: 'Live All' },
                      { id: 'delayed_1m', label: '1-Min Delay' },
                      { id: 'disabled', label: 'Disabled' },
                    ] as { id: SpectatorAccess; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => patchSettings({ spectatorAccess: opt.id })}
                      className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        s.spectatorAccess === opt.id
                          ? 'bg-emerald-500 text-[#09090E]'
                          : 'bg-[#0B0C13] text-slate-300 border border-[#24293C]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Units & Map Theme */}
            <div className="pt-2 border-t border-[#202436] grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1.5">Units</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['km', 'mi'] as UnitSystem[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={!isHost}
                      onClick={() => patchSettings({ units: u })}
                      className={`min-h-[40px] rounded-lg text-xs font-bold uppercase ${
                        s.units === u
                          ? 'bg-white text-[#09090E]'
                          : 'bg-[#0B0C13] text-slate-400 border border-[#24293C]'
                      }`}
                    >
                      {u === 'km' ? 'Kilometers' : 'Miles'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1.5">Map Theme</div>
                <select
                  aria-label="Map Theme"
                  disabled={!isHost}
                  value={s.mapTheme}
                  onChange={(e) => patchSettings({ mapTheme: e.target.value as MapTheme })}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0B0C13] border border-[#24293C] text-xs font-semibold text-white"
                >
                  <option value="standard">Standard (OSM)</option>
                  <option value="night">Night Tactical</option>
                  <option value="satellite">Satellite (Esri)</option>
                  <option value="snow">Snow High-Contrast</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Interactive Play Zone & Custom Polygon Arena Editor */}
        <section
          className={`lg:col-span-7 flex flex-col rounded-2xl bg-[#11131D] border border-[#232738] overflow-hidden min-h-[520px] lg:h-[calc(100dvh-160px)] lg:sticky lg:top-20 ${
            mobileSection === 'setup' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-[#212536] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">Play Zone</h2>
                <p className="text-xs text-slate-400">
                  {s.zone.shape === 'off'
                    ? 'Play anywhere'
                    : s.zone.shape === 'circle'
                    ? 'Tap map or drag pin'
                    : 'Tap map to add corners · Drag to edit'}
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0A0B11] border border-[#24293C]">
                {(
                  [
                    { id: 'off', label: 'Off' },
                    { id: 'circle', label: 'Circle' },
                    { id: 'polygon', label: 'Draw Polygon' },
                  ] as { id: ActiveZone['shape']; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => handleZoneShapeChange(mode.id)}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      s.zone.shape === mode.id
                        ? 'bg-emerald-500 text-[#09090E]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {s.zone.shape === 'circle' && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="slider-zone-diam" className="text-slate-300 font-medium">
                    Zone Diameter (200 m – 6 km)
                  </label>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {formatZoneSize(s.zone.diameterMeters, s.units)}
                  </span>
                </div>
                <input
                  id="slider-zone-diam"
                  type="range"
                  min={200}
                  max={6000}
                  step={100}
                  disabled={!isHost}
                  value={s.zone.diameterMeters}
                  onChange={(e) =>
                    patchSettings({
                      zone: { ...s.zone, diameterMeters: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>
            )}

            {s.zone.shape === 'polygon' && isHost && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-cyan-300 tabular-nums">
                  {s.zone.polygon.length} corners placed
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddPolygonVertex}
                    aria-label="Add polygon corner"
                    className="min-h-[40px] px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Corner</span>
                  </button>
                  <button
                    type="button"
                    disabled={s.zone.polygon.length <= 3}
                    onClick={handleRemovePolygonVertex}
                    aria-label="Remove last polygon corner"
                    className="min-h-[40px] px-3 rounded-lg bg-[#191C2B] hover:bg-[#23273B] border border-[#2C3148] text-xs font-bold text-slate-200 inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 relative min-h-[360px]">
            <TacticalMap
              center={s.zone.center || userPos}
              mapTheme={s.mapTheme}
              activeZone={s.zone}
              editableZone={isHost}
              onZoneChange={(nextZone) => patchSettings({ zone: nextZone })}
            />
          </div>
        </section>
      </main>

      {/* Sticky Bottom Start Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0B0C14]/95 border-t border-[#222638] px-4 py-3 pb-safe">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block text-xs text-slate-400">
            {s.mode.toUpperCase()} · {s.roundLengthMin}m round ·{' '}
            {s.headStartMin > 0 ? `${s.headStartMin}m head start` : 'No head start'} ·{' '}
            {s.pingIntervalMin > 0 ? `${s.pingIntervalMin}m pings` : 'Pings off'}
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={onStartRound}
              className="w-full sm:w-auto sm:min-w-[240px] min-h-[50px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-[#09090E] font-extrabold text-base inline-flex items-center justify-center gap-2 transition-all"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Let&apos;s Go</span>
            </button>
          ) : (
            <div className="w-full sm:w-auto text-center text-sm font-semibold text-slate-300 py-2">
              Waiting for host to tap Let&apos;s Go...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
