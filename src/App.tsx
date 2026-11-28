import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type {
  BadgeId,
  CareerProfile,
  ChatMessage,
  ChatScope,
  CustomPreset,
  EmergencyAlert,
  GameMode,
  GpsPoint,
  LatLng,
  MapTheme,
  PlayerState,
  RoomSettings,
  RoomState,
  TeamPreference,
} from './types/game';
import {
  computeNextZone,
  haversineMeters,
  isPointInZone,
  roundCoord,
} from './game/geo';
import {
  applyInfectionLastManStanding,
  assignTeams,
  calculateScores,
  canAccessGameWithLocation,
  checkWinCondition,
  createDefaultSettings,
  createPingSnapshots,
  cycleTeamPreference,
  evaluateOobState,
  filterVisibleChatMessages,
  formatRoomCodeInput,
  generateRoomCode,
  isInfectionLastManStanding,
  type LocationAccessStatus,
  mergeRemoteRoomState,
  PLAYER_COLORS,
  processTag,
  shouldShowRoleReveal,
  shouldShowSplashOnLaunch,
  shouldThrottleGpsUpload,
} from './game/rules';
import { createSoloDemoLobby, createSoloDemoRoom, stepSoloBots } from './game/bots';
import {
  deleteCustomPreset,
  loadCareerProfile,
  loadCustomPresets,
  loadLocalRoomSnapshot,
  loadSessionRejoin,
  recordCompletedRound,
  saveCareerProfile,
  saveCustomPreset,
  saveLocalRoomSnapshot,
  saveSessionRejoin,
} from './services/storage';
import { supabaseSync } from './services/supabaseSync';
import {
  acquireWakeLock,
  type FlashColor,
  releaseWakeLock,
  triggerTacticalAlert,
  unlockAudioSession,
} from './services/hardware';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { ActiveGameView } from './components/ActiveGameView';
import { PostRoundView } from './components/PostRoundView';
import { ChatDrawer } from './components/ChatDrawer';
import { QrCodeModal } from './components/QrCodeModal';
import { EmergencyModal } from './components/EmergencyModal';
import { MoreMenuSheet } from './components/MoreMenuSheet';
import { ProfileModal } from './components/ProfileModal';
import { ChangelogModal } from './components/ChangelogModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { RoleRevealOverlay } from './components/RoleRevealOverlay';
import { LocationGateOverlay } from './components/LocationGateOverlay';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [profile, setProfile] = useState<CareerProfile>(() => loadCareerProfile());
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationAccessStatus>('checking');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [splashConfig] = useState(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return shouldShowSplashOnLaunch(search, reduced);
  });
  const [showSplash, setShowSplash] = useState<boolean>(() => splashConfig.show);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() =>
    supabaseSync.getQueueLength()
  );

  // Hardware & UI toggles
  const [stealthHaptic, setStealthHaptic] = useState<boolean>(false);
  const [flashColor, setFlashColor] = useState<FlashColor | null>(null);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [activeRadioOpen, setActiveRadioOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [pocketModeOpen, setPocketModeOpen] = useState(false);
  const [soloSpeed, setSoloSpeed] = useState<1 | 5 | 20>(1);
  const [roundNumber, setRoundNumber] = useState(1);
  const [pendingRoleRevealKey, setPendingRoleRevealKey] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);
  const [newlyUnlockedBadges, setNewlyUnlockedBadges] = useState<BadgeId[]>([]);
  const [initialInviteCode, setInitialInviteCode] = useState<string>('');

  const roomRef = useRef<RoomState | null>(null);
  roomRef.current = room;
  const userPosRef = useRef<LatLng | null>(null);
  userPosRef.current = userPos;
  const geoWatchIdRef = useRef<number | null>(null);
  const initialSessionHandledRef = useRef<boolean>(false);
  const profileRef = useRef<CareerProfile>(profile);
  profileRef.current = profile;
  const stealthRef = useRef<boolean>(stealthHaptic);
  stealthRef.current = stealthHaptic;
  const chatOpenRef = useRef<boolean>(showChatDrawer || activeRadioOpen);
  chatOpenRef.current = showChatDrawer || activeRadioOpen;
  const soloSpeedRef = useRef<1 | 5 | 20>(soloSpeed);
  soloSpeedRef.current = soloSpeed;
  const lastUploadedGpsRef = useRef<GpsPoint | null>(null);
  const gpsPollInFlightRef = useRef<boolean>(false);
  const lastRemoteSyncCheckRef = useRef<number>(0);
  const recordedRoundCodeRef = useRef<string | null>(null);

  const flashVisualEdge = useCallback((color: FlashColor) => {
    setFlashColor(color);
    window.setTimeout(() => {
      setFlashColor((prev) => (prev === color ? null : prev));
    }, 1150);
  }, []);

  const fireAlert = useCallback(
    (type: Parameters<typeof triggerTacticalAlert>[0]) => {
      triggerTacticalAlert(type, stealthRef.current, flashVisualEdge);
    },
    [flashVisualEdge]
  );

  const hasLocationAccess = canAccessGameWithLocation(locationStatus, userPos);

  // Sync body dataset state for testability and PWA clarity
  useEffect(() => {
    const state = showSplash
      ? 'splash'
      : !hasLocationAccess
      ? 'location_required'
      : !room
      ? 'title'
      : room.phase === 'lobby'
      ? 'lobby'
      : room.phase === 'emergency_pause' || room.phase === 'meeting'
      ? 'paused'
      : room.phase === 'ended'
      ? 'gameover'
      : 'playing';
    document.body.dataset.state = state;
  }, [room, hasLocationAccess, showSplash]);

  // Unlock iOS AudioSession on first interaction
  useEffect(() => {
    const onFirstTap = () => {
      unlockAudioSession();
      window.removeEventListener('pointerdown', onFirstTap);
      window.removeEventListener('keydown', onFirstTap);
    };
    window.addEventListener('pointerdown', onFirstTap, { passive: true });
    window.addEventListener('keydown', onFirstTap, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstTap);
      window.removeEventListener('keydown', onFirstTap);
    };
  }, []);

  // Online / Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void supabaseSync.flushQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Helper to commit room state locally & persist to Supabase when multiplayer
  const commitRoom = useCallback((next: RoomState, persistRemote = true) => {
    roomRef.current = next;
    setRoom(next);
    saveLocalRoomSnapshot(next);
    if (persistRemote && !next.isSoloDemo) {
      void supabaseSync.persistRoom(next);
    }
  }, []);

  // Subscribe to Supabase Realtime Broadcast channel when entering a multiplayer room
  const connectRoomChannel = useCallback(
    (code: string) => {
      supabaseSync.subscribeRoom(code, {
        onQueueCountChange: (count) => setOfflineQueueCount(count),
        onRoomUpdate: (remoteRoom) => {
          setRoom((prev) => {
            const merged = mergeRemoteRoomState(prev, remoteRoom);
            if (
              prev?.phase === 'lobby' &&
              (merged.phase === 'head_start' || merged.phase === 'hunt')
            ) {
              const me = merged.players.find((p) => p.id === profileRef.current.playerId);
              if (shouldShowRoleReveal(me)) {
                setPendingRoleRevealKey(`${merged.code}_${merged.roundStartedAt ?? Date.now()}`);
              }
              // Force-broadcast fresh GPS immediately on round start
              const livePos = userPosRef.current;
              if (livePos && !merged.isSoloDemo) {
                const pt: GpsPoint = {
                  lat: roundCoord(livePos.lat),
                  lng: roundCoord(livePos.lng),
                  ts: Date.now(),
                };
                lastUploadedGpsRef.current = pt;
                void supabaseSync.sendGpsDelta(merged.code, profileRef.current.playerId, pt);
              }
            }
            if (merged.lastManStandingActive && !prev?.lastManStandingActive) {
              fireAlert('last_man_standing');
            } else if (
              merged.phase === 'hunt' &&
              typeof merged.lastPingAt === 'number' &&
              (prev?.lastPingAt === null || prev?.lastPingAt === undefined || merged.lastPingAt > prev.lastPingAt)
            ) {
              const me = merged.players.find((p) => p.id === profileRef.current.playerId);
              if (me && (me.role === 'hunter' || me.role === 'spectator')) {
                fireAlert('radar_ping');
              }
            }
            saveLocalRoomSnapshot(merged);
            return merged;
          });
        },
        onPingBatch: (batch) => {
          setRoom((prev) => {
            if (!prev || prev.code !== code) return prev;
            if (prev.lastPingAt && batch.lastPingAt <= prev.lastPingAt) return prev;
            const me = prev.players.find((p) => p.id === profileRef.current.playerId);
            if (me && (me.role === 'hunter' || me.role === 'spectator')) {
              fireAlert('radar_ping');
            }
            const next: RoomState = {
              ...prev,
              pings: batch.pings,
              lastPingAt: batch.lastPingAt,
              nextPingAt: batch.nextPingAt,
              updatedAt: Math.max(prev.updatedAt, batch.lastPingAt),
            };
            saveLocalRoomSnapshot(next);
            return next;
          });
        },
        onGpsDelta: (delta) => {
          setRoom((prev) => {
            if (!prev || prev.code !== code) return prev;
            const players = prev.players.map((p) => {
              if (p.id !== delta.playerId) return p;
              // Never overwrite a newer GPS fix with an older out-of-order packet
              if (p.lastPos && delta.ts < p.lastPos.ts) return p;
              const nextPt: GpsPoint = { lat: delta.lat, lng: delta.lng, ts: delta.ts };
              const outside = !isPointInZone(nextPt, prev.currentZone);
              const oobStartedAt =
                prev.phase === 'hunt' && p.role === 'runner' && outside
                  ? p.oobStartedAt ?? delta.ts
                  : null;
              const oobEval = evaluateOobState(outside && prev.phase === 'hunt', oobStartedAt, delta.ts);
              const lastTrail = p.trail[p.trail.length - 1];
              const append =
                !lastTrail || haversineMeters(lastTrail, nextPt) >= 3 || delta.ts - lastTrail.ts >= 6_000;
              return {
                ...p,
                lastPos: nextPt,
                trail: append ? [...p.trail.slice(-500), nextPt] : p.trail,
                oobStartedAt,
                oobStatus: oobEval.status,
                lastSeenAt: delta.ts,
                connected: true,
              };
            });
            return { ...prev, players };
          });
        },
        onTagSignal: (sig) => {
          setRoom((prev) => {
            if (!prev) return prev;
            // Deduplicate if tag already applied via room_state broadcast
            const alreadyApplied = prev.tags.some(
              (t) => t.taggedId === sig.taggedId && Math.abs(t.ts - sig.ts) < 5000
            );
            if (alreadyApplied) return prev;
            const wasLms = !!prev.lastManStandingActive;
            const updated = processTag(prev, sig.taggedId, sig.taggerId, sig.reason, sig.ts);
            if (updated === prev) return prev;
            fireAlert(updated.lastManStandingActive && !wasLms ? 'last_man_standing' : 'tagged');
            saveLocalRoomSnapshot(updated);
            return updated;
          });
        },
        onEmergencySignal: (alert) => {
          setRoom((prev) => {
            if (!prev) return prev;
            if (alert && alert.active) {
              fireAlert('emergency');
              return {
                ...prev,
                phaseBeforePause:
                  prev.phase === 'emergency_pause' ? prev.phaseBeforePause : prev.phase,
                phase: 'emergency_pause',
                pausedAt: Date.now(),
                emergency: alert,
                updatedAt: Date.now(),
              };
            }
            // Clear emergency and shift all scheduled timers cleanly by pausedDuration
            const pausedDuration = prev.pausedAt ? Date.now() - prev.pausedAt : 0;
            return {
              ...prev,
              phase: prev.phaseBeforePause ?? 'hunt',
              pausedAt: null,
              roundEndsAt: prev.roundEndsAt ? prev.roundEndsAt + pausedDuration : null,
              headStartEndsAt: prev.headStartEndsAt ? prev.headStartEndsAt + pausedDuration : null,
              nextPingAt: prev.nextPingAt ? prev.nextPingAt + pausedDuration : null,
              nextZoneTransitionAt: prev.nextZoneTransitionAt
                ? prev.nextZoneTransitionAt + pausedDuration
                : null,
              emergency: null,
              updatedAt: Date.now(),
            };
          });
        },
        onChatMessage: (message: ChatMessage) => {
          const current = roomRef.current;
          if (!current) return;
          const me = current.players.find((p) => p.id === profileRef.current.playerId);
          setRoom((prev) => {
            if (!prev) return prev;
            const existing = prev.chatMessages ?? [];
            if (existing.some((m) => m.id === message.id)) return prev;
            const updated: RoomState = {
              ...prev,
              chatMessages: [...existing.slice(-99), message],
            };
            saveLocalRoomSnapshot(updated);
            return updated;
          });
          // Notify only if visible to viewer and not sent by self
          const isVisible =
            message.scope === 'global' ||
            current.phase === 'lobby' ||
            current.phase === 'ended' ||
            (me && message.team === me.role);
          if (isVisible && message.senderId !== profileRef.current.playerId) {
            fireAlert('radio_rx');
            if (!chatOpenRef.current) {
              setUnreadChatCount((c) => c + 1);
            }
          }
        },
        onMeetingVote: ({ voterId, targetId }) => {
          setRoom((prev) => {
            if (!prev || !prev.meeting?.active) return prev;
            return {
              ...prev,
              meeting: {
                ...prev.meeting,
                votes: { ...prev.meeting.votes, [voterId]: targetId },
              },
              updatedAt: Date.now(),
            };
          });
        },
      });
    },
    [fireAlert]
  );

  // Parse ?code= invite link immediately so Join tab is pre-filled once GPS unlocks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code')?.trim().toUpperCase() ?? '';
    if (codeParam.length === 6) {
      setInitialInviteCode(codeParam);
    }
  }, []);

  // Mandatory real GPS acquisition on launch + continuous live tracking (never falls back to San Francisco)
  const requestLocationAccess = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setUserPos(null);
      setLocationStatus('unavailable');
      setLocationError('This browser does not support GPS location services.');
      return;
    }

    if (!userPosRef.current) {
      setLocationStatus('checking');
    }
    setLocationError(null);

    const applyGpsFix = (pos: GeolocationPosition, forceBroadcast = false) => {
      const ts = Date.now();
      const pt: GpsPoint = {
        lat: roundCoord(pos.coords.latitude),
        lng: roundCoord(pos.coords.longitude),
        ts,
      };
      setUserPos({ lat: pt.lat, lng: pt.lng });
      if (typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)) {
        setGpsAccuracyMeters(pos.coords.accuracy);
      }
      setLocationStatus('granted');
      setLocationError(null);

      const cur = roomRef.current;
      if (!cur) return;

      // Update local player GPS & local OOB check immediately
      setRoom((prev) => {
        if (!prev) return prev;
        const myId = profileRef.current.playerId;
        const players = prev.players.map((p) => {
          if (p.id !== myId) return p;
          const outside =
            prev.phase === 'hunt' && p.role === 'runner' && !isPointInZone(pt, prev.currentZone);
          const oobStartedAt = outside ? p.oobStartedAt ?? ts : null;
          const oobEval = evaluateOobState(outside, oobStartedAt, ts);
          const lastTrail = p.trail[p.trail.length - 1];
          const append =
            !lastTrail || haversineMeters(lastTrail, pt) >= 3 || ts - lastTrail.ts >= 6_000;
          return {
            ...p,
            lastPos: pt,
            trail: append ? [...p.trail.slice(-600), pt] : p.trail,
            oobStartedAt,
            oobStatus: oobEval.status,
            lastSeenAt: ts,
            connected: true,
          };
        });

        return { ...prev, players };
      });

      // High-frequency live GPS broadcast (force immediately right before pings or during LMS)
      const pingImminent =
        cur.phase === 'hunt' &&
        typeof cur.nextPingAt === 'number' &&
        cur.nextPingAt - ts <= 3500 &&
        cur.nextPingAt - ts >= -1500;
      const urgentUpload = forceBroadcast || pingImminent || isInfectionLastManStanding(cur);

      if (!cur.isSoloDemo && shouldThrottleGpsUpload(lastUploadedGpsRef.current, pt, urgentUpload)) {
        lastUploadedGpsRef.current = pt;
        void supabaseSync.sendGpsDelta(cur.code, profileRef.current.playerId, pt);
      }
    };

    const handleGpsError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        if (geoWatchIdRef.current !== null) {
          navigator.geolocation.clearWatch(geoWatchIdRef.current);
          geoWatchIdRef.current = null;
        }
        setUserPos(null);
        setLocationStatus('denied');
        setLocationError(
          'Location permission is blocked. Allow location access in your browser or device settings to play.'
        );
      } else if (!userPosRef.current) {
        setLocationStatus('unavailable');
        setLocationError(
          err.code === err.TIMEOUT
            ? 'GPS request timed out. Move to an area with clearer signal and try again.'
            : 'Unable to determine your GPS location. Ensure Location Services are enabled and try again.'
        );
      }
    };

    // Prompt for location access immediately with maximum accuracy & zero cached staleness
    navigator.geolocation.getCurrentPosition(
      (pos) => applyGpsFix(pos, true),
      handleGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
    }
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyGpsFix(pos, false),
      handleGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, []);

  // Ask for location directly on launch and react to live browser permission changes
  useEffect(() => {
    requestLocationAccess();

    let permStatus: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (!permStatus) return;
      if (permStatus.state === 'denied') {
        if (geoWatchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(geoWatchIdRef.current);
          geoWatchIdRef.current = null;
        }
        setUserPos(null);
        setLocationStatus('denied');
        setLocationError(
          'Location permission is blocked. Allow location access in your browser or device settings to play.'
        );
      } else if (permStatus.state === 'granted') {
        requestLocationAccess();
      }
    };

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          permStatus = status;
          if (status.state === 'denied') {
            setUserPos(null);
            setLocationStatus('denied');
            setLocationError(
              'Location permission is blocked. Allow location access in your browser or device settings to play.'
            );
          }
          status.addEventListener('change', handlePermChange);
        })
        .catch(() => {
          // Safari / browsers without Permissions API for geolocation rely on getCurrentPosition
        });
    }

    return () => {
      if (geoWatchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      if (permStatus) {
        permStatus.removeEventListener('change', handlePermChange);
      }
    };
  }, [requestLocationAccess]);

  // Run ?autostart=1 or seamless session rejoin ONLY after real GPS access is granted
  useEffect(() => {
    if (!hasLocationAccess || !userPos || initialSessionHandledRef.current) return;
    initialSessionHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const autoStart = params.get('autostart') === '1';

    if (autoStart) {
      const demo = createSoloDemoRoom(
        profileRef.current.playerId,
        profileRef.current.name || 'Field Agent',
        userPos,
        'hunter',
        'classic',
        Date.now()
      );
      const startedDemo: RoomState = {
        ...demo,
        phase: 'hunt',
        headStartEndsAt: Date.now() - 1000,
      };
      recordedRoundCodeRef.current = null;
      setRoom(startedDemo);
      saveLocalRoomSnapshot(startedDemo);
      return;
    }

    const savedSession = loadSessionRejoin();
    if (savedSession && savedSession.roomCode) {
      if (savedSession.isSoloDemo) {
        const cached = loadLocalRoomSnapshot(savedSession.roomCode);
        if (cached) {
          setRoom(cached);
          return;
        }
      } else {
        const cached = loadLocalRoomSnapshot(savedSession.roomCode);
        if (cached) {
          setRoom(cached);
          connectRoomChannel(cached.code);
        }
        void supabaseSync.fetchRoom(savedSession.roomCode).then((remote) => {
          if (remote) {
            setRoom(remote);
            saveLocalRoomSnapshot(remote);
            connectRoomChannel(remote.code);
          }
        });
      }
    }
  }, [hasLocationAccess, userPos, connectRoomChannel]);

  // Force full room state sync, fresh GPS broadcast, & reacquire Wake Lock on visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLocationAccess();
        const cur = roomRef.current;
        if (cur && !cur.isSoloDemo) {
          void supabaseSync.flushQueue();
          void supabaseSync.fetchRoom(cur.code).then((remote) => {
            if (remote) {
              setRoom((prev) => {
                const merged = mergeRemoteRoomState(prev, remote);
                saveLocalRoomSnapshot(merged);
                return merged;
              });
            }
          });
        }
        if (cur && (cur.phase === 'head_start' || cur.phase === 'hunt')) {
          void acquireWakeLock();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [requestLocationAccess]);

  // Active high-frequency GPS refresh poller (every 2s during active rooms so mobile OS never stalls watchPosition)
  const isInActiveRoom = !!room && room.phase !== 'ended';
  useEffect(() => {
    if (!hasLocationAccess || !isInActiveRoom) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const pollId = window.setInterval(() => {
      if (gpsPollInFlightRef.current) return;
      const cur = roomRef.current;
      if (!cur || cur.phase === 'ended') return;

      gpsPollInFlightRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsPollInFlightRef.current = false;
          const ts = Date.now();
          const pt: GpsPoint = {
            lat: roundCoord(pos.coords.latitude),
            lng: roundCoord(pos.coords.longitude),
            ts,
          };
          setUserPos({ lat: pt.lat, lng: pt.lng });
          if (typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)) {
            setGpsAccuracyMeters(pos.coords.accuracy);
          }

          const latestRoom = roomRef.current;
          if (!latestRoom) return;

          setRoom((prev) => {
            if (!prev) return prev;
            const myId = profileRef.current.playerId;
            const players = prev.players.map((p) => {
              if (p.id !== myId) return p;
              const outside =
                prev.phase === 'hunt' &&
                p.role === 'runner' &&
                !isPointInZone(pt, prev.currentZone);
              const oobStartedAt = outside ? p.oobStartedAt ?? ts : null;
              const oobEval = evaluateOobState(outside, oobStartedAt, ts);
              const lastTrail = p.trail[p.trail.length - 1];
              const append =
                !lastTrail || haversineMeters(lastTrail, pt) >= 3 || ts - lastTrail.ts >= 6_000;
              return {
                ...p,
                lastPos: pt,
                trail: append ? [...p.trail.slice(-600), pt] : p.trail,
                oobStartedAt,
                oobStatus: oobEval.status,
                lastSeenAt: ts,
                connected: true,
              };
            });
            return { ...prev, players };
          });

          const pingImminent =
            latestRoom.phase === 'hunt' &&
            typeof latestRoom.nextPingAt === 'number' &&
            latestRoom.nextPingAt - ts <= 3500 &&
            latestRoom.nextPingAt - ts >= -1500;
          const forcePush = pingImminent || isInfectionLastManStanding(latestRoom);

          if (
            !latestRoom.isSoloDemo &&
            shouldThrottleGpsUpload(lastUploadedGpsRef.current, pt, forcePush)
          ) {
            lastUploadedGpsRef.current = pt;
            void supabaseSync.sendGpsDelta(latestRoom.code, profileRef.current.playerId, pt);
          }
        },
        () => {
          gpsPollInFlightRef.current = false;
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 7000,
        }
      );
    }, 2000);

    return () => {
      window.clearInterval(pollId);
      gpsPollInFlightRef.current = false;
    };
  }, [hasLocationAccess, isInActiveRoom]);

  // Manage Screen Wake Lock during active rounds
  const isRoundActive = !!room && (room.phase === 'head_start' || room.phase === 'hunt');
  useEffect(() => {
    if (isRoundActive) {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }
    return () => {
      void releaseWakeLock();
    };
  }, [isRoundActive]);

  // Local 1-second Rule Execution Engine (Timers, Synced Pings, Zone Shrink/Curfew, OOB 30s Auto-Elimination, LMS, Solo Bots)
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);

      const cur = roomRef.current;
      if (!cur) return;
      if (cur.phase === 'lobby' || cur.phase === 'ended' || cur.phase === 'emergency_pause') return;

      let next = cur;
      let changed = false;
      let meetingResolved = false;
      let pingFired = false;
      let zoneShrunk = false;
      let lmsJustTriggered = false;
      const isHost = cur.hostId === profileRef.current.playerId;

      // 1. Auto-resolve Imposter meeting when discussion timer hits 0
      if (next.phase === 'meeting' && next.meeting?.active && now >= next.meeting.endsAt) {
        if (isHost || next.isSoloDemo) {
          next = resolveImposterMeetingState(next, now);
          meetingResolved = true;
          changed = true;
        }
      }

      // 1b. Apply Solo Practice speed multiplier (5x / 20x) by accelerating scheduled timestamps
      const speedMult = next.isSoloDemo ? soloSpeedRef.current : 1;
      if (next.isSoloDemo && speedMult > 1 && (next.phase === 'head_start' || next.phase === 'hunt')) {
        const extraShiftMs = (speedMult - 1) * 1000;
        next = {
          ...next,
          headStartEndsAt: next.headStartEndsAt ? next.headStartEndsAt - extraShiftMs : null,
          roundEndsAt: next.roundEndsAt ? next.roundEndsAt - extraShiftMs : null,
          nextPingAt: next.nextPingAt ? next.nextPingAt - extraShiftMs : null,
          nextZoneTransitionAt: next.nextZoneTransitionAt
            ? next.nextZoneTransitionAt - extraShiftMs
            : null,
        };
        changed = true;
      }

      // 2. Head Start -> Hunt transition
      if (next.phase === 'head_start' && next.headStartEndsAt && now >= next.headStartEndsAt) {
        next = {
          ...next,
          phase: 'hunt',
          updatedAt: now,
        };
        // Also check immediate LMS (e.g., 2-player Infection round starting with 1 Runner)
        const lmsRes = applyInfectionLastManStanding(next, now);
        if (lmsRes.justTriggered) {
          next = lmsRes.room;
          lmsJustTriggered = true;
          fireAlert('last_man_standing');
        } else {
          fireAlert('head_start_end');
        }
        changed = true;
      }

      // 3. Step Solo AI Bots
      if (next.isSoloDemo && (next.phase === 'head_start' || next.phase === 'hunt')) {
        const wasLms = !!next.lastManStandingActive;
        next = stepSoloBots(next, speedMult, now);
        if (next.lastManStandingActive && !wasLms) {
          lmsJustTriggered = true;
          fireAlert('last_man_standing');
        }
        changed = true;
      }

      // 4. Single-Stage Out-of-Bounds Elimination for active Runners (auto-out at 30s, no grace period)
      let oobEliminated = false;
      if (next.phase === 'hunt') {
        for (const p of next.players) {
          if (p.role !== 'runner' || p.eliminated || !p.lastPos) continue;
          const outside = !isPointInZone(p.lastPos, next.currentZone);
          if (outside && !p.oobStartedAt) {
            if (p.id === profileRef.current.playerId) fireAlert('oob_warning');
            next = {
              ...next,
              players: next.players.map((pl) =>
                pl.id === p.id ? { ...pl, oobStartedAt: now, oobStatus: 'warning' } : pl
              ),
            };
            changed = true;
          } else if (outside && p.oobStartedAt) {
            const oob = evaluateOobState(true, p.oobStartedAt, now);
            if (oob.status === 'eliminated') {
              if (isHost || next.isSoloDemo || p.id === profileRef.current.playerId) {
                const wasLms = !!next.lastManStandingActive;
                next = processTag(next, p.id, undefined, 'oob_timeout', now);
                if (!next.isSoloDemo) {
                  void supabaseSync.sendTagSignal(next.code, p.id, undefined, 'oob_timeout', now);
                }
                if (next.lastManStandingActive && !wasLms) {
                  lmsJustTriggered = true;
                  fireAlert('last_man_standing');
                } else {
                  fireAlert('tagged');
                }
                oobEliminated = true;
                changed = true;
              }
            } else if (oob.status !== p.oobStatus) {
              if (p.id === profileRef.current.playerId) fireAlert('oob_warning');
              next = {
                ...next,
                players: next.players.map((pl) =>
                  pl.id === p.id ? { ...pl, oobStatus: oob.status } : pl
                ),
              };
              changed = true;
            }
          }
        }
      }

      // 4b. Safety-net check for Infection Last Man Standing (guarantees LMS activates even across remote joins/syncs)
      if (next.phase === 'hunt' && (isHost || next.isSoloDemo)) {
        const lmsCheck = applyInfectionLastManStanding(next, now);
        if (lmsCheck.justTriggered) {
          next = lmsCheck.room;
          lmsJustTriggered = true;
          fireAlert('last_man_standing');
          changed = true;
        }
      }

      // 5. Scheduled Radar Pings (Authoritative host ping + dedicated ping_batch broadcast to ALL Hunters & Infected)
      if (
        next.phase === 'hunt' &&
        !isInfectionLastManStanding(next) &&
        next.settings.pingIntervalMin > 0 &&
        next.nextPingAt
      ) {
        if ((isHost || next.isSoloDemo) && now >= next.nextPingAt) {
          const snapshots = createPingSnapshots(next, now);
          const upcomingPingAt = now + next.settings.pingIntervalMin * 60_000;
          next = {
            ...next,
            pings: snapshots,
            lastPingAt: now,
            nextPingAt: upcomingPingAt,
            updatedAt: now,
          };
          if (!next.isSoloDemo) {
            void supabaseSync.sendPingBatch(next.code, snapshots, now, upcomingPingAt);
          }
          const viewer = next.players.find((p) => p.id === profileRef.current.playerId);
          if (viewer && (viewer.role === 'hunter' || viewer.role === 'spectator')) {
            fireAlert('radar_ping');
          }
          pingFired = true;
          changed = true;
        } else if (!isHost && !next.isSoloDemo && now > next.nextPingAt + 5500) {
          // Non-host safety net: if scheduled ping is overdue (brief drop or host offline), recover immediately
          if (now - lastRemoteSyncCheckRef.current >= 5000) {
            lastRemoteSyncCheckRef.current = now;
            void supabaseSync.fetchRoom(next.code).then((remote) => {
              if (remote) {
                setRoom((prev) => {
                  const merged = mergeRemoteRoomState(prev, remote);
                  saveLocalRoomSnapshot(merged);
                  return merged;
                });
              }
            });
          }
          // If host has been unreachable >11s past scheduled ping, fire a local ping fallback from latest live runner GPS
          if (now > next.nextPingAt + 11_000) {
            const snapshots = createPingSnapshots(next, now);
            const upcomingPingAt = now + next.settings.pingIntervalMin * 60_000;
            next = {
              ...next,
              pings: snapshots,
              lastPingAt: now,
              nextPingAt: upcomingPingAt,
              updatedAt: now,
            };
            const viewer = next.players.find((p) => p.id === profileRef.current.playerId);
            if (viewer && (viewer.role === 'hunter' || viewer.role === 'spectator')) {
              fireAlert('radar_ping');
            }
            changed = true;
          }
        }
      }

      // 5b. Periodic 10-second multiplayer state reconciliation (recovers any missed broadcast without gaps)
      if (!next.isSoloDemo && !isHost && now - lastRemoteSyncCheckRef.current >= 10_000) {
        lastRemoteSyncCheckRef.current = now;
        void supabaseSync.fetchRoom(next.code).then((remote) => {
          if (remote) {
            setRoom((prev) => {
              const merged = mergeRemoteRoomState(prev, remote);
              saveLocalRoomSnapshot(merged);
              return merged;
            });
          }
        });
      }

      // 6. Scheduled Zone Shrink / Curfew Teleport
      if (
        next.phase === 'hunt' &&
        (isHost || next.isSoloDemo) &&
        next.settings.zoneShrinkEnabled &&
        next.nextZonePreview &&
        next.nextZoneTransitionAt &&
        now >= next.nextZoneTransitionAt
      ) {
        const activatedZone = next.nextZonePreview;
        const canShrinkAgain =
          activatedZone.diameterMeters > next.settings.finalZoneDiameterMeters + 40;
        const upcoming = canShrinkAgain
          ? computeNextZone(
              activatedZone,
              next.settings.finalZoneDiameterMeters,
              next.settings.mode === 'curfew'
            )
          : null;
        const intervalMs = next.isSoloDemo
          ? 50_000
          : Math.max(90_000, Math.round((next.settings.roundLengthMin * 60_000) / 4));

        next = {
          ...next,
          currentZone: activatedZone,
          nextZonePreview: upcoming,
          nextZoneTransitionAt: upcoming ? now + intervalMs : null,
          shrinkStep: next.shrinkStep + 1,
          updatedAt: now,
        };
        fireAlert('zone_shrink');
        zoneShrunk = true;
        changed = true;
      }

      // 7. Round Clock Win Check
      if (next.phase === 'hunt') {
        const win = checkWinCondition(next, now);
        if (win.winner) {
          next = {
            ...next,
            phase: 'ended',
            winner: win.winner,
            winReason: win.reason,
            updatedAt: now,
          };
          fireAlert('victory');
          changed = true;
        }
      }

      if (changed) {
        const shouldPersistRemote =
          !next.isSoloDemo &&
          (oobEliminated ||
            (isHost &&
              (pingFired ||
                zoneShrunk ||
                lmsJustTriggered ||
                meetingResolved ||
                next.phase !== cur.phase)));
        commitRoom(next, shouldPersistRemote);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [commitRoom, fireAlert]);

  // Record Career Stats & Unlock Badges once when round transitions to 'ended'
  const scores = useMemo(() => {
    if (!room) return [];
    return calculateScores(room, nowMs);
  }, [room, nowMs]);

  useEffect(() => {
    if (!room || room.phase !== 'ended') return;
    const roundKey = `${room.code}_${room.roundStartedAt ?? 0}`;
    if (recordedRoundCodeRef.current === roundKey) return;
    recordedRoundCodeRef.current = roundKey;

    const { updatedProfile, newlyUnlocked } = recordCompletedRound(
      profileRef.current,
      room,
      calculateScores(room, room.updatedAt)
    );
    setProfile(updatedProfile);
    setNewlyUnlockedBadges(newlyUnlocked);
  }, [room]);

  // Actions
  const handleUpdateProfile = (patch: Partial<CareerProfile>) => {
    const updated: CareerProfile = { ...profile, ...patch };
    setProfile(updated);
    saveCareerProfile(updated);
  };

  const personalMapTheme: MapTheme = profile.preferredMapTheme ?? room?.settings.mapTheme ?? 'night';

  const handleChangePersonalMapTheme = (theme: MapTheme) => {
    handleUpdateProfile({ preferredMapTheme: theme });
    if (room) {
      const nextSettings = { ...room.settings, mapTheme: theme };
      commitRoom({ ...room, settings: nextSettings, updatedAt: Date.now() }, false);
    }
  };

  const handleHostGame = (mode: GameMode) => {
    if (!userPos) {
      requestLocationAccess();
      return;
    }
    unlockAudioSession();
    const now = Date.now();
    const code = generateRoomCode();
    const settings = createDefaultSettings(userPos);
    settings.mode = mode;
    settings.mapTheme = personalMapTheme;

    const hostPlayer: PlayerState = {
      id: profile.playerId,
      name: profile.name.trim() || 'Host Agent',
      isHost: true,
      preference: 'random',
      role: 'runner',
      eliminated: false,
      tagsCount: 0,
      color: profile.looks?.dotColor || PLAYER_COLORS[0],
      lastPos: { lat: roundCoord(userPos.lat), lng: roundCoord(userPos.lng), ts: now },
      trail: [{ lat: roundCoord(userPos.lat), lng: roundCoord(userPos.lng), ts: now }],
      oobStartedAt: null,
      oobStatus: 'inside',
      connected: true,
      lastSeenAt: now,
    };

    const newRoom: RoomState = {
      code,
      isSoloDemo: false,
      hostId: hostPlayer.id,
      phase: 'lobby',
      settings,
      currentZone: settings.zone,
      nextZonePreview: null,
      nextZoneTransitionAt: null,
      shrinkStep: 0,
      players: [hostPlayer],
      pings: [],
      tags: [],
      chatMessages: [],
      roundStartedAt: null,
      headStartEndsAt: null,
      roundEndsAt: null,
      lastPingAt: null,
      nextPingAt: null,
      pausedAt: null,
      emergency: null,
      meeting: null,
      winner: null,
      updatedAt: now,
    };

    recordedRoundCodeRef.current = null;
    setRoundNumber(1);
    setPendingRoleRevealKey(null);
    setSoloSpeed(1);
    setNewlyUnlockedBadges([]);
    saveSessionRejoin({
      roomCode: code,
      playerId: hostPlayer.id,
      playerName: hostPlayer.name,
      isSoloDemo: false,
    });
    connectRoomChannel(code);
    commitRoom(newRoom, true);
  };

  const handleJoinGame = async (codeInput: string): Promise<string | null> => {
    if (!userPos) {
      requestLocationAccess();
      return 'Location access is required before joining a game.';
    }
    unlockAudioSession();
    const code = codeInput.trim().toUpperCase();
    const now = Date.now();
    const fetched = (await supabaseSync.fetchRoom(code)) ?? loadLocalRoomSnapshot(code);

    if (!fetched) {
      return `Room ${code} was not found. Ask the host to create the lobby first or verify the code.`;
    }

    const myPos: GpsPoint = { lat: roundCoord(userPos.lat), lng: roundCoord(userPos.lng), ts: now };
    const exists = fetched.players.some((p) => p.id === profile.playerId);
    const myPlayer: PlayerState = {
      id: profile.playerId,
      name: profile.name.trim() || `Agent ${profile.playerId.slice(0, 4)}`,
      isHost: fetched.hostId === profile.playerId,
      preference: 'random',
      role: fetched.phase === 'lobby' ? 'runner' : 'spectator',
      eliminated: fetched.phase !== 'lobby',
      tagsCount: 0,
      color: profile.looks?.dotColor || PLAYER_COLORS[fetched.players.length % PLAYER_COLORS.length],
      lastPos: myPos,
      trail: [myPos],
      oobStartedAt: null,
      oobStatus: 'inside',
      connected: true,
      lastSeenAt: now,
    };

    const updatedRoom: RoomState = {
      ...fetched,
      players: exists
        ? fetched.players.map((p) =>
            p.id === profile.playerId
              ? {
                  ...p,
                  name: myPlayer.name,
                  lastPos: myPos,
                  trail: p.trail.length > 0 ? p.trail : [myPos],
                  connected: true,
                  lastSeenAt: now,
                }
              : p
          )
        : [...fetched.players, myPlayer],
      updatedAt: now,
    };

    recordedRoundCodeRef.current = null;
    saveSessionRejoin({
      roomCode: code,
      playerId: profile.playerId,
      playerName: myPlayer.name,
      isSoloDemo: false,
    });
    connectRoomChannel(code);
    commitRoom(updatedRoom, true);
    return null;
  };

  const handleOpenDemoLobby = () => {
    if (!userPos) {
      requestLocationAccess();
      return;
    }
    unlockAudioSession();
    const now = Date.now();
    const demoLobby = createSoloDemoLobby(
      profile.playerId,
      profile.name.trim() || 'Field Agent',
      userPos,
      profile.looks?.dotColor || PLAYER_COLORS[0],
      personalMapTheme,
      now
    );
    recordedRoundCodeRef.current = null;
    setRoundNumber(1);
    setSoloSpeed(1);
    setPocketModeOpen(false);
    setPendingRoleRevealKey(null);
    setNewlyUnlockedBadges([]);
    saveSessionRejoin({
      roomCode: demoLobby.code,
      playerId: profile.playerId,
      playerName: profile.name.trim() || 'Field Agent',
      isSoloDemo: true,
    });
    commitRoom(demoLobby, false);
  };

  const handleChangeRoomCode = (rawCode: string) => {
    if (!room || room.hostId !== profile.playerId) return;
    const cleaned = formatRoomCodeInput(rawCode);
    if (cleaned.length !== 6 || cleaned === room.code) return;
    const updated: RoomState = {
      ...room,
      code: cleaned,
      updatedAt: Date.now(),
    };
    saveSessionRejoin({
      roomCode: cleaned,
      playerId: profile.playerId,
      playerName: profile.name.trim() || 'Host Agent',
      isSoloDemo: room.isSoloDemo,
    });
    if (!room.isSoloDemo) {
      supabaseSync.unsubscribe();
      connectRoomChannel(cleaned);
    }
    commitRoom(updated, !room.isSoloDemo);
  };

  const handleCycleBotPreference = (botId: string) => {
    if (!room || !room.isSoloDemo) return;
    commitRoom(
      {
        ...room,
        players: room.players.map((p) =>
          p.id === botId && p.isBot ? { ...p, preference: cycleTeamPreference(p.preference) } : p
        ),
        updatedAt: Date.now(),
      },
      false
    );
  };

  const handleUpdateSettings = (settings: RoomSettings) => {
    if (!room) return;
    commitRoom(
      {
        ...room,
        settings,
        currentZone: settings.zone,
        updatedAt: Date.now(),
      },
      true
    );
  };

  const handleUpdatePreference = (pref: TeamPreference) => {
    if (!room) return;
    commitRoom(
      {
        ...room,
        players: room.players.map((p) =>
          p.id === profile.playerId ? { ...p, preference: pref } : p
        ),
        updatedAt: Date.now(),
      },
      true
    );
  };

  const handleStartRound = () => {
    if (!room) return;
    unlockAudioSession();
    const now = Date.now();
    const assigned = assignTeams(room.players, room.settings.mode);
    const headStartMs = Math.round(room.settings.headStartMin * 60_000);
    const roundMs = Math.round(room.settings.roundLengthMin * 60_000);
    const pingMs =
      room.settings.pingIntervalMin > 0 ? room.settings.pingIntervalMin * 60_000 : null;

    const preview =
      room.settings.zoneShrinkEnabled && room.settings.zone.shape !== 'off'
        ? computeNextZone(
            room.settings.zone,
            room.settings.finalZoneDiameterMeters,
            room.settings.mode === 'curfew'
          )
        : null;
    const shrinkIntervalMs = Math.max(90_000, Math.round(roundMs / 4));

    const started: RoomState = {
      ...room,
      phase: headStartMs > 0 ? 'head_start' : 'hunt',
      currentZone: room.settings.zone,
      nextZonePreview: preview,
      nextZoneTransitionAt: preview ? now + headStartMs + shrinkIntervalMs : null,
      shrinkStep: 0,
      players: assigned,
      pings: [],
      tags: [],
      roundStartedAt: now,
      headStartEndsAt: now + headStartMs,
      roundEndsAt: now + headStartMs + roundMs,
      lastPingAt: null,
      nextPingAt: pingMs ? now + headStartMs + pingMs : null,
      emergency: null,
      meeting: null,
      winner: null,
      winReason: undefined,
      lastManStandingActive: false,
      lastManStandingTriggeredAt: null,
      updatedAt: now,
    };

    // If starting straight into Hunt with 1 Runner in Infection mode (e.g., 2-player game), activate LMS cleanly
    const lmsStart = applyInfectionLastManStanding(started, now);
    const finalStarted = lmsStart.room;

    recordedRoundCodeRef.current = null;
    setNewlyUnlockedBadges([]);
    setPocketModeOpen(false);
    const myAssigned = assigned.find((p) => p.id === profile.playerId);
    if (shouldShowRoleReveal(myAssigned)) {
      setPendingRoleRevealKey(`${finalStarted.code}_${now}`);
    } else {
      setPendingRoleRevealKey(null);
    }
    fireAlert(lmsStart.justTriggered ? 'last_man_standing' : 'head_start_end');
    commitRoom(finalStarted, true);
  };

  const handleRunnerGotTagged = () => {
    if (!room) return;
    const now = Date.now();
    const wasLms = !!room.lastManStandingActive;
    const updated = processTag(room, profile.playerId, undefined, 'physical', now);
    if (updated === room) return;
    fireAlert(updated.lastManStandingActive && !wasLms ? 'last_man_standing' : 'tagged');
    commitRoom(updated, true);
    if (!room.isSoloDemo) {
      void supabaseSync.sendTagSignal(room.code, profile.playerId, undefined, 'physical', now);
    }
  };

  const handleTagBotInSolo = (botId: string) => {
    if (!room) return;
    const now = Date.now();
    const wasLms = !!room.lastManStandingActive;
    const updated = processTag(room, botId, profile.playerId, 'physical', now);
    if (updated === room) return;
    fireAlert(updated.lastManStandingActive && !wasLms ? 'last_man_standing' : 'tagged');
    commitRoom(updated, false);
  };

  const appendAndBroadcastChat = (message: ChatMessage) => {
    if (!room) return;
    const nextRoom: RoomState = {
      ...room,
      chatMessages: [...(room.chatMessages ?? []).slice(-99), message],
      updatedAt: message.ts,
    };
    commitRoom(nextRoom, false);
    if (!room.isSoloDemo) {
      void supabaseSync.sendChatMessage(message);
    }
  };

  const handleSendTextMessage = (scope: ChatScope, text: string) => {
    if (!room) return;
    const me = room.players.find((p) => p.id === profile.playerId);
    if (!me) return;
    appendAndBroadcastChat({
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      scope,
      team: me.role,
      senderId: me.id,
      senderName: me.name,
      senderColor: me.color,
      kind: 'text',
      text,
      ts: Date.now(),
    });
  };

  const handleOpenChat = () => {
    setShowChatDrawer(true);
    setUnreadChatCount(0);
  };

  const handleTriggerRoomEmergency = (address: string) => {
    if (!room || !userPos) return;
    const now = Date.now();
    const me = room.players.find((p) => p.id === profile.playerId);
    const alert: EmergencyAlert = {
      active: true,
      triggeredById: profile.playerId,
      triggeredByName: me?.name || profile.name || 'Player',
      lat: userPos.lat,
      lng: userPos.lng,
      address,
      triggeredAt: now,
    };
    fireAlert('emergency');
    const paused: RoomState = {
      ...room,
      phaseBeforePause: room.phase === 'emergency_pause' ? room.phaseBeforePause : room.phase,
      phase: 'emergency_pause',
      pausedAt: now,
      emergency: alert,
      updatedAt: now,
    };
    commitRoom(paused, true);
    if (!room.isSoloDemo) {
      void supabaseSync.sendEmergencySignal(room.code, alert);
    }
  };

  const handleResolveEmergency = () => {
    if (!room) return;
    const now = Date.now();
    const pausedMs = room.pausedAt ? now - room.pausedAt : 0;
    const resumed: RoomState = {
      ...room,
      phase: room.phaseBeforePause ?? 'hunt',
      pausedAt: null,
      roundEndsAt: room.roundEndsAt ? room.roundEndsAt + pausedMs : null,
      headStartEndsAt: room.headStartEndsAt ? room.headStartEndsAt + pausedMs : null,
      nextPingAt: room.nextPingAt ? room.nextPingAt + pausedMs : null,
      nextZoneTransitionAt: room.nextZoneTransitionAt
        ? room.nextZoneTransitionAt + pausedMs
        : null,
      emergency: null,
      updatedAt: now,
    };
    commitRoom(resumed, true);
    if (!room.isSoloDemo) {
      void supabaseSync.sendEmergencySignal(room.code, null);
    }
  };

  const handleCallImposterMeeting = () => {
    if (!room || room.settings.mode !== 'imposter') return;
    const now = Date.now();
    const me = room.players.find((p) => p.id === profile.playerId);
    fireAlert('emergency');
    commitRoom(
      {
        ...room,
        phase: 'meeting',
        meeting: {
          active: true,
          calledById: profile.playerId,
          calledByName: me?.name || 'Player',
          startedAt: now,
          endsAt: now + 60_000,
          votes: {},
        },
        updatedAt: now,
      },
      true
    );
  };

  const handleCastMeetingVote = (targetId: string) => {
    if (!room || !room.meeting?.active) return;
    const updated: RoomState = {
      ...room,
      meeting: {
        ...room.meeting,
        votes: { ...room.meeting.votes, [profile.playerId]: targetId },
      },
      updatedAt: Date.now(),
    };
    commitRoom(updated, true);
    if (!room.isSoloDemo) {
      void supabaseSync.sendMeetingVote(profile.playerId, targetId);
    }
  };

  const handleResolveMeeting = () => {
    if (!room) return;
    const resolved = resolveImposterMeetingState(room, Date.now());
    commitRoom(resolved, true);
  };

  const handleRemovePlayer = (playerId: string) => {
    if (!room || room.hostId !== profile.playerId) return;
    const nextPlayers = room.players.filter((p) => p.id !== playerId);
    commitRoom({ ...room, players: nextPlayers, updatedAt: Date.now() }, true);
  };

  const handleEndRoundNow = () => {
    if (!room) return;
    const now = Date.now();
    const activeRunners = room.players.filter((p) => p.role === 'runner' && !p.eliminated).length;
    const ended: RoomState = {
      ...room,
      phase: 'ended',
      winner: activeRunners > 0 ? 'runners' : 'hunters',
      winReason:
        activeRunners > 0
          ? `Round ended by host with ${activeRunners} Runner${activeRunners === 1 ? '' : 's'} remaining.`
          : 'All Runners were tagged!',
      updatedAt: now,
    };
    fireAlert('victory');
    commitRoom(ended, true);
  };

  const handleLeaveGame = () => {
    supabaseSync.unsubscribe();
    saveSessionRejoin(null);
    saveLocalRoomSnapshot(null);
    setRoom(null);
    setShowChatDrawer(false);
    setActiveRadioOpen(false);
    setPocketModeOpen(false);
    setPendingRoleRevealKey(null);
    setSoloSpeed(1);
    setUnreadChatCount(0);
    setShowQrModal(false);
    setShowMoreMenu(false);
  };

  const handlePlayAgain = () => {
    if (!room) return;
    setRoundNumber((n) => n + 1);
    const resetLobby: RoomState = {
      ...room,
      phase: 'lobby',
      currentZone: room.settings.zone,
      nextZonePreview: null,
      nextZoneTransitionAt: null,
      shrinkStep: 0,
      pings: [],
      tags: [],
      roundStartedAt: null,
      headStartEndsAt: null,
      roundEndsAt: null,
      emergency: null,
      meeting: null,
      winner: null,
      winReason: undefined,
      lastManStandingActive: false,
      lastManStandingTriggeredAt: null,
      players: room.players.map((p) => ({
        ...p,
        eliminated: false,
        eliminatedAt: undefined,
        tagsCount: 0,
        oobStartedAt: null,
        oobStatus: 'inside',
        trail: p.lastPos ? [p.lastPos] : [],
      })),
      updatedAt: Date.now(),
    };
    recordedRoundCodeRef.current = null;
    commitRoom(resetLobby, !room.isSoloDemo);
  };

  const handleSaveCustomPreset = (name: string) => {
    if (!room) return;
    const next = saveCustomPreset({
      id: `preset_${Date.now()}`,
      name,
      createdAt: Date.now(),
      settings: structuredClone(room.settings),
    });
    setCustomPresets(next);
  };

  const handleDeleteCustomPreset = (id: string) => {
    setCustomPresets(deleteCustomPreset(id));
  };

  // Solo Practice helper actions
  const handleSoloSkipHeadStart = () => {
    if (!room || !room.isSoloDemo) return;
    const now = Date.now();
    const enteredHunt: RoomState = {
      ...room,
      phase: 'hunt',
      headStartEndsAt: now,
      nextPingAt: now + 15_000,
      updatedAt: now,
    };
    const lmsCheck = applyInfectionLastManStanding(enteredHunt, now);
    fireAlert(lmsCheck.justTriggered ? 'last_man_standing' : 'head_start_end');
    commitRoom(lmsCheck.room, false);
  };

  const handleSoloTriggerPing = () => {
    if (!room || !room.isSoloDemo) return;
    const now = Date.now();
    fireAlert('radar_ping');
    commitRoom(
      {
        ...room,
        pings: createPingSnapshots(room, now),
        lastPingAt: now,
        nextPingAt: now + 60_000,
        updatedAt: now,
      },
      false
    );
  };

  const handleSoloTriggerShrink = () => {
    if (!room || !room.isSoloDemo || !room.nextZonePreview) return;
    const now = Date.now();
    const activated = room.nextZonePreview;
    const upcoming =
      activated.diameterMeters > room.settings.finalZoneDiameterMeters + 40
        ? computeNextZone(
            activated,
            room.settings.finalZoneDiameterMeters,
            room.settings.mode === 'curfew'
          )
        : null;
    fireAlert('zone_shrink');
    commitRoom(
      {
        ...room,
        currentZone: activated,
        nextZonePreview: upcoming,
        shrinkStep: room.shrinkStep + 1,
        updatedAt: now,
      },
      false
    );
  };

  const handleSoloSkipMinute = () => {
    if (!room || !room.isSoloDemo) return;
    const now = Date.now();
    const shiftMs = 60_000;
    const nextHeadStart = room.headStartEndsAt ? room.headStartEndsAt - shiftMs : null;
    const nextPhase =
      room.phase === 'head_start' && nextHeadStart !== null && now >= nextHeadStart
        ? 'hunt'
        : room.phase;
    const shifted: RoomState = {
      ...room,
      phase: nextPhase,
      headStartEndsAt: nextHeadStart,
      roundEndsAt: room.roundEndsAt ? room.roundEndsAt - shiftMs : null,
      nextPingAt: room.nextPingAt ? room.nextPingAt - shiftMs : null,
      nextZoneTransitionAt: room.nextZoneTransitionAt ? room.nextZoneTransitionAt - shiftMs : null,
      updatedAt: now,
    };
    const lmsCheck = applyInfectionLastManStanding(shifted, now);
    if (lmsCheck.justTriggered) {
      fireAlert('last_man_standing');
    } else if (nextPhase !== room.phase) {
      fireAlert('head_start_end');
    }
    const stepped = stepSoloBots(lmsCheck.room, 12, now);
    commitRoom(stepped, false);
  };

  const handleRadioVisibilityChange = useCallback((isOpen: boolean) => {
    setActiveRadioOpen(isOpen);
    if (isOpen) {
      setUnreadChatCount(0);
    }
  }, []);

  const inviteUrl = room
    ? `${window.location.origin}${window.location.pathname}?code=${room.code}`
    : '';

  const viewerPlayer = room?.players.find((p) => p.id === profile.playerId);
  const nearestRunnerBot =
    room && userPos && room.isSoloDemo && (room.phase === 'hunt' || room.phase === 'head_start')
      ? room.players
          .filter((p) => p.isBot && p.role === 'runner' && !p.eliminated && p.lastPos)
          .sort(
            (a, b) =>
              haversineMeters(userPos, a.lastPos!) - haversineMeters(userPos, b.lastPos!)
          )[0]
      : undefined;
  const visibleChatMessages = room
    ? filterVisibleChatMessages(room.chatMessages, viewerPlayer, room.phase)
    : [];
  const latestChatMsg =
    visibleChatMessages.length > 0
      ? visibleChatMessages[visibleChatMessages.length - 1]
      : null;

  return (
    <>
      {!hasLocationAccess || !userPos ? (
        <LocationGateOverlay
          status={locationStatus}
          errorMessage={locationError}
          onRequestLocation={requestLocationAccess}
        />
      ) : (
        <>
          {!room && (
            <HomeView
              profile={profile}
              initialRoomCode={initialInviteCode}
              onUpdateProfile={handleUpdateProfile}
              onHostGame={handleHostGame}
              onJoinGame={handleJoinGame}
              onOpenDemoLobby={handleOpenDemoLobby}
              onOpenChangelog={() => setShowChangelogModal(true)}
              onOpenHowToPlay={() => setShowHowToPlayModal(true)}
              onOpenGetHelp={() => setShowEmergencyModal(true)}
            />
          )}

          {room && room.phase === 'lobby' && (
            <LobbyView
              room={room}
              viewerId={profile.playerId}
              userPos={userPos}
              personalMapTheme={personalMapTheme}
              customPresets={customPresets}
              unreadChatCount={unreadChatCount}
              onUpdateSettings={handleUpdateSettings}
              onChangePersonalMapTheme={handleChangePersonalMapTheme}
              onChangeRoomCode={handleChangeRoomCode}
              onUpdatePreference={handleUpdatePreference}
              onCycleBotPreference={room.isSoloDemo ? handleCycleBotPreference : undefined}
              onSaveCustomPreset={handleSaveCustomPreset}
              onDeleteCustomPreset={handleDeleteCustomPreset}
              onRemovePlayer={handleRemovePlayer}
              onStartRound={handleStartRound}
              onLeaveLobby={handleLeaveGame}
              onShowQr={() => setShowQrModal(true)}
              onOpenChat={handleOpenChat}
              onOpenHowToPlay={() => setShowHowToPlayModal(true)}
              onOpenGetHelp={() => setShowEmergencyModal(true)}
              onOpenMoreMenu={() => setShowMoreMenu(true)}
            />
          )}

          {room &&
            (room.phase === 'head_start' ||
              room.phase === 'hunt' ||
              room.phase === 'emergency_pause' ||
              room.phase === 'meeting') && (
              <ActiveGameView
                room={room}
                viewerId={profile.playerId}
                userPos={userPos}
                personalMapTheme={personalMapTheme}
                nowMs={nowMs}
                isOnline={isOnline}
                offlineQueueCount={offlineQueueCount}
                stealthHaptic={stealthHaptic}
                flashColor={flashColor}
                unreadChatCount={unreadChatCount}
                latestChatMsg={latestChatMsg}
                pocketModeOpen={pocketModeOpen}
                onSetPocketMode={setPocketModeOpen}
                onRadioVisibilityChange={handleRadioVisibilityChange}
                onToggleStealthHaptic={() => setStealthHaptic((v) => !v)}
                onSendText={handleSendTextMessage}
                onOpenMoreMenu={() => setShowMoreMenu(true)}
                onRunnerGotTagged={handleRunnerGotTagged}
                onResolveEmergency={handleResolveEmergency}
                onCallImposterMeeting={handleCallImposterMeeting}
                onCastMeetingVote={handleCastMeetingVote}
                onResolveMeeting={handleResolveMeeting}
              />
            )}

          {/* Full-Screen Tap-to-Reveal Mystery & Role Reveal Overlay (when player picked Random) */}
          {room &&
            pendingRoleRevealKey &&
            (room.phase === 'head_start' || room.phase === 'hunt') && (
              <RoleRevealOverlay
                room={room}
                viewerId={profile.playerId}
                roundNumber={roundNumber}
                stealthHaptic={stealthHaptic}
                onComplete={() => setPendingRoleRevealKey(null)}
              />
            )}

          {room && room.phase === 'ended' && (
            <PostRoundView
              room={room}
              scores={scores}
              personalMapTheme={personalMapTheme}
              newlyUnlockedBadges={newlyUnlockedBadges}
              allProfileBadges={profile.badges}
              onPlayAgain={handlePlayAgain}
              onReturnHome={handleLeaveGame}
              onOpenMoreMenu={() => setShowMoreMenu(true)}
            />
          )}

          {/* Lobby / Post-Round Radio Drawer (Active Game uses the integrated full-screen Radio tab) */}
          {room && (room.phase === 'lobby' || room.phase === 'ended') && (
            <ChatDrawer
              isOpen={showChatDrawer}
              onClose={() => setShowChatDrawer(false)}
              messages={room.chatMessages ?? []}
              viewer={viewerPlayer}
              phase={room.phase}
              onSendText={handleSendTextMessage}
            />
          )}

          {/* Modals & Action Sheets */}
          {showQrModal && room && (
            <QrCodeModal
              roomCode={room.code}
              inviteUrl={inviteUrl}
              onClose={() => setShowQrModal(false)}
            />
          )}

          {showEmergencyModal && (
            <EmergencyModal
              position={userPos}
              accuracyMeters={gpsAccuracyMeters}
              units={room?.settings.units ?? 'mi'}
              inActiveRoom={!!room && room.phase !== 'ended'}
              onTriggerRoomEmergency={handleTriggerRoomEmergency}
              onClose={() => setShowEmergencyModal(false)}
            />
          )}

          {showMoreMenu && room && (
            <MoreMenuSheet
              title={
                room.isSoloDemo
                  ? 'Demo controls'
                  : room.phase === 'lobby'
                  ? 'Lobby menu'
                  : room.phase === 'ended'
                  ? 'Post-round menu'
                  : 'Field controls'
              }
              subtitle={
                room.isSoloDemo
                  ? 'A practice round. The other players are bots.'
                  : `Room ${room.code} · ${room.players.length} players`
              }
              isSoloDemo={room.isSoloDemo}
              isActiveGame={room.phase === 'head_start' || room.phase === 'hunt'}
              isHost={room.hostId === profile.playerId}
              players={room.players}
              viewerId={profile.playerId}
              mapTheme={personalMapTheme}
              stealthHaptic={stealthHaptic}
              canEndRound={room.phase === 'head_start' || room.phase === 'hunt'}
              soloSpeed={soloSpeed}
              nearestBotName={nearestRunnerBot?.name.replace(' (AI)', '')}
              onChangeSoloSpeed={setSoloSpeed}
              onSoloPingNow={handleSoloTriggerPing}
              onSoloTagNearest={
                nearestRunnerBot ? () => handleTagBotInSolo(nearestRunnerBot.id) : undefined
              }
              onSoloSkipMinute={handleSoloSkipMinute}
              onEnablePocketMode={() => setPocketModeOpen(true)}
              onOpenGetHelp={() => setShowEmergencyModal(true)}
              onOpenHowToPlay={() => setShowHowToPlayModal(true)}
              onChangeMapTheme={handleChangePersonalMapTheme}
              onToggleStealthHaptic={() => setStealthHaptic((v) => !v)}
              onRemovePlayer={handleRemovePlayer}
              onEndRound={handleEndRoundNow}
              onLeaveGame={handleLeaveGame}
              onClose={() => setShowMoreMenu(false)}
            />
          )}

          {showProfileModal && (
            <ProfileModal
              profile={profile}
              units={room?.settings.units ?? 'mi'}
              onClose={() => setShowProfileModal(false)}
            />
          )}

          {showChangelogModal && (
            <ChangelogModal onClose={() => setShowChangelogModal(false)} />
          )}

          {showHowToPlayModal && (
            <HowToPlayModal onClose={() => setShowHowToPlayModal(false)} />
          )}
        </>
      )}

      <AnimatePresence>
        {showSplash && (
          <SplashScreen
            key="launch-splash"
            durationMs={splashConfig.durationMs}
            onComplete={() => setShowSplash(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function resolveImposterMeetingState(room: RoomState, nowMs: number): RoomState {
  if (!room.meeting) return { ...room, phase: 'hunt', updatedAt: nowMs };
  const tally = new Map<string, number>();
  Object.values(room.meeting.votes).forEach((target) => {
    tally.set(target, (tally.get(target) ?? 0) + 1);
  });

  let topTarget: string | null = null;
  let topCount = 0;
  let tied = false;

  tally.forEach((count, target) => {
    if (count > topCount) {
      topCount = count;
      topTarget = target;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  });

  let next: RoomState = {
    ...room,
    phase: 'hunt',
    meeting: null,
    updatedAt: nowMs,
  };

  if (topTarget && topTarget !== 'skip' && !tied && topCount > 0) {
    next = processTag(next, topTarget, undefined, 'voted_out', nowMs);
  }
  return next;
}
