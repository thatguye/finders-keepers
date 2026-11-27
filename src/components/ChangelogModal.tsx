import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { ScrollText, X } from 'lucide-react';
import { formatRealDateTime, resolveReleaseTimestamps } from '../game/rules';

interface ChangelogModalProps {
  onClose: () => void;
}

interface ReleaseDefinition {
  version: string;
  releasedAt: string;
  title: string;
  highlights: string[];
}

export const LATEST_APP_VERSION = '2.3';

const STORAGE_KEY = 'fk_changelog_timestamps_v4';

const RELEASES: ReleaseDefinition[] = [
  {
    version: '2.3',
    releasedAt: '2026-11-27T14:13:00-08:00',
    title: 'Mobile UI Polish & Imposter Artwork',
    highlights: [
      'Centered the Join with a code dialog in the upper-middle of the screen so it stays clearly visible above mobile keyboards.',
      'Added custom tactical artwork for Imposter mode to match Classic, Infection, and Curfew.',
      'Removed the redundant Radio Check button from the live match HUD for a cleaner map view.',
      'Dead-centered the Lobby header, fixed zone shrink timer truncation on narrow phones, made mode/map indicator dots interactive, and added tap-outside-to-close on drawers and modals.',
    ],
  },
  {
    version: '2.2',
    releasedAt: '2026-11-27T13:46:00-08:00',
    title: 'Animated Launch Splash Screen',
    highlights: [
      'Added an animated tactical radar sweep splash screen when launching Finders Keepers.',
      'Features the chasing-figures emblem with crisp entrance motion and respects reduced-motion preferences.',
    ],
  },
  {
    version: '2.1',
    releasedAt: '2026-11-27T13:22:00-08:00',
    title: 'Vector Maps, Play/Ranks/You & Lobby Overhaul',
    highlights: [
      'Upgraded live maps to smooth 60fps MapLibre GL JS vector styles via OpenFreeMap (Night, Street, Snow) plus Esri Satellite imagery with zero API keys.',
      'Added Play, Ranks (squad standings & career milestones), and You (callsign, stats, and Looks marker customization) tabs on Home.',
      'Overhauled the Lobby with swipeable Mode and Map Style pickers, editable custom room codes, and an interactive Circle/Polygon Play Zone Editor.',
      'Streamlined the live match HUD with a floating top status card and compact bottom dock featuring Flashlight, Pocket Mode, and Slide-to-Confirm tagging.',
    ],
  },
  {
    version: '2.0',
    releasedAt: '2026-11-27T12:45:00-08:00',
    title: 'Instant Out-of-Bounds & Mandatory GPS',
    highlights: [
      'Out-of-Bounds now automatically eliminates Runners the moment the 30-second countdown reaches zero—no grace period.',
      'Required real GPS permission at launch so every player joins from their live location instead of falling back to default coordinates.',
      'Removed the translucent box behind the Role Reveal question mark for a seamless dark-emerald screen.',
    ],
  },
  {
    version: '1.9',
    releasedAt: '2026-11-27T11:50:00-08:00',
    title: 'Dark Obsidian & Emerald UI + Radio Cleanup',
    highlights: [
      'Unified every screen, sheet, and overlay into the dark obsidian and emerald tactical aesthetic across 9:16 mobile viewports.',
      'Fixed the "Run & hide now" banner overlapping the live map and radio controls.',
      'Removed the microphone recording feature from Radio chat to keep messaging fast and uncluttered.',
    ],
  },
  {
    version: '1.8',
    releasedAt: '2026-11-27T11:20:00-08:00',
    title: 'Instant PWA Auto-Updates',
    highlights: [
      'Configured immediate service worker activation (autoUpdate, skipWaiting, clientsClaim, and outdated cache cleanup).',
      'Added automatic page reload when a new service worker takes control plus visibility-triggered update checks and no-cache headers for entry files.',
      'Added a subtle build version indicator on the Home screen so new deployments are immediately clear.',
    ],
  },
  {
    version: '1.7',
    releasedAt: '2026-11-27T10:50:00-08:00',
    title: 'Redesigned App Icon',
    highlights: [
      'Upgraded the Finders Keepers app icon with a sharper custom chasing-figures radar emblem across web, PWA maskable, and iOS home screen icons.',
    ],
  },
  {
    version: '1.6',
    releasedAt: '2026-11-27T10:15:00-08:00',
    title: 'Tap-to-Reveal Role Screen & Radio Rebrand',
    highlights: [
      'Added a full-screen tap-to-reveal role screen when starting a match with Random team preference.',
      'Rebranded squad messaging into Radio while keeping dedicated Team and Global channels.',
      'Updated the Changelog to show real dates and times instead of placeholder dates.',
    ],
  },
  {
    version: '1.5',
    releasedAt: '2026-11-27T09:30:00-08:00',
    title: 'Static Radar Backdrop, Team/Global Chat & Callsign Icons',
    highlights: [
      'Repositioned the Home radar background lower for better visibility and locked it static while scrolling.',
      'Prompted for location access directly on app launch.',
      'Replaced the walkie-talkie with Team and Global chat, updated map markers to show your callsign initial, and displayed all players inside the lobby.',
    ],
  },
  {
    version: '1.0',
    releasedAt: '2026-11-27T08:45:00-08:00',
    title: 'Initial Launch',
    highlights: [
      'First release of Finders Keepers with real-world GPS manhunt rounds, asymmetrical fog-of-war, real-time room sync, and Solo Demo practice.',
    ],
  },
];

function loadAndPersistTimestamps(): Record<string, number> {
  const now = Date.now();
  let stored: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, number>;
  } catch {
    stored = {};
  }
  const resolved = resolveReleaseTimestamps(RELEASES, now, stored);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
  } catch {
    // ignore storage errors
  }
  return resolved;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  const timestamps = useMemo(() => loadAndPersistTimestamps(), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Changelog"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-3xl bg-[#0B0E17] border border-emerald-500/20 shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0">
              <ScrollText className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Changelog</h2>
              <p className="text-xs text-slate-400">
                Release history · v{LATEST_APP_VERSION}
              </p>
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

        <div data-testid="changelog-list" className="p-5 overflow-y-auto flex-1 space-y-6">
          {RELEASES.map((release, idx) => (
            <article
              key={release.version}
              className={idx > 0 ? 'pt-5 border-t border-white/[0.07]' : ''}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{release.title}</h3>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                      Latest
                    </span>
                  )}
                </div>
                <span
                  data-testid="changelog-timestamp"
                  className="text-xs font-mono text-emerald-300/80 tabular-nums shrink-0"
                >
                  v{release.version} · {formatRealDateTime(timestamps[release.version])}
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

        <div className="p-4 border-t border-white/[0.08] bg-[#08090E]">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] rounded-2xl bg-[#141926] hover:bg-[#1C2334] border border-emerald-500/20 text-sm font-bold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
