import React from 'react';
import { motion } from 'motion/react';
import { Check, ChevronRight, X } from 'lucide-react';
import type { GameMode } from '../types/game';
import classicArt from '../assets/images/mode_classic_1795813417735.jpg';
import infectionArt from '../assets/images/mode_infection_1795813420496.jpg';
import curfewArt from '../assets/images/mode_curfew_1795813420830.jpg';
import imposterArt from '../assets/images/mode_imposter_art_1795817065441.jpg';

export interface ModeMeta {
  id: GameMode;
  name: string;
  tagline: string;
  shortDesc: string;
  art: string;
  accentClass: string;
}

export const GAME_MODES: ModeMeta[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Hide, run, survive the clock.',
    shortDesc: 'Tagged Runners become Spectators. Outlast the countdown or clear the field.',
    art: classicArt,
    accentClass: 'text-emerald-400',
  },
  {
    id: 'infection',
    name: 'Infection',
    tagline: 'Get tagged and join the hunt.',
    shortDesc: 'Every Runner you catch immediately flips sides and hunts with the pack.',
    art: infectionArt,
    accentClass: 'text-red-400',
  },
  {
    id: 'curfew',
    name: 'Curfew',
    tagline: 'The safe zone keeps moving.',
    shortDesc: 'Boundaries shift and shrink inside the map, forcing constant relocation.',
    art: curfewArt,
    accentClass: 'text-amber-400',
  },
  {
    id: 'imposter',
    name: 'Imposter',
    tagline: 'Someone on your team is faking it.',
    shortDesc: 'Secret Imposters hide among Runners. Call Emergency Meetings to vote them out.',
    art: imposterArt,
    accentClass: 'text-cyan-400',
  },
];

interface ModePickerSheetProps {
  selectedMode: GameMode;
  canEdit: boolean;
  onSelectMode: (mode: GameMode) => void;
  onOpenHowToPlay: () => void;
  onClose: () => void;
}

export const ModePickerSheet: React.FC<ModePickerSheetProps> = ({
  selectedMode,
  canEdit,
  onSelectMode,
  onOpenHowToPlay,
  onClose,
}) => {
  const activeMeta = GAME_MODES.find((m) => m.id === selectedMode) ?? GAME_MODES[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Change game mode"
    >
      <motion.div
        initial={{ y: 40, opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-[#0E111A] border-t sm:border border-white/[0.1] pb-safe shadow-2xl overflow-hidden"
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 sm:hidden" />

        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white leading-none">
              Change the mode.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              {canEdit
                ? 'Everyone in the lobby sees the change.'
                : 'Only the host can switch the active game mode.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mode picker"
            className="min-h-[44px] min-w-[44px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Horizontal Swipeable Mode Carousel */}
        <div
          data-testid="mode-carousel"
          className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory scroll-px-5 px-5 py-3 no-scrollbar"
        >
          {GAME_MODES.map((m) => {
            const active = selectedMode === m.id;
            return (
              <motion.button
                key={m.id}
                data-mode-card={m.id}
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={!canEdit}
                onClick={(e) => {
                  onSelectMode(m.id);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                  });
                }}
                className={`relative snap-center shrink-0 w-[230px] sm:w-[248px] aspect-[3/4] rounded-[24px] overflow-hidden text-left border-2 transition-all bg-[#08090E] ${
                  active
                    ? 'border-emerald-400 ring-1 ring-emerald-400/50 shadow-[0_12px_36px_rgba(16,185,129,0.28)]'
                    : 'border-white/[0.1] hover:border-white/25 opacity-90 hover:opacity-100'
                }`}
              >
                <img
                  src={m.art}
                  alt={`${m.name} mode tactical illustration`}
                  className="absolute inset-0 w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090E] via-[#08090E]/45 to-transparent" />

                {/* Selection Checkmark */}
                {active && (
                  <div className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-emerald-400 text-[#08090E] flex items-center justify-center shadow-lg">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 space-y-1.5">
                  <div className="font-display text-3xl font-extrabold text-white leading-none">
                    {m.name}
                  </div>
                  <div className={`text-xs font-bold ${m.accentClass}`}>{m.tagline}</div>
                  <p className="text-xs text-slate-300 leading-snug">{m.shortDesc}</p>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Mode Quick Dots */}
        <div
          data-testid="mode-carousel-dots"
          className="flex items-center justify-center gap-1.5 pb-1"
        >
          {GAME_MODES.map((m) => {
            const isSelected = selectedMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-label={`Select ${m.name} mode`}
                aria-pressed={isSelected}
                onClick={() => {
                  if (canEdit) onSelectMode(m.id);
                  const card = document.querySelector(`[data-mode-card="${m.id}"]`);
                  card?.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                  });
                }}
                className="p-1.5 -m-1 flex items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    isSelected ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/25'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="px-5 pt-2 pb-4 space-y-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenHowToPlay();
            }}
            className="w-full min-h-[44px] px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] flex items-center justify-between text-sm font-semibold text-slate-200 transition-colors"
          >
            <span>How {activeMeta.name} plays</span>
            <ChevronRight className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[50px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-extrabold text-base transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
