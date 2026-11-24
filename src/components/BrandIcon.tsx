import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const BrandIcon: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    className={`${className} border border-white/15`}
    role="img"
    aria-label="Finders Keepers icon"
  >
    <rect width="512" height="512" rx="112" fill="#000000" />

    {/* Front Runner (Left, sprinting left) */}
    <g
      transform="translate(34 148) scale(2.22)"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="5.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="28" cy="14" r="9.5" />
      <path d="M34 23 L43 36 L48 47" />
      <path d="M34 23 L20 37 L9 21" />
      <path d="M34 23 L51 24 L67 33" />
      <path d="M48 47 L22 86 L18 82.5" />
      <path d="M48 47 L65 62 L83 48 L84.5 52.5" />
    </g>

    {/* Chasing Runner (Right, sprinting left, separated) */}
    <g
      transform="translate(264 148) scale(2.22)"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="5.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="28" cy="14" r="9.5" />
      <path d="M34 23 L43 36 L48 47" />
      <path d="M34 23 L20 37 L9 21" />
      <path d="M34 23 L51 24 L67 33" />
      <path d="M48 47 L22 86 L18 82.5" />
      <path d="M48 47 L65 62 L83 48 L84.5 52.5" />
    </g>
  </svg>
);

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = () => {
    if (isInstallable) {
      void install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.96 }}
        type="button"
        onClick={handleClick}
        aria-label="Install App"
        className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl bg-[#151824] hover:bg-[#1D2131] border border-white/10 text-xs font-semibold text-[#F4F5F9] transition-colors whitespace-nowrap shrink-0 ${className}`}
      >
        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
        <span className="sm:hidden">Install</span>
        <span className="hidden sm:inline">Install App</span>
      </motion.button>

      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Install Finders Keepers on your phone"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm rounded-2xl bg-[#12141E] border border-white/12 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <BrandIcon className="w-10 h-10 rounded-xl shrink-0" />
                  <div>
                    <h3 className="text-base font-bold text-white">Install Finders Keepers</h3>
                    <p className="text-xs text-slate-400">Full-screen GPS &amp; offline map tiles</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isIOS ? (
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 font-bold">1.</span>
                    <span>
                      Tap the <Share className="inline w-4 h-4 mx-0.5 text-cyan-400" />{' '}
                      <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 font-bold">2.</span>
                    <span>
                      Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 font-bold">3.</span>
                    <span>Launch from your Home Screen for full-screen tracking and Wake Lock.</span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 font-bold">1.</span>
                    <span>Open your browser menu (three dots or Share icon).</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 font-bold">2.</span>
                    <span>
                      Select <strong className="text-white">Install app</strong> or{' '}
                      <strong className="text-white">Add to Home screen</strong>.
                    </span>
                  </li>
                </ol>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#09090E] font-bold text-sm transition-colors"
              >
                Got It
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
