import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Compass,
  Play,
  Plus,
  Radio,
  ScrollText,
  ShieldAlert,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import type { CareerProfile, GameMode } from '../types/game';
import { BrandIcon, PWAInstallButton } from './BrandIcon';

interface HomeViewProps {
  profile: CareerProfile;
  initialRoomCode?: string;
  onUpdateName: (name: string) => void;
  onHostGame: (mode: GameMode) => void;
  onJoinGame: (code: string) => Promise<string | null>;
  onStartSoloDemo: (role: 'hunter' | 'runner', mode: GameMode) => void;
  onOpenProfile: () => void;
  onOpenChangelog: () => void;
  onOpenHowToPlay: () => void;
  onOpenGetHelp: () => void;
}

const MODE_CARDS: { id: GameMode; name: string; summary: string; detail: string }[] = [
  {
    id: 'classic',
    name: 'Classic',
    summary: 'Elimination · Spectator Modes',
    detail: 'Tagged Runners become Spectators. Survive to 00:00 or clear the board.',
  },
  {
    id: 'infection',
    name: 'Infection',
    summary: 'Growing Hunter Pack',
    detail: 'Tagged Runners immediately switch teams to Hunter and join the pursuit.',
  },
  {
    id: 'curfew',
    name: 'Curfew',
    summary: 'Teleporting Sub-Zones',
    detail: 'Zone periodically jumps to a smaller interior boundary, forcing relocation.',
  },
  {
    id: 'imposter',
    name: 'Imposter',
    summary: 'Hidden Roles · Live Votes',
    detail: 'Secret Imposters hide among Runners. Call Emergency Meetings to vote them out.',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  initialRoomCode = '',
  onUpdateName,
  onHostGame,
  onJoinGame,
  onStartSoloDemo,
  onOpenProfile,
  onOpenChangelog,
  onOpenHowToPlay,
  onOpenGetHelp,
}) => {
  const [callsign, setCallsign] = useState(profile.name || '');
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [selectedMode, setSelectedMode] = useState<GameMode>('classic');
  const [demoRole, setDemoRole] = useState<'hunter' | 'runner'>('hunter');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (initialRoomCode) {
      setJoinCode(initialRoomCode.toUpperCase());
    }
  }, [initialRoomCode]);

  const commitName = (val: string) => {
    setCallsign(val);
    onUpdateName(val);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setJoinError('Enter a valid 6-character room code (e.g., FK84XP).');
      return;
    }
    setJoinError(null);
    setJoining(true);
    const err = await onJoinGame(cleaned);
    setJoining(false);
    if (err) setJoinError(err);
  };

  return (
    <div className="min-h-dvh bg-[#09090E] text-[#F4F5F9] flex flex-col">
      {/* Compact Tactical Header */}
      <header className="w-full border-b border-[#1D2030] bg-[#0B0C13]/95 pt-safe">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2.5 gap-x-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <BrandIcon className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold tracking-wide leading-none text-white whitespace-nowrap">
                FINDERS KEEPERS
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                Real-World GPS Manhunt · All Modes Free
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label="Open Career Profile and Badges"
              className="min-h-[44px] px-2.5 sm:px-3.5 rounded-xl bg-[#161925] hover:bg-[#1E2233] border border-[#282D42] flex items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span>Career</span>
              <span className="font-mono text-emerald-400 tabular-nums">
                {profile.totalPoints}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenChangelog}
              aria-label="Open Changelog"
              className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 rounded-xl bg-[#161925] hover:bg-[#1E2233] border border-[#282D42] flex items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              <ScrollText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0" />
              <span>Changelog</span>
            </button>
            <button
              type="button"
              onClick={onOpenGetHelp}
              aria-label="Open Get Help Emergency Screen"
              className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 flex items-center justify-center text-red-300 transition-colors shrink-0"
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-safe">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Command Panel */}
          <section className="lg:col-span-7 space-y-6">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.02] [text-wrap:balance]">
                Outrun the Radar. Own the Map.
              </h2>
              <p className="mt-2.5 text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                A real-world hide-and-seek manhunt game built for friend groups of any size.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onOpenHowToPlay}
                  className="min-h-[44px] px-4 rounded-xl bg-[#161925] hover:bg-[#1E2233] border border-[#2C334B] text-xs sm:text-sm font-bold text-cyan-300 inline-flex items-center gap-2 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>How to Play</span>
                </button>
              </div>
            </div>

            {/* Callsign Input */}
            <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-5 space-y-4">
              <label htmlFor="fk-callsign" className="block text-xs font-semibold text-slate-300">
                Your Callsign
              </label>
              <input
                id="fk-callsign"
                type="text"
                maxLength={20}
                value={callsign}
                onChange={(e) => commitName(e.target.value)}
                placeholder="Enter callsign (e.g. GhostRunner)"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#0A0B11] border border-[#2A2F44] text-base font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
              />

              {/* Primary CTA: Host Game */}
              <div className="pt-1 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => onHostGame(selectedMode)}
                  className="flex-1 min-h-[52px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-[#09090E] font-bold text-base flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                >
                  <Plus className="w-5 h-5" />
                  <span>Host New Game</span>
                </button>
              </div>
            </div>

            {/* Join Room by 6-char Code */}
            <form
              onSubmit={handleJoinSubmit}
              className="rounded-2xl bg-[#11131D] border border-[#232738] p-5"
            >
              <label htmlFor="fk-room-code" className="block text-xs font-semibold text-slate-300">
                Join with 6-Character Room Code
              </label>
              <div className="mt-2.5 flex gap-2.5">
                <input
                  id="fk-room-code"
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                    setJoinError(null);
                  }}
                  placeholder="FK84XP"
                  className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl bg-[#0A0B11] border border-[#2A2F44] font-mono text-lg font-bold tracking-[0.2em] text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 uppercase"
                />
                <button
                  type="submit"
                  disabled={joining}
                  className="min-h-[48px] px-6 rounded-xl bg-[#1D2234] hover:bg-[#262C42] border border-[#323954] text-white font-bold text-sm transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {joining ? 'Joining...' : 'Join Room'}
                </button>
              </div>
              {joinError && (
                <p role="alert" className="mt-2 text-xs font-medium text-red-400">
                  {joinError}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Or open an invite link (?code=XXXXXX) or scan the lobby QR code.
              </p>
            </form>

            {/* Solo Practice Mode Card */}
            <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Compass className="w-5 h-5 text-cyan-400" />
                    <span>Solo Practice Mode</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Spawn AI Runner &amp; Hunter bots around your GPS location to test radar pings,
                    zone shrinks, and tagging solo.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0A0B11] border border-[#252A3C] shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setDemoRole('hunter')}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      demoRole === 'hunter'
                        ? 'bg-red-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Hunter
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoRole('runner')}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      demoRole === 'runner'
                        ? 'bg-emerald-500 text-[#09090E]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Runner
                  </button>
                </div>
              </div>

              <button
                type="button"
                data-start="true"
                onClick={() => onStartSoloDemo(demoRole, selectedMode)}
                className="mt-4 w-full min-h-[48px] px-5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Try a Demo Round ({selectedMode.toUpperCase()})</span>
              </button>
            </div>
          </section>

          {/* Right Panel: 4 Unlocked Modes & Field Capabilities */}
          <aside className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Select Game Mode</h3>
                <span className="text-xs text-emerald-400 font-medium">All 4 Unlocked</span>
              </div>

              <div className="space-y-2.5">
                {MODE_CARDS.map((m) => {
                  const active = selectedMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMode(m.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                        active
                          ? 'bg-[#18212C] border-emerald-500/70'
                          : 'bg-[#0C0D14] border-[#212536] hover:bg-[#141724]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-white">{m.name}</span>
                        <span className="text-xs text-slate-400">{m.summary}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed">{m.detail}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Field Readiness Summary */}
            <div className="rounded-2xl bg-[#11131D] border border-[#232738] p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Field-Engineered Hardware</h3>
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Radio className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Team-Only Walkie-Talkie:</strong> Hold-to-talk
                    10s low-bitrate voice packets isolated per team.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Target className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Dead-Zone Resilience:</strong> Smart 4s/12s GPS
                    throttling, offline retry buffer, and cached map tiles.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Pocket Mode &amp; Stealth Haptics:</strong> OLED
                    black screen lock, Wake Lock, torch, and silent edge flashes.
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};
