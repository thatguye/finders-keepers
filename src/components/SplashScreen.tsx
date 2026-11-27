import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BrandIcon } from './BrandIcon';

interface SplashScreenProps {
  durationMs: number;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ durationMs, onComplete }) => {
  const prefersReducedMotion = useReducedMotion();
  const mountedAtRef = useRef<number>(Date.now());
  const dismissedRef = useRef<boolean>(false);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    const timer = window.setTimeout(dismiss, durationMs);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const handleBackdropClick = () => {
    if (Date.now() - mountedAtRef.current < 260) return;
    dismiss();
  };

  const progressSeconds = Math.max(0.45, (durationMs - 150) / 1000);

  return (
    <motion.div
      data-testid="splash-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Launching Finders Keepers"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.035 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] bg-[#08090E] text-white flex flex-col items-center justify-center overflow-hidden select-none px-6 pt-safe pb-safe cursor-pointer"
    >
      {/* Ambient Emerald Radial Atmosphere */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 44%, rgba(16,185,129,0.20) 0%, rgba(16,185,129,0.06) 34%, rgba(8,9,14,0) 68%)',
        }}
      />

      {/* Subtle Tactical Coordinate Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(52,211,153,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(52,211,153,0.45) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(circle at 50% 46%, black 22%, transparent 74%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 46%, black 22%, transparent 74%)',
        }}
      />

      {/* Center Radar Stage + Brand Emblem */}
      <div className="relative flex flex-col items-center">
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          {/* Outer Concentric Radar Ring */}
          <motion.div
            aria-hidden="true"
            initial={prefersReducedMotion ? { opacity: 0.35 } : { scale: 0.45, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.85, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 rounded-full border border-emerald-500/20"
          />

          {/* Middle Dashed Radar Ring */}
          <motion.div
            aria-hidden="true"
            initial={prefersReducedMotion ? { opacity: 0.4 } : { scale: 0.52, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.78, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-7 rounded-full border border-dashed border-emerald-400/25"
          />

          {/* Inner Radar Ring */}
          <motion.div
            aria-hidden="true"
            initial={prefersReducedMotion ? { opacity: 0.5 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-16 rounded-full border border-emerald-400/35"
          />

          {/* Rotating Emerald Radar Sweep */}
          {!prefersReducedMotion && (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, rotate: -65 }}
              animate={{ opacity: 1, rotate: 295 }}
              transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(16,185,129,0) 0deg, rgba(16,185,129,0) 285deg, rgba(16,185,129,0.18) 348deg, rgba(52,211,153,0.52) 360deg)',
              }}
            />
          )}

          {/* Radar Target Blips (Runner Emerald + Hunter Crimson) */}
          {!prefersReducedMotion && (
            <>
              <motion.span
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 1, 0.35], scale: [0.4, 1.15, 1, 0.9] }}
                transition={{ duration: 1.5, delay: 0.45, ease: 'easeOut' }}
                className="absolute top-[22%] right-[19%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
              />
              <motion.span
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 1, 0.4], scale: [0.4, 1.15, 1, 0.9] }}
                transition={{ duration: 1.4, delay: 0.72, ease: 'easeOut' }}
                className="absolute bottom-[24%] left-[18%] w-2.5 h-2.5 rounded-full bg-[#EA3419] shadow-[0_0_12px_rgba(234,52,25,0.9)]"
              />
            </>
          )}

          {/* Expanding Lock-On Sonar Pulse */}
          {!prefersReducedMotion && (
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: [0.72, 1.65], opacity: [0.75, 0] }}
              transition={{ duration: 1.05, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="absolute w-28 h-28 rounded-[30px] border-2 border-emerald-400/80"
            />
          )}

          {/* Four Tactical Lock-On Corner Reticles */}
          <motion.div
            aria-hidden="true"
            initial={prefersReducedMotion ? { opacity: 0.85 } : { scale: 1.28, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.62, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="absolute w-36 h-36 sm:w-40 sm:h-40 pointer-events-none"
          >
            <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400/80 rounded-tl-md" />
            <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400/80 rounded-tr-md" />
            <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400/80 rounded-bl-md" />
            <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400/80 rounded-br-md" />
          </motion.div>

          {/* Official Chasing-Figures Emblem */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.62, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.25 }
                : { type: 'spring', stiffness: 260, damping: 20, delay: 0.16 }
            }
            className="relative z-10 p-1.5 rounded-[28px] bg-gradient-to-b from-emerald-400/35 via-emerald-500/15 to-white/5 shadow-[0_18px_50px_rgba(16,185,129,0.28)]"
          >
            <BrandIcon className="w-24 h-24 sm:w-28 sm:h-28 rounded-[22px]" />
          </motion.div>
        </div>

        {/* Masked Wordmark Reveal */}
        <div className="mt-4 text-center space-y-2">
          <div className="overflow-hidden">
            <motion.h1
              initial={prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl sm:text-5xl font-extrabold tracking-[0.08em] text-white leading-none"
            >
              FINDERS KEEPERS
            </motion.h1>
          </div>

          <motion.p
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.62, ease: [0.16, 1, 0.3, 1] }}
            className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400"
          >
            GPS HIDE &amp; SEEK
          </motion.p>
        </div>

        {/* Sleek Calibration Bar */}
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.55 }}
          className="mt-8 w-44 h-[3px] rounded-full bg-white/10 overflow-hidden"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: progressSeconds, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'left center' }}
            className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-300 to-emerald-400"
          />
        </motion.div>
      </div>

      {/* Subtle Skip Control */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ duration: 0.45, delay: 0.85 }}
        className="absolute bottom-8 pb-safe"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="min-h-[44px] px-4 rounded-full text-[11px] font-medium tracking-wide text-slate-400 hover:text-white transition-colors"
        >
          Tap anywhere to continue
        </button>
      </motion.div>
    </motion.div>
  );
};
