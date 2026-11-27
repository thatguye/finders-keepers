import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, MapPin, PhoneCall, Share2, ShieldAlert, X } from 'lucide-react';
import type { LatLng, UnitSystem } from '../types/game';
import { formatAccuracyLabel } from '../game/rules';
import { reverseGeocodeAddress } from '../services/hardware';

interface EmergencyModalProps {
  position: LatLng;
  accuracyMeters?: number | null;
  units?: UnitSystem;
  inActiveRoom: boolean;
  onTriggerRoomEmergency?: (address: string) => void;
  onClose: () => void;
}

const HOLD_MS = 2000;

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  position,
  accuracyMeters = null,
  units = 'mi',
  inActiveRoom,
  onTriggerRoomEmergency,
  onClose,
}) => {
  const [address, setAddress] = useState<string>('Locating street address...');
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [holding, setHolding] = useState(false);
  const [shareDone, setShareDone] = useState(false);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    let active = true;
    void reverseGeocodeAddress(position.lat, position.lng).then((resolved) => {
      if (active) setAddress(resolved);
    });
    return () => {
      active = false;
    };
  }, [position.lat, position.lng]);

  const cancelHold = () => {
    setHolding(false);
    setHoldProgress(0);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startHold = () => {
    if (!inActiveRoom || !onTriggerRoomEmergency) return;
    triggeredRef.current = false;
    setHolding(true);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
      setHoldProgress(pct);
      if (elapsed >= HOLD_MS && !triggeredRef.current) {
        triggeredRef.current = true;
        cancelHold();
        onTriggerRoomEmergency(address);
        onClose();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleShareLocation = async () => {
    const coordsText = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    const mapsUrl = `https://maps.google.com/?q=${position.lat.toFixed(5)},${position.lng.toFixed(5)}`;
    const shareText = `My current location: ${address} (${coordsText}) — ${mapsUrl}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'My GPS Location',
          text: shareText,
          url: mapsUrl,
        });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
      setShareDone(true);
      window.setTimeout(() => setShareDone(false), 2200);
    } catch {
      // user cancelled share
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const accuracyText = formatAccuracyLabel(accuracyMeters, units);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Get Help Emergency Screen"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[#110F15] border-t sm:border border-red-500/35 p-6 pb-safe shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-extrabold text-white leading-none">
                Get help
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Emergency services &amp; live GPS readout
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Get Help screen"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/[0.06] text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* One-tap Emergency Call Button (US 911 primary) */}
        <div className="space-y-2">
          <a
            href="tel:911"
            className="w-full min-h-[56px] px-5 flex items-center justify-between rounded-2xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25 transition-colors"
          >
            <div className="flex items-center gap-3">
              <PhoneCall className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="text-base font-extrabold leading-tight">Call 911</div>
                <div className="text-[11px] text-red-100/85">Emergency services</div>
              </div>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider bg-black/20 px-2.5 py-1 rounded-lg">
              Dial
            </span>
          </a>
          <div className="text-center">
            <a
              href="tel:112"
              className="text-xs font-medium text-slate-400 hover:text-red-200 underline underline-offset-2"
            >
              Outside the US? Call 112
            </a>
          </div>
        </div>

        {/* YOUR LOCATION: Address + Raw Coordinates + Accuracy + Share */}
        <div className="rounded-2xl bg-[#090A10] border border-white/[0.09] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Your location
            </span>
            <span
              data-testid="emergency-gps-accuracy"
              className="text-[11px] font-medium text-emerald-400 tabular-nums"
            >
              {accuracyText}
            </span>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-base font-semibold text-white leading-snug">{address}</div>
          </div>

          <div className="pt-2.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
            <div className="font-mono text-lg font-bold text-amber-300 tabular-nums tracking-tight">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleShareLocation}
            className="w-full min-h-[46px] rounded-xl bg-[#161A27] hover:bg-[#1F2537] border border-white/[0.1] text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-colors"
          >
            {shareDone ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Location Copied / Shared</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Share my location</span>
              </>
            )}
          </button>
        </div>

        {/* 2-Second Hold Emergency Pause */}
        {inActiveRoom && onTriggerRoomEmergency && (
          <div>
            <button
              type="button"
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={(e) => {
                e.preventDefault();
                startHold();
              }}
              onTouchEnd={cancelHold}
              onTouchCancel={cancelHold}
              className="relative overflow-hidden w-full min-h-[54px] rounded-2xl bg-[#2A1418] border-2 border-red-500/70 text-white font-bold text-sm flex items-center justify-center gap-2 select-none"
            >
              <div
                className="absolute inset-y-0 left-0 bg-red-600/80 transition-none"
                style={{ width: `${holdProgress}%` }}
              />
              <span className="relative z-10 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {holding
                  ? `Hold to Pause Game (${Math.ceil(((100 - holdProgress) / 100) * 2)}s)...`
                  : 'Hold 2s: Tell Everyone in the Game'}
              </span>
            </button>
            <p className="mt-2 text-xs text-slate-400 text-center">
              Freezes the round for everyone and pins your live GPS until you tap &quot;I&apos;m OK&quot;.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
