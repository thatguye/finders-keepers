import React from 'react';
import { motion } from 'motion/react';
import { ScrollText, X } from 'lucide-react';

interface ChangelogModalProps {
  onClose: () => void;
}

interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

const RELEASES: ReleaseNote[] = [
  {
    version: '1.4',
    date: 'Nov 2026',
    title: 'Visual Overhaul & Field Upgrades',
    highlights: [
      'Streamlined every screen with a cleaner layout, smoother transitions, and refined mobile spacing.',
      'Upgraded map styles so every theme switches cleanly with crisp contrast.',
      'Refreshed team walkie-talkie feedback and updated default measurements to US miles and feet.',
    ],
  },
  {
    version: '1.3',
    date: 'Nov 2026',
    title: 'Field Polish & Clarity',
    highlights: [
      'Refined live map markers and touch gestures for cleaner readability on smaller screens.',
      'Improved battery-saving pocket screen handling and alert feedback.',
      'General performance and stability improvements across solo and multiplayer rounds.',
    ],
  },
  {
    version: '1.2',
    date: 'Oct 2026',
    title: 'Custom Arenas & Recaps',
    highlights: [
      'Added more flexible play-area tools and reusable match setups.',
      'Expanded post-round summaries with shareable visuals and career milestones.',
      'Improved reliability when moving through areas with weak reception.',
    ],
  },
  {
    version: '1.1',
    date: 'Sep 2026',
    title: 'New Modes & Field Gear',
    highlights: [
      'Introduced additional game modes and upgraded team communication.',
      'Added extra map looks and quick-access safety tools for outdoor sessions.',
      'Smoothed out lobby invites and automatic team balancing.',
    ],
  },
  {
    version: '1.0',
    date: 'Aug 2026',
    title: 'Initial Launch',
    highlights: [
      'First release of Finders Keepers with real-world GPS manhunt rounds, team fog-of-war, and solo practice.',
    ],
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Changelog"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-2xl bg-[#11131D] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-[#222638] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <ScrollText className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Changelog</h2>
              <p className="text-xs text-slate-400">Recent updates to Finders Keepers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close changelog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {RELEASES.map((release, idx) => (
            <article
              key={release.version}
              className={idx > 0 ? 'pt-5 border-t border-[#1F2334]' : ''}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-white">{release.title}</h3>
                <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                  v{release.version} · {release.date}
                </span>
              </div>
              <ul className="mt-2.5 space-y-2 text-sm text-slate-300 leading-relaxed">
                {release.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="p-4 border-t border-[#222638] bg-[#0D0F17]">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-[#1A1E2E] hover:bg-[#23283D] border border-[#2C324A] text-sm font-bold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
