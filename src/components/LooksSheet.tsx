import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import type { PlayerLooks } from '../types/game';
import { getCallsignInitial, PLAYER_LOOK_COLORS, PLAYER_TITLES } from '../game/rules';

interface LooksSheetProps {
  playerName: string;
  initialLooks: PlayerLooks;
  onSave: (looks: PlayerLooks) => void;
  onClose: () => void;
}

export const LooksSheet: React.FC<LooksSheetProps> = ({
  playerName,
  initialLooks,
  onSave,
  onClose,
}) => {
  const [looks, setLooks] = useState<PlayerLooks>(initialLooks);
  const displayName = playerName.trim() || 'Field Agent';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize your look"
    >
      <motion.div
        initial={{ y: 36, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 36, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-[#0E111A] border-t sm:border border-white/[0.1] p-5 pb-safe shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-white leading-none">
              Your looks
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              How your dot and callsign appear on the map and in lobbies.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close looks customizer"
            className="min-h-[44px] min-w-[44px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Map Dot & Lobby Row Preview */}
        <div className="rounded-2xl bg-[#08090E] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-full border-2 border-white flex items-center justify-center text-base font-black text-[#08090E] shrink-0 shadow-lg"
              style={{
                backgroundColor: looks.dotColor,
                boxShadow: looks.trailStyle === 'glow' ? `0 0 18px ${looks.dotColor}88` : undefined,
              }}
            >
              {getCallsignInitial(displayName)}
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold truncate" style={{ color: looks.nameColor }}>
                {displayName}
              </div>
              <div className="text-xs text-slate-400">{looks.title}</div>
            </div>
          </div>
          <svg width="64" height="24" viewBox="0 0 64 24" aria-hidden="true" className="shrink-0">
            <path
              d="M4 18 Q24 4, 42 14 T60 8"
              fill="none"
              stroke={looks.dotColor}
              strokeWidth={looks.trailStyle === 'glow' ? 4 : 2.5}
              strokeDasharray={looks.trailStyle === 'dashed' ? '5 4' : undefined}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Dot Color */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Dot Color</div>
          <div className="grid grid-cols-6 gap-2">
            {PLAYER_LOOK_COLORS.map((c) => {
              const active = looks.dotColor === c.hex;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setLooks((prev) => ({ ...prev, dotColor: c.hex }))}
                  aria-label={`Select ${c.label} dot color`}
                  className={`h-11 rounded-xl border-2 flex items-center justify-center transition-transform ${
                    active ? 'border-white scale-105' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {active && <Check className="w-4 h-4 text-[#08090E] stroke-[3]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trail Style */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Trail Style</div>
          <div className="grid grid-cols-3 gap-2">
            {(['solid', 'dashed', 'glow'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setLooks((prev) => ({ ...prev, trailStyle: style }))}
                className={`min-h-[44px] rounded-xl text-xs font-bold capitalize border transition-colors ${
                  looks.trailStyle === style
                    ? 'bg-emerald-500/18 border-emerald-400 text-emerald-300'
                    : 'bg-[#08090E] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Name Color */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Name Color</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Crisp White', hex: '#F4F5F9' },
              { label: 'Emerald', hex: '#34D399' },
              { label: 'Cyan', hex: '#22D3EE' },
            ].map((nc) => (
              <button
                key={nc.hex}
                type="button"
                onClick={() => setLooks((prev) => ({ ...prev, nameColor: nc.hex }))}
                className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                  looks.nameColor === nc.hex
                    ? 'bg-white/[0.08] border-emerald-400'
                    : 'bg-[#08090E] border-white/[0.08]'
                }`}
                style={{ color: nc.hex }}
              >
                {nc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Title</div>
          <div className="grid grid-cols-2 gap-2">
            {PLAYER_TITLES.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => setLooks((prev) => ({ ...prev, title }))}
                className={`min-h-[42px] px-3 rounded-xl text-xs font-bold border text-left transition-colors ${
                  looks.title === title
                    ? 'bg-emerald-500/18 border-emerald-400 text-emerald-300'
                    : 'bg-[#08090E] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
              >
                {title}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onSave(looks);
            onClose();
          }}
          className="w-full min-h-[50px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#08090E] font-extrabold text-base transition-colors"
        >
          Save Look
        </button>
      </motion.div>
    </motion.div>
  );
};
