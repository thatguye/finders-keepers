import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Crosshair, Layers, Minus, Plus, RotateCcw, Undo2 } from 'lucide-react';
import type { ActiveZone, LatLng, MapTheme, UnitSystem } from '../types/game';
import {
  createDefaultPolygonAround,
  formatZoneSize,
  polygonCentroid,
  resizePolygonCornerCount,
} from '../game/geo';
import { TacticalMap } from './TacticalMap';

interface PlayZoneEditorSheetProps {
  initialZone: ActiveZone;
  initialShrinkEnabled: boolean;
  initialFinalDiameterMeters: number;
  roundLengthMin: number;
  units: UnitSystem;
  mapTheme: MapTheme;
  userPos: LatLng;
  onChangeMapTheme: (theme: MapTheme) => void;
  onSave: (zone: ActiveZone, shrinkEnabled: boolean, finalDiameterMeters: number) => void;
  onClose: () => void;
}

const THEME_CYCLE: MapTheme[] = ['night', 'standard', 'satellite', 'snow'];

const CIRCLE_DIAMETER_STEPS = [300, 500, 805, 1200, 1609, 2414, 3219, 4828, 6000];

export const PlayZoneEditorSheet: React.FC<PlayZoneEditorSheetProps> = ({
  initialZone,
  initialShrinkEnabled,
  initialFinalDiameterMeters,
  roundLengthMin,
  units,
  mapTheme,
  userPos,
  onChangeMapTheme,
  onSave,
  onClose,
}) => {
  const [zone, setZone] = useState<ActiveZone>(() => ({
    ...initialZone,
    shape: initialZone.shape === 'off' ? 'circle' : initialZone.shape,
    polygon:
      initialZone.polygon.length >= 3
        ? initialZone.polygon
        : createDefaultPolygonAround(initialZone.center || userPos, 420, 6),
  }));
  const [history, setHistory] = useState<ActiveZone[]>([]);
  const [shrinkEnabled, setShrinkEnabled] = useState(initialShrinkEnabled);
  const [finalDiameter, setFinalDiameter] = useState(initialFinalDiameterMeters);
  const [showShrinkOptions, setShowShrinkOptions] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const pushZone = (next: ActiveZone) => {
    setHistory((prev) => [...prev.slice(-15), zone]);
    setZone(next);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setZone(previous);
  };

  const handleResetPolygon = () => {
    const freshPoly = createDefaultPolygonAround(zone.center || userPos, 420, 6);
    pushZone({
      ...zone,
      shape: 'polygon',
      polygon: freshPoly,
      center: polygonCentroid(freshPoly),
    });
  };

  const handleShapeToggle = (shape: 'circle' | 'polygon') => {
    if (zone.shape === shape) return;
    if (shape === 'polygon') {
      const poly =
        zone.polygon.length >= 3
          ? zone.polygon
          : createDefaultPolygonAround(zone.center || userPos, Math.max(250, zone.diameterMeters / 2), 6);
      pushZone({ ...zone, shape: 'polygon', polygon: poly, center: polygonCentroid(poly) });
    } else {
      pushZone({ ...zone, shape: 'circle' });
    }
  };

  const stepCircleSize = (dir: -1 | 1) => {
    const cur = zone.diameterMeters;
    if (dir > 0) {
      const next = CIRCLE_DIAMETER_STEPS.find((v) => v > cur + 20) ?? 6000;
      pushZone({ ...zone, diameterMeters: next });
    } else {
      const lower = [...CIRCLE_DIAMETER_STEPS].reverse().find((v) => v < cur - 20) ?? 300;
      pushZone({ ...zone, diameterMeters: lower });
    }
  };

  const stepCorners = (delta: -1 | 1) => {
    const nextCount = Math.max(3, Math.min(12, zone.polygon.length + delta));
    if (nextCount === zone.polygon.length) return;
    const nextPoly = resizePolygonCornerCount(zone.polygon, zone.center, nextCount);
    pushZone({
      ...zone,
      polygon: nextPoly,
      center: polygonCentroid(nextPoly),
    });
  };

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(mapTheme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    onChangeMapTheme(next);
  };

  const finalShrinkPreview: ActiveZone | null = useMemo(() => {
    if (!shrinkEnabled || zone.shape !== 'circle') return null;
    const clampedFinal = Math.min(finalDiameter, Math.max(150, zone.diameterMeters - 80));
    return {
      ...zone,
      diameterMeters: clampedFinal,
    };
  }, [shrinkEnabled, zone, finalDiameter]);

  const shrinkIntervalMin = Math.max(2, Math.round(roundLengthMin / 4));

  return (
    <motion.div
      data-testid="play-zone-editor"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[75] bg-[#08090E] text-[#F4F5F9] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Play zone editor"
    >
      {/* Top Bar: Cancel | Play zone | Done */}
      <header className="relative z-20 px-4 pb-3 pt-safe bg-[#0B0E17]/94 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <h2 className="font-display text-2xl font-extrabold tracking-wide text-white">
          Play zone
        </h2>
        <button
          type="button"
          data-testid="zone-editor-done"
          onClick={() => {
            onSave(zone, shrinkEnabled, Math.min(finalDiameter, zone.diameterMeters));
            onClose();
          }}
          className="min-h-[44px] px-3 text-sm font-extrabold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Done
        </button>
      </header>

      {/* Full-Bleed MapLibre Interactive Canvas */}
      <div className="relative flex-1 min-h-0">
        <TacticalMap
          center={zone.center || userPos}
          mapTheme={mapTheme}
          activeZone={zone}
          nextZonePreview={finalShrinkPreview}
          editableZone={true}
          clickToAddPolygonPoint={zone.shape === 'polygon'}
          onZoneChange={pushZone}
          recenterSignal={recenterSignal}
          className="absolute inset-0 w-full h-full"
        />

        {/* Floating Map Tools (Right Rail) */}
        <div className="absolute right-3.5 top-4 z-20 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setRecenterSignal((n) => n + 1)}
            aria-label="Center map on play zone"
            className="w-11 h-11 rounded-full bg-[#0B0E17]/92 backdrop-blur-xl border border-white/[0.12] text-white shadow-xl flex items-center justify-center hover:bg-[#151B2B]"
          >
            <Crosshair className="w-5 h-5 text-emerald-400" />
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Switch map style"
            className="w-11 h-11 rounded-full bg-[#0B0E17]/92 backdrop-blur-xl border border-white/[0.12] text-white shadow-xl flex items-center justify-center hover:bg-[#151B2B]"
          >
            <Layers className="w-5 h-5 text-slate-200" />
          </button>
        </div>
      </div>

      {/* Bottom Interactive Control Sheet */}
      <div className="relative z-20 bg-[#0E111A] border-t border-white/[0.1] px-4 pt-3.5 pb-safe shadow-2xl">
        <div className="max-w-lg mx-auto space-y-3.5">
          {/* Circle | Draw Segmented Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#08090E] border border-white/[0.08]">
            {(
              [
                { id: 'circle', label: 'Circle' },
                { id: 'polygon', label: 'Draw' },
              ] as const
            ).map((opt) => {
              const active = zone.shape === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`zone-mode-${opt.id}`}
                  onClick={() => handleShapeToggle(opt.id)}
                  className={`min-h-[42px] rounded-xl text-sm font-bold transition-colors ${
                    active
                      ? 'bg-emerald-500 text-[#08090E]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {zone.shape === 'circle' ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="text-sm font-bold text-white">Zone size</div>
                <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  {formatZoneSize(zone.diameterMeters, units)} across · drag pin or tap map to move
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => stepCircleSize(-1)}
                  disabled={zone.diameterMeters <= 300}
                  aria-label="Decrease zone size"
                  className="w-11 h-11 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-40 border border-white/[0.1] flex items-center justify-center text-white"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepCircleSize(1)}
                  disabled={zone.diameterMeters >= 6000}
                  aria-label="Increase zone size"
                  className="w-11 h-11 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-40 border border-white/[0.1] flex items-center justify-center text-white"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Corners</div>
                  <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                    {zone.polygon.length} placed · drag numbers or center handle
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="zone-corners-minus"
                    onClick={() => stepCorners(-1)}
                    disabled={zone.polygon.length <= 3}
                    aria-label="Remove corner"
                    className="w-11 h-11 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-40 border border-white/[0.1] flex items-center justify-center text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-bold text-emerald-400 w-6 text-center tabular-nums">
                    {zone.polygon.length}
                  </span>
                  <button
                    type="button"
                    data-testid="zone-corners-plus"
                    onClick={() => stepCorners(1)}
                    disabled={zone.polygon.length >= 12}
                    aria-label="Add corner"
                    className="w-11 h-11 rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-40 border border-white/[0.1] flex items-center justify-center text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="min-h-[42px] rounded-xl bg-[#161B29] hover:bg-[#1F263A] disabled:opacity-40 border border-white/[0.08] text-xs font-bold text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetPolygon}
                  className="min-h-[42px] rounded-xl bg-[#161B29] hover:bg-[#1F263A] border border-white/[0.08] text-xs font-bold text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start again</span>
                </button>
              </div>
            </div>
          )}

          {/* During The Round: Shrinks / Fixed */}
          <div className="pt-3 border-t border-white/[0.08]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  During the round
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {shrinkEnabled ? 'Shrinks' : 'Stays fixed'}
                </div>
                <div className="text-xs text-slate-400 tabular-nums">
                  {shrinkEnabled
                    ? `Every ${shrinkIntervalMin} min · down to ${formatZoneSize(
                        Math.min(finalDiameter, zone.diameterMeters),
                        units
                      )} across`
                    : 'Boundary stays the same size all round'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShrinkOptions((v) => !v)}
                className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-emerald-300 shrink-0"
              >
                {showShrinkOptions ? 'Hide' : 'Change'}
              </button>
            </div>

            {showShrinkOptions && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShrinkEnabled(true)}
                    className={`min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${
                      shrinkEnabled
                        ? 'bg-emerald-500/18 border-emerald-400/60 text-emerald-300'
                        : 'bg-[#08090E] border-white/[0.08] text-slate-400'
                    }`}
                  >
                    Shrinks over time
                  </button>
                  <button
                    type="button"
                    onClick={() => setShrinkEnabled(false)}
                    className={`min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${
                      !shrinkEnabled
                        ? 'bg-emerald-500/18 border-emerald-400/60 text-emerald-300'
                        : 'bg-[#08090E] border-white/[0.08] text-slate-400'
                    }`}
                  >
                    Stays fixed
                  </button>
                </div>

                {shrinkEnabled && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-300 font-medium">
                      Final zone size:{' '}
                      <strong className="font-mono text-amber-300 tabular-nums">
                        {formatZoneSize(Math.min(finalDiameter, zone.diameterMeters), units)}
                      </strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFinalDiameter((d) => Math.max(150, d - 100))}
                        aria-label="Decrease final shrink size"
                        className="w-9 h-9 rounded-lg bg-[#161B29] border border-white/[0.1] flex items-center justify-center text-white"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFinalDiameter((d) => Math.min(Math.max(300, zone.diameterMeters - 100), d + 100))
                        }
                        aria-label="Increase final shrink size"
                        className="w-9 h-9 rounded-lg bg-[#161B29] border border-white/[0.1] flex items-center justify-center text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
