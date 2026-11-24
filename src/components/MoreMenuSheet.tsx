import React, { useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Flag,
  LogOut,
  Map,
  ShieldAlert,
  UserMinus,
  Users,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react';
import type { MapTheme, PlayerState } from '../types/game';

interface MoreMenuSheetProps {
  title?: string;
  isHost: boolean;
  players: PlayerState[];
  viewerId: string;
  mapTheme: MapTheme;
  stealthHaptic: boolean;
  canEndRound?: boolean;
  onOpenGetHelp: () => void;
  onOpenHowToPlay?: () => void;
  onChangeMapTheme: (theme: MapTheme) => void;
  onToggleStealthHaptic: () => void;
  onRemovePlayer?: (playerId: string) => void;
  onEndRound?: () => void;
  onLeaveGame: () => void;
  onClose: () => void;
}

const THEMES: { id: MapTheme; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'night', label: 'Night' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'snow', label: 'Snow' },
];

export const MoreMenuSheet: React.FC<MoreMenuSheetProps> = ({
  title = 'Field Menu',
  isHost,
  players,
  viewerId,
  mapTheme,
  stealthHaptic,
  canEndRound = false,
  onOpenGetHelp,
  onOpenHowToPlay,
  onChangeMapTheme,
  onToggleStealthHaptic,
  onRemovePlayer,
  onEndRound,
  onLeaveGame,
  onClose,
}) => {
  const [view, setView] = useState<'main' | 'players'>('main');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="More Options Menu"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#11131D] border-t sm:border border-[#272C40] p-5 pb-safe shadow-2xl max-h-[85dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {view === 'players' && (
              <button
                type="button"
                onClick={() => setView('main')}
                className="min-h-[44px] px-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Back
              </button>
            )}
            <h3 className="text-base font-bold text-white">
              {view === 'players' ? `Players (${players.length})` : title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {view === 'main' ? (
          <div className="space-y-3">
            {/* TOP OF MENU: Get Help Emergency Screen */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGetHelp();
              }}
              className="w-full min-h-[54px] px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-red-100">Get Help</div>
                  <div className="text-xs text-red-200/75">
                    Emergency dial, street address & pause game
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-red-300" />
            </button>

            {/* Players Moderation */}
            <button
              type="button"
              onClick={() => setView('players')}
              className="w-full min-h-[52px] px-4 rounded-xl bg-[#181B28] hover:bg-[#1F2334] border border-[#282D42] flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-white">Players</div>
                  <div className="text-xs text-slate-400">
                    {players.length} in room{isHost ? ' · Host moderation' : ''}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* How to Play Guide */}
            {onOpenHowToPlay && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHowToPlay();
                }}
                className="w-full min-h-[52px] px-4 rounded-xl bg-[#181B28] hover:bg-[#1F2334] border border-[#282D42] flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-white">How to Play</div>
                    <div className="text-xs text-slate-400">
                      Round rules, all 4 modes &amp; field controls
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            )}

            {/* Stealth Haptic Mode */}
            <button
              type="button"
              onClick={onToggleStealthHaptic}
              className="w-full min-h-[52px] px-4 rounded-xl bg-[#181B28] hover:bg-[#1F2334] border border-[#282D42] flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                {stealthHaptic ? (
                  <Vibrate className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <Volume2 className="w-5 h-5 text-slate-300 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-semibold text-white">Stealth Haptic Mode</div>
                  <div className="text-xs text-slate-400">
                    {stealthHaptic
                      ? 'Silent vibration & screen-edge flashes'
                      : 'Tactical audio chimes active'}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-bold ${
                  stealthHaptic ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {stealthHaptic ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Map Theme Selector */}
            <div className="rounded-xl bg-[#181B28] border border-[#282D42] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2.5">
                <Map className="w-4 h-4 text-emerald-400" />
                <span>Map Theme</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChangeMapTheme(t.id)}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      mapTheme === t.id
                        ? 'bg-emerald-500 text-[#09090E]'
                        : 'bg-[#10121B] text-slate-300 hover:bg-[#23273A]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {canEndRound && isHost && onEndRound && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEndRound();
                }}
                className="w-full min-h-[48px] px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 flex items-center justify-center gap-2 text-sm font-bold text-amber-200 transition-colors"
              >
                <Flag className="w-4 h-4" />
                <span>End Round & View Recap</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onLeaveGame();
              }}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#1B1D29] hover:bg-[#242736] border border-[#2C3144] flex items-center justify-center gap-2 text-sm font-semibold text-slate-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave Room</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#181B28] border border-[#262B3E]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                    {p.isHost && (
                      <span className="text-[11px] font-semibold text-cyan-400">Host</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {p.role.charAt(0).toUpperCase() + p.role.slice(1)}
                    {p.eliminated ? ' · Eliminated' : ''}
                    {p.tagsCount > 0 ? ` · ${p.tagsCount} tags` : ''}
                  </div>
                </div>

                {isHost && p.id !== viewerId && onRemovePlayer && (
                  <button
                    type="button"
                    onClick={() => onRemovePlayer(p.id)}
                    aria-label={`Remove ${p.name} from game`}
                    className="min-h-[40px] px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-xs font-semibold text-red-300 inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
