import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { RoomState } from '../types/game';
import { triggerTacticalAlert } from '../services/hardware';

interface RoleRevealOverlayProps {
  room: RoomState;
  viewerId: string;
  roundNumber: number;
  stealthHaptic: boolean;
  onComplete: () => void;
}

export const RoleRevealOverlay: React.FC<RoleRevealOverlayProps> = ({
  room,
  viewerId,
  roundNumber,
  stealthHaptic,
  onComplete,
}) => {
  const [stage, setStage] = useState<'mystery' | 'revealed'>('mystery');

  const viewer = room.players.find((p) => p.id === viewerId);
  const role = viewer?.role ?? 'runner';
  const isImposter = room.settings.mode === 'imposter' && !!viewer?.isImposter;

  const runnerCount = room.players.filter((p) => p.role === 'runner' && !p.eliminated).length;
  const hunterCount = room.players.filter((p) => p.role === 'hunter').length;

  const teammates = room.players
    .filter((p) => p.id !== viewerId && p.role === role)
    .map((p) => p.name.replace(' (AI)', ''));

  const headStartText =
    room.settings.headStartMin >= 1
      ? `${Math.round(room.settings.headStartMin)} min`
      : room.settings.headStartMin > 0
      ? `${Math.round(room.settings.headStartMin * 60)} sec`
      : null;

  const handleRevealTap = () => {
    if (stage !== 'mystery') return;
    triggerTacticalAlert('radar_ping', stealthHaptic);
    setStage('revealed');
  };

  const revealBgClass =
    isImposter || role === 'hunter'
      ? 'bg-[#E62E14]'
      : role === 'runner'
      ? 'bg-[#0C9A5E]'
      : 'bg-[#1D1E24]';

  const badgeTextColor =
    isImposter || role === 'hunter'
      ? 'text-[#B91F0B]'
      : role === 'runner'
      ? 'text-[#066B40]'
      : 'text-[#1D1E24]';

  const roleTitle = isImposter
    ? 'Imposter'
    : role === 'hunter'
    ? 'Hunter'
    : role === 'runner'
    ? 'Runner'
    : 'Spectator';

  const headlineLines: [string, string] = isImposter
    ? ["You're", 'the imposter.']
    : role === 'hunter'
    ? ["You're", 'it.']
    : role === 'runner'
    ? ['Run &', 'hide.']
    : ['Watch', 'live.'];

  const missionSummary = isImposter
    ? `Blend in with ${runnerCount} runner${runnerCount === 1 ? '' : 's'} for ${room.settings.roundLengthMin} min. Avoid getting voted out.`
    : role === 'hunter'
    ? `Find and tag all ${runnerCount} runner${runnerCount === 1 ? '' : 's'} in ${room.settings.roundLengthMin} min.${
        headStartText ? ` They get a ${headStartText} head start.` : ''
      }`
    : role === 'runner'
    ? `Outrun ${hunterCount} hunter${hunterCount === 1 ? '' : 's'} for ${room.settings.roundLengthMin} min.${
        headStartText ? ` You get a ${headStartText} head start.` : ''
      }`
    : 'Follow every move and radar ping across the zone.';

  const teamLine =
    teammates.length > 0
      ? `${role === 'hunter' ? 'Hunting' : 'Running'} with ${teammates.slice(0, 3).join(', ')}${
          teammates.length > 3 ? ` +${teammates.length - 3}` : ''
        }`
      : null;

  return (
    <div
      data-testid="role-reveal-overlay"
      className="fixed inset-0 z-[80] overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={stage === 'mystery' ? 'Tap anywhere to reveal your role' : `Your role is ${roleTitle}`}
    >
      <AnimatePresence mode="wait">
        {stage === 'mystery' ? (
          <motion.button
            key="mystery"
            type="button"
            data-testid="role-reveal-mystery-btn"
            onClick={handleRevealTap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.22 }}
            className="w-full h-full bg-[#161514] text-white flex flex-col justify-between px-6 pt-safe pb-safe text-left cursor-pointer focus:outline-none"
          >
            {/* Top Brand + Room Code Row */}
            <div className="w-full max-w-md mx-auto pt-3 flex items-center justify-between gap-3">
              <span className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
                FINDERS KEEPERS
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/[0.08] text-xs font-semibold text-white/85 tabular-nums whitespace-nowrap">
                {room.code} · Round {roundNumber}
              </span>
            </div>

            {/* Giant Vermilion Question Mark */}
            <div className="flex-1 flex items-center justify-center py-6">
              <motion.div
                initial={{ scale: 0.86, opacity: 0 }}
                animate={{ scale: [1, 1.035, 1], opacity: 1 }}
                transition={{
                  opacity: { duration: 0.28 },
                  scale: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
                }}
                aria-hidden="true"
                className="w-[220px] sm:w-[260px] h-[300px] sm:h-[340px] flex items-center justify-center"
              >
                <svg viewBox="0 0 220 300" className="w-full h-full overflow-visible">
                  <path
                    d="M34 114 C34 48 80 18 119 18 C165 18 197 48 197 92 C197 127 177 148 152 166 C135 178 131 187 131 206 L86 206 C86 171 96 154 118 137 C135 124 146 113 146 95 C146 77 133 66 115 66 C94 66 82 81 82 114 Z"
                    fill="#E62E14"
                  />
                  <rect x="85" y="232" width="49" height="50" rx="2" fill="#E62E14" />
                </svg>
              </motion.div>
            </div>

            {/* Bottom Prompt */}
            <div className="w-full max-w-md mx-auto pb-8">
              <p className="text-sm font-medium text-white/55">
                No peeking at your friends&apos; phones
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Tap anywhere to find out
              </p>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="revealed"
            data-testid="role-reveal-card"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className={`w-full h-full ${revealBgClass} text-white flex flex-col justify-between px-6 pt-safe pb-safe`}
          >
            {/* Top Brand + Room Pill + Role Badge */}
            <div className="w-full max-w-md mx-auto pt-3 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
                  FINDERS KEEPERS
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-white/18 text-xs font-semibold text-white tabular-nums whitespace-nowrap">
                  {room.code} · Round {roundNumber}
                </span>
              </div>

              <div>
                <span
                  className={`inline-flex items-center px-4 py-1.5 rounded-full bg-white ${badgeTextColor} text-sm font-extrabold tracking-tight shadow-sm`}
                >
                  Your role · {roleTitle}
                </span>
              </div>
            </div>

            {/* Center Massive Display Headline */}
            <div className="w-full max-w-md mx-auto my-auto py-4">
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-[6.4rem] sm:text-[7.5rem] font-extrabold tracking-tight leading-[0.86] text-white"
              >
                <span className="block">{headlineLines[0]}</span>
                <span className="block">{headlineLines[1]}</span>
              </motion.h1>
            </div>

            {/* Bottom Mission Copy + Let's Go CTA */}
            <div className="w-full max-w-md mx-auto pb-5 space-y-4">
              <p className="text-xl sm:text-2xl font-extrabold leading-snug text-white">
                {missionSummary}
              </p>

              {teamLine && (
                <p className="text-base font-semibold text-white/90">{teamLine}</p>
              )}

              <p className="text-sm leading-relaxed text-white/80">
                Alerts reach you with your phone locked. Just don&apos;t swipe Finders Keepers
                closed.
              </p>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="button"
                data-testid="role-reveal-continue-btn"
                onClick={onComplete}
                className="mt-2 w-full min-h-[58px] rounded-2xl bg-white hover:bg-white/95 text-[#141413] text-lg font-extrabold shadow-2xl transition-colors"
              >
                Let&apos;s go
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
