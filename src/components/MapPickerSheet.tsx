import React from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import type { MapTheme } from '../types/game';

export interface MapThemeMeta {
  id: MapTheme;
  name: string;
  subtitle: string;
  previewBg: string;
  roadPrimary: string;
  roadSecondary: string;
  parkFill: string;
  waterFill: string;
  zoneColor: string;
  isLight: boolean;
}

export const MAP_THEME_OPTIONS: MapThemeMeta[] = [
  {
    id: 'night',
    name: 'Night',
    subtitle: 'Tactical dark vector map for low glare.',
    previewBg: '#0E121B',
    roadPrimary: '#273147',
    roadSecondary: '#1B2233',
    parkFill: '#122624',
    waterFill: '#0B1D33',
    zoneColor: '#10B981',
    isLight: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    subtitle: 'Crisp street & park labels for daytime runs.',
    previewBg: '#E7EBF0',
    roadPrimary: '#FFFFFF',
    roadSecondary: '#D2D9E3',
    parkFill: '#C7E7CE',
    waterFill: '#A8D1F5',
    zoneColor: '#059669',
    isLight: true,
  },
  {
    id: 'satellite',
    name: 'Satellite',
    subtitle: 'High-res aerial imagery with street names.',
    previewBg: '#192922',
    roadPrimary: '#4B5B53',
    roadSecondary: '#304138',
    parkFill: '#1F3B2C',
    waterFill: '#132B3A',
    zoneColor: '#34D399',
    isLight: false,
  },
  {
    id: 'snow',
    name: 'Snow',
    subtitle: 'Minimal high-contrast light monochrome map.',
    previewBg: '#F4F7FA',
    roadPrimary: '#FFFFFF',
    roadSecondary: '#DCE3EC',
    parkFill: '#E5ECF2',
    waterFill: '#D4E1EE',
    zoneColor: '#10B981',
    isLight: true,
  },
];

interface MapPickerSheetProps {
  selectedTheme: MapTheme;
  onSelectTheme: (theme: MapTheme) => void;
  onClose: () => void;
}

export const MapPickerSheet: React.FC<MapPickerSheetProps> = ({
  selectedTheme,
  onSelectTheme,
  onClose,
}) => {
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
      aria-label="Pick your map style"
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
              Pick your map.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              Only you see it. Everyone picks their own.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map picker"
            className="min-h-[44px] min-w-[44px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Horizontal Swipeable Map Style Cards */}
        <div
          data-testid="map-theme-carousel"
          className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory px-5 py-3 no-scrollbar"
        >
          {MAP_THEME_OPTIONS.map((t) => {
            const active = selectedTheme === t.id;
            return (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                className={`relative snap-center shrink-0 w-[216px] sm:w-[230px] rounded-[24px] overflow-hidden text-left border-2 transition-all bg-[#0B0E17] ${
                  active
                    ? 'border-emerald-400 shadow-[0_12px_36px_rgba(16,185,129,0.22)]'
                    : 'border-white/[0.1] hover:border-white/25'
                }`}
              >
                {/* Stylized Vector Map Preview Thumbnail */}
                <div
                  className="relative h-[176px] w-full overflow-hidden"
                  style={{ backgroundColor: t.previewBg }}
                >
                  <svg
                    viewBox="0 0 240 180"
                    className="w-full h-full"
                    aria-hidden="true"
                  >
                    {/* Park & Water Blocks */}
                    <path
                      d="M0 115 L76 92 L98 180 L0 180 Z"
                      fill={t.parkFill}
                    />
                    <path
                      d="M168 0 L240 0 L240 72 L182 88 Z"
                      fill={t.waterFill}
                    />
                    {/* Secondary Grid Streets */}
                    <path
                      d="M-10 42 L250 78 M-10 132 L250 102 M56 -10 L78 190 M152 -10 L134 190"
                      stroke={t.roadSecondary}
                      strokeWidth="4"
                      fill="none"
                    />
                    {/* Primary Arterial Roads */}
                    <path
                      d="M-10 96 C60 88, 125 60, 250 38"
                      stroke={t.roadPrimary}
                      strokeWidth="7.5"
                      fill="none"
                    />
                    <path
                      d="M104 -10 C108 62, 120 120, 146 190"
                      stroke={t.roadPrimary}
                      strokeWidth="6.5"
                      fill="none"
                    />
                    {/* Play Zone Circle Preview */}
                    <circle
                      cx="120"
                      cy="90"
                      r="44"
                      fill={t.zoneColor}
                      fillOpacity="0.16"
                      stroke={t.zoneColor}
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="120"
                      cy="90"
                      r="6"
                      fill={t.zoneColor}
                      stroke={t.isLight ? '#FFFFFF' : '#08090E'}
                      strokeWidth="2.5"
                    />
                  </svg>

                  {active && (
                    <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-emerald-400 text-[#08090E] flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="font-display text-2xl font-extrabold text-white leading-none">
                    {t.name}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-snug">{t.subtitle}</p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="px-5 pt-2 pb-4">
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
