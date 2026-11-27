import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  BookOpen,
  ChevronRight,
  Compass,
  Info,
  KeyRound,
  Lock,
  Play,
  Plus,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trophy,
  User,
  X,
} from 'lucide-react';
import type { CareerProfile, GameMode, PlayerLooks } from '../types/game';
import { formatDistance } from '../game/geo';
import { BADGE_DEFINITIONS, formatRoomCodeInput, getCallsignInitial } from '../game/rules';
import { DEFAULT_PLAYER_LOOKS } from '../services/storage';
import { BrandIcon, PWAInstallButton } from './BrandIcon';
import { LooksSheet } from './LooksSheet';

interface HomeViewProps {
  profile: CareerProfile;
  initialRoomCode?: string;
  onUpdateProfile: (patch: Partial<CareerProfile>) => void;
  onHostGame: (mode: GameMode) => void;
  onJoinGame: (code: string) => Promise<string | null>;
  onOpenDemoLobby: () => void;
  onOpenChangelog: () => void;
  onOpenHowToPlay: () => void;
  onOpenGetHelp: () => void;
}

type HomeTab = 'play' | 'ranks' | 'you';

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  initialRoomCode = '',
  onUpdateProfile,
  onHostGame,
  onJoinGame,
  onOpenDemoLobby,
  onOpenChangelog,
  onOpenHowToPlay,
  onOpenGetHelp,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>('play');
  const [showJoinSheet, setShowJoinSheet] = useState<boolean>(!!initialRoomCode);
  const [showLooksSheet, setShowLooksSheet] = useState<boolean>(false);
  const [showScoringInfo, setShowScoringInfo] = useState<boolean>(false);

  const [joinCode, setJoinCode] = useState<string>(initialRoomCode.toUpperCase());
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState<boolean>(false);

  const [nameInput, setNameInput] = useState<string>(profile.name || '');
  const [usernameInput, setUsernameInput] = useState<string>(profile.username || '');

  useEffect(() => {
    if (initialRoomCode) {
      setJoinCode(initialRoomCode.toUpperCase());
      setActiveTab('play');
      setShowJoinSheet(true);
    }
  }, [initialRoomCode]);

  const looks: PlayerLooks = profile.looks ?? DEFAULT_PLAYER_LOOKS;
  const displayName = profile.name.trim() || 'Agent';
  const handleText = profile.username?.trim()
    ? `@${profile.username.trim().replace(/^@/, '')}`
    : `@${displayName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'agent'}`;

  const winRate =
    profile.roundsPlayed > 0 ? Math.round((profile.wins / profile.roundsPlayed) * 100) : 0;

  const daysUntilMonthEnd = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.max(1, end.getDate() - now.getDate());
  }, []);

  const rankedEntries = useMemo(() => {
    const map = new Map<
      string,
      { playerId: string; name: string; totalPoints: number; wins: number; isSelf: boolean }
    >();
    for (const entry of profile.leaderboard) {
      map.set(entry.playerId, {
        playerId: entry.playerId,
        name: entry.name.replace(' (AI)', ''),
        totalPoints: entry.totalPoints,
        wins: entry.wins,
        isSelf: entry.playerId === profile.playerId,
      });
    }
    if (profile.leaderboardOptIn && !map.has(profile.playerId)) {
      map.set(profile.playerId, {
        playerId: profile.playerId,
        name: displayName,
        totalPoints: profile.totalPoints,
        wins: profile.wins,
        isSelf: true,
      });
    }
    return Array.from(map.values()).sort((a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins);
  }, [profile, displayName]);

  const myRankPos = rankedEntries.findIndex((e) => e.isSelf) + 1;

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = formatRoomCodeInput(joinCode);
    if (cleaned.length !== 6) {
      setJoinError('Enter a valid 6-character game code.');
      return;
    }
    setJoinError(null);
    setJoining(true);
    const err = await onJoinGame(cleaned);
    setJoining(false);
    if (err) {
      setJoinError(err);
    } else {
      setShowJoinSheet(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-[#08090E] text-[#F4F5F9] flex flex-col overflow-x-clip">
      {/* Static Ambient Tactical Radar Backdrop (does not follow scroll) */}
      <div
        aria-hidden="true"
        data-testid="home-radar-backdrop"
        className="pointer-events-none absolute inset-0 overflow-hidden z-0"
      >
        <div className="absolute top-36 sm:top-24 right-[-100px] sm:right-[4%] w-[420px] h-[420px] sm:w-[600px] sm:h-[600px] rounded-full border border-emerald-500/[0.18] flex items-center justify-center">
          <div className="w-[72%] h-[72%] rounded-full border border-emerald-500/[0.14] flex items-center justify-center">
            <div className="w-[46%] h-[46%] rounded-full border border-emerald-500/[0.16] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/40" />
            </div>
          </div>
          <div className="fk-radar-sweep absolute inset-0 rounded-full opacity-85" />
        </div>
      </div>

      {/* Top Bar: Finders Keepers Brand + Compact Desktop Nav + Utilities */}
      <header className="relative z-20 w-full border-b border-white/[0.06] bg-[#0A0C13]/85 backdrop-blur-md pt-safe">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <BrandIcon className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-[19px] sm:text-2xl font-extrabold tracking-wide leading-none text-white whitespace-nowrap">
                FINDERS KEEPERS
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                GPS Hide &amp; Seek
              </div>
            </div>
          </div>

          {/* Desktop Center Tab Switcher */}
          <nav
            aria-label="Primary sections"
            className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-[#111420] border border-white/[0.08]"
          >
            {(
              [
                { id: 'play', label: 'Play' },
                { id: 'ranks', label: 'Ranks' },
                { id: 'you', label: 'You' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[36px] px-5 rounded-full text-xs font-bold transition-colors ${
                    active
                      ? 'bg-emerald-500 text-[#08090E]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Compact Right Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onOpenChangelog}
              aria-label="Open Changelog"
              className="min-h-[40px] min-w-[40px] sm:min-h-[42px] sm:min-w-[42px] sm:px-3 rounded-xl bg-[#141724] hover:bg-[#1C2133] border border-white/[0.09] flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-200 transition-colors"
            >
              <ScrollText className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden md:inline">Updates</span>
            </button>
            <button
              type="button"
              onClick={onOpenGetHelp}
              aria-label="Open Get Help Emergency Screen"
              className="min-h-[40px] min-w-[40px] sm:min-h-[42px] sm:min-w-[42px] rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 flex items-center justify-center text-red-300 transition-colors"
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Generous Bottom Padding for Mobile 3-Tab Dock) */}
      <main
        className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 flex flex-col"
        style={{ paddingBottom: 'calc(92px + max(env(safe-area-inset-bottom, 0px), 12px))' }}
      >
        <AnimatePresence mode="wait">
          {/* ======================= PLAY TAB ======================= */}
          {activeTab === 'play' && (
            <motion.div
              key="play"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex flex-col justify-center"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                {/* Primary Play Column */}
                <section className="lg:col-span-7 space-y-7 max-w-xl">
                  <div className="space-y-2.5">
                    <h1 className="font-display text-5xl sm:text-7xl font-extrabold tracking-tight text-white leading-[0.95]">
                      {profile.name.trim() ? `Hi, ${profile.name.trim()}.` : 'Ready to run.'}
                    </h1>
                    <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
                      Host a game or grab a code from a friend.
                    </p>
                  </div>

                  {/* Clean Thumb-Friendly Primary Action Stack */}
                  <div className="space-y-3">
                    <motion.button
                      whileTap={{ scale: 0.985 }}
                      type="button"
                      data-testid="home-host-btn"
                      onClick={() => onHostGame('classic')}
                      className="w-full min-h-[58px] px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-extrabold text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/20 transition-colors"
                    >
                      <Plus className="w-5 h-5 stroke-[2.8]" />
                      <span>Host a game</span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.985 }}
                      type="button"
                      data-testid="home-join-btn"
                      onClick={() => setShowJoinSheet(true)}
                      className="w-full min-h-[56px] px-6 rounded-2xl bg-[#131724] hover:bg-[#1A2032] border border-white/[0.1] text-white font-bold text-base flex items-center justify-center gap-2.5 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-emerald-400" />
                      <span>Join with a code</span>
                    </motion.button>
                  </div>

                  {/* Clean Inline Secondary Links */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-slate-300 pt-1">
                    <button
                      type="button"
                      onClick={onOpenHowToPlay}
                      className="min-h-[40px] inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-300 transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      <span>How it works</span>
                    </button>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <button
                      type="button"
                      data-testid="home-demo-btn"
                      onClick={onOpenDemoLobby}
                      className="min-h-[40px] inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 transition-colors"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Try a demo round</span>
                    </button>
                  </div>
                </section>

                {/* Right Tactical Identity Card (Desktop & Tablet Preview) */}
                <aside className="lg:col-span-5">
                  <div className="rounded-[26px] bg-[#0F121C]/92 border border-white/[0.08] p-5 sm:p-6 space-y-5 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-12 h-12 rounded-full border-2 border-white/90 flex items-center justify-center text-lg font-black text-[#08090E] shrink-0"
                          style={{ backgroundColor: looks.dotColor }}
                        >
                          {getCallsignInitial(displayName)}
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-base font-extrabold truncate"
                            style={{ color: looks.nameColor }}
                          >
                            {displayName}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {looks.title} · {handleText}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('you')}
                        className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-emerald-300 shrink-0"
                      >
                        Edit
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-white/[0.07]">
                      <div className="rounded-xl bg-[#090B12] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Rounds
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold text-white tabular-nums">
                          {profile.roundsPlayed}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#090B12] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Wins
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold text-emerald-400 tabular-nums">
                          {profile.wins}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#090B12] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Points
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold text-amber-300 tabular-nums">
                          {profile.totalPoints}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>4 Modes · Vector Maps · Live Radar</span>
                      <span className="font-mono text-slate-500">v2.0</span>
                    </div>
                  </div>
                </aside>
              </div>
            </motion.div>
          )}

          {/* ======================= RANKS TAB ======================= */}
          {activeTab === 'ranks' && (
            <motion.div
              key="ranks"
              data-testid="ranks-tab-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="max-w-2xl w-full mx-auto space-y-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Season ends in {daysUntilMonthEnd}d
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white leading-none mt-1">
                    Climb the boards.
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScoringInfo((v) => !v)}
                  aria-label="How points are scored"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-[#141724] hover:bg-[#1D2235] border border-white/[0.09] flex items-center justify-center text-slate-300"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>

              {showScoringInfo && (
                <div className="rounded-2xl bg-[#10131F] border border-emerald-500/25 p-4 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-emerald-300">Scoring rules:</strong> Runners earn +1 pt
                  every 3 minutes survived plus +10 pts for finishing uncaught. Hunters earn +3 pts
                  per tag plus +10 pts for a clean sweep.
                </div>
              )}

              {/* Leaderboard Opt-In / Active Rank Card */}
              <div className="rounded-3xl bg-[#10131E] border border-white/[0.09] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-base font-extrabold text-white">
                    {profile.leaderboardOptIn
                      ? myRankPos > 0
                        ? `You're ranked #${myRankPos} · ${profile.totalPoints} pts`
                        : 'Leaderboards are active'
                      : 'Turn on leaderboards'}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {profile.leaderboardOptIn
                      ? 'Every completed round updates your career rank and points automatically.'
                      : 'Every round scores points. See where you rank against friends and bots.'}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="toggle-leaderboard-btn"
                  onClick={() =>
                    onUpdateProfile({ leaderboardOptIn: !profile.leaderboardOptIn })
                  }
                  className={`min-h-[44px] px-5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors shrink-0 ${
                    profile.leaderboardOptIn
                      ? 'bg-white/[0.08] hover:bg-white/[0.14] text-slate-200 border border-white/10'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-[#08090E]'
                  }`}
                >
                  {profile.leaderboardOptIn ? 'Opt out' : 'Turn on'}
                </button>
              </div>

              {/* Ranked Table */}
              <div className="rounded-3xl bg-[#0F121C] border border-white/[0.08] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.07] grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <div className="col-span-2">Pos</div>
                  <div className="col-span-7">Player</div>
                  <div className="col-span-3 text-right">Pts</div>
                </div>

                {rankedEntries.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Trophy className="w-8 h-8 text-emerald-400/70 mx-auto" />
                    <div className="text-sm font-bold text-white">No scores recorded yet</div>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Turn on leaderboards or finish a live or demo round to post your first score.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {rankedEntries.map((row, idx) => (
                      <div
                        key={row.playerId}
                        className={`px-4 py-3.5 grid grid-cols-12 items-center ${
                          row.isSelf ? 'bg-emerald-500/10' : ''
                        }`}
                      >
                        <div className="col-span-2 font-mono text-sm font-extrabold text-slate-300 tabular-nums">
                          #{idx + 1}
                        </div>
                        <div className="col-span-7 flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-[#08090E] shrink-0"
                            style={{
                              backgroundColor: row.isSelf ? looks.dotColor : '#334155',
                              color: row.isSelf ? '#08090E' : '#F8FAFC',
                            }}
                          >
                            {getCallsignInitial(row.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                              {row.name}
                              {row.isSelf ? ' (You)' : ''}
                            </div>
                            <div className="text-[11px] text-slate-400 tabular-nums">
                              {row.wins} {row.wins === 1 ? 'win' : 'wins'}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3 text-right font-mono text-base font-extrabold text-emerald-400 tabular-nums">
                          {row.totalPoints}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ======================= YOU (PROFILE) TAB ======================= */}
          {activeTab === 'you' && (
            <motion.div
              key="you"
              data-testid="you-tab-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="max-w-2xl w-full mx-auto space-y-6"
            >
              {/* Avatar & Identity Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center text-2xl font-black text-[#08090E] shrink-0 shadow-xl"
                    style={{ backgroundColor: looks.dotColor }}
                  >
                    {getCallsignInitial(displayName)}
                  </div>
                  <div className="min-w-0">
                    <h1
                      className="font-display text-4xl font-extrabold leading-none truncate"
                      style={{ color: looks.nameColor }}
                    >
                      {displayName}
                    </h1>
                    <div className="text-xs text-slate-400 mt-1 truncate">
                      {handleText} · {looks.title}
                    </div>
                  </div>
                </div>
              </div>

              {/* 6-Stat Career Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Rounds', value: String(profile.roundsPlayed) },
                  { label: 'Won', value: String(profile.wins) },
                  { label: 'Win rate', value: `${winRate}%` },
                  { label: 'Never caught', value: String(profile.neverCaughtCount ?? 0) },
                  {
                    label: 'Best escape',
                    value: `${Math.round(profile.bestEscapeMinutes ?? 0)}m`,
                  },
                  {
                    label: 'Farthest',
                    value: formatDistance(profile.longestRoundMeters ?? 0, 'mi'),
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl bg-[#10131E] border border-white/[0.08] p-4"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {stat.label}
                    </div>
                    <div className="mt-1.5 font-mono text-2xl font-extrabold text-white tabular-nums">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Achievements Horizontal Shelf */}
              <section className="space-y-2.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Achievements
                  </h2>
                  <span className="text-xs font-mono text-emerald-400 tabular-nums">
                    {profile.badges.length} of {BADGE_DEFINITIONS.length}
                  </span>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                  {BADGE_DEFINITIONS.map((b) => {
                    const unlocked = profile.badges.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        className={`shrink-0 w-[184px] rounded-2xl p-3.5 border ${
                          unlocked
                            ? 'bg-emerald-500/10 border-emerald-400/40'
                            : 'bg-[#0F121C] border-white/[0.07] opacity-65'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {unlocked ? (
                            <Award className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Lock className="w-4 h-4 text-slate-500" />
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {unlocked ? 'Unlocked' : 'Locked'}
                          </span>
                        </div>
                        <div className="mt-2.5 text-sm font-bold text-white leading-snug">
                          {b.name}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                          {b.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Your Looks Customization Card */}
              <section className="rounded-3xl bg-[#10131E] border border-white/[0.08] p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Your looks</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Customize your map dot, trail style, and title.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="open-looks-btn"
                    onClick={() => setShowLooksSheet(true)}
                    className="min-h-[42px] px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-xs font-bold text-emerald-300"
                  >
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-xl bg-[#090B12] p-3">
                    <div className="text-slate-400">Dot Color</div>
                    <div className="mt-1.5 flex items-center gap-2 font-bold text-white">
                      <span
                        className="w-3.5 h-3.5 rounded-full inline-block"
                        style={{ backgroundColor: looks.dotColor }}
                      />
                      <span className="font-mono text-[11px]">{looks.dotColor}</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#090B12] p-3">
                    <div className="text-slate-400">Trail</div>
                    <div className="mt-1.5 font-bold text-white capitalize">{looks.trailStyle}</div>
                  </div>
                  <div className="rounded-xl bg-[#090B12] p-3">
                    <div className="text-slate-400">Name</div>
                    <div className="mt-1.5 font-bold" style={{ color: looks.nameColor }}>
                      {displayName}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#090B12] p-3">
                    <div className="text-slate-400">Title</div>
                    <div className="mt-1.5 font-bold text-emerald-300 truncate">{looks.title}</div>
                  </div>
                </div>
              </section>

              {/* Editable Profile Section */}
              <section className="rounded-3xl bg-[#10131E] border border-white/[0.08] p-5 space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Profile
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="fk-profile-name"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Callsign
                    </label>
                    <input
                      id="fk-profile-name"
                      type="text"
                      maxLength={20}
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value);
                        onUpdateProfile({ name: e.target.value });
                      }}
                      placeholder="Your callsign"
                      className="w-full min-h-[48px] px-4 rounded-xl bg-[#08090E] border border-white/10 text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="fk-profile-username"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Username
                    </label>
                    <input
                      id="fk-profile-username"
                      type="text"
                      maxLength={20}
                      value={usernameInput}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                        setUsernameInput(clean);
                        onUpdateProfile({ username: clean });
                      }}
                      placeholder="handle"
                      className="w-full min-h-[48px] px-4 rounded-xl bg-[#08090E] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </section>

              {/* Get Help Quick Row */}
              <button
                type="button"
                onClick={onOpenGetHelp}
                className="w-full min-h-[54px] px-5 rounded-2xl bg-red-600/10 hover:bg-red-600/18 border border-red-500/30 flex items-center justify-between text-sm font-bold text-red-200 transition-colors"
              >
                <span className="inline-flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <span>Get help · Emergency tools</span>
                </span>
                <ChevronRight className="w-4 h-4 text-red-300" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom 3-Tab Dock: Play | Ranks | You */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 px-4 pb-safe pointer-events-none">
        <nav
          aria-label="Mobile bottom navigation"
          data-testid="home-bottom-tabs"
          className="pointer-events-auto max-w-sm mx-auto rounded-full bg-[#0E111A]/96 backdrop-blur-xl border border-emerald-500/20 p-1.5 grid grid-cols-3 gap-1 shadow-2xl"
        >
          {(
            [
              { id: 'play', label: 'Play', Icon: Play },
              { id: 'ranks', label: 'Ranks', Icon: Trophy },
              { id: 'you', label: 'You', Icon: User },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`home-tab-${id}`}
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[46px] rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-bold leading-none">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Join With Code Centered Modal (stays cleanly above mobile keyboard) */}
      <AnimatePresence>
        {showJoinSheet && (
          <motion.div
            data-testid="join-code-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pb-[12vh] sm:pb-4 overflow-y-auto"
            onClick={() => setShowJoinSheet(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Join game with code"
          >
            <motion.form
              initial={{ scale: 0.94, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleJoinSubmit}
              className="w-full max-w-md my-auto rounded-[28px] bg-[#0E111A] border border-white/[0.12] p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl font-extrabold text-white leading-none">
                    Join with a code
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter the 6-character code from the host&apos;s lobby.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJoinSheet(false)}
                  aria-label="Close join dialog"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="fk-join-callsign"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    Your Callsign
                  </label>
                  <input
                    id="fk-join-callsign"
                    type="text"
                    maxLength={20}
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      onUpdateProfile({ name: e.target.value });
                    }}
                    placeholder="Enter your name"
                    className="w-full min-h-[46px] px-4 rounded-xl bg-[#08090E] border border-white/10 text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="fk-room-code"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    6-Character Game Code
                  </label>
                  <input
                    id="fk-room-code"
                    type="text"
                    maxLength={6}
                    autoFocus
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(formatRoomCodeInput(e.target.value));
                      setJoinError(null);
                    }}
                    placeholder="FK84XP"
                    className="w-full min-h-[54px] px-4 rounded-xl bg-[#08090E] border border-white/10 font-mono text-2xl font-extrabold tracking-[0.26em] text-center text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 uppercase"
                  />
                </div>

                {joinError && (
                  <p role="alert" className="text-xs font-semibold text-red-400">
                    {joinError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={joining}
                className="w-full min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#08090E] font-extrabold text-base inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>{joining ? 'Joining...' : 'Join Lobby'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Looks Customizer Sheet */}
      <AnimatePresence>
        {showLooksSheet && (
          <LooksSheet
            playerName={profile.name}
            initialLooks={looks}
            onSave={(nextLooks) => onUpdateProfile({ looks: nextLooks })}
            onClose={() => setShowLooksSheet(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
