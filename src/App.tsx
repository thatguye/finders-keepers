import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BadgeId,
  CareerProfile,
  CustomPreset,
  EmergencyAlert,
  GameMode,
  GpsPoint,
  LatLng,
  MapTheme,
  PlayerState,
  RadarPing,
  RadioPacket,
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
  assignTeams,
  calculateScores,
  checkWinCondition,
  createDefaultSettings,
  DEFAULT_COORDS,
  evaluateOobState,
  generateRoomCode,
  PLAYER_COLORS,
  processTag,
  shouldThrottleGpsUpload,
} from './game/rules';
import { createSoloDemoRoom, stepSoloBots } from './game/bots';
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
  playRadioBase64,
  releaseWakeLock,
  triggerTacticalAlert,
  unlockAudioSession,
} from './services/hardware';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { ActiveGameView } from './components/ActiveGameView';
import { PostRoundView } from './components/PostRoundView';
import { QrCodeModal } from './components/QrCodeModal';
import { EmergencyModal } from './components/EmergencyModal';
import { MoreMenuSheet } from './components/MoreMenuSheet';
import { ProfileModal } from './components/ProfileModal';
import { ChangelogModal } from './components/ChangelogModal';
import { HowToPlayModal } from './components/HowToPlayModal';

export default function App() {
  const [profile, setProfile] = useState<CareerProfile>(() => loadCareerProfile());
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [userPos, setUserPos] = useState<LatLng>(DEFAULT_COORDS);
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
  const [radioStatusText, setRadioStatusText] = useState<string | null>(null);
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
  const profileRef = useRef<CareerProfile>(profile);
  profileRef.current = profile;
  const stealthRef = useRef<boolean>(stealthHaptic);
  stealthRef.current = stealthHaptic;
  const lastUploadedGpsRef = useRef<GpsPoint | null>(null);
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

  // Sync body dataset state for testability and PWA clarity
  useEffect(() => {
    const state = !room
      ? 'title'
      : room.phase === 'lobby'
      ? 'lobby'
      : room.phase === 'emergency_pause' || room.phase === 'meeting'
      ? 'paused'
      : room.phase === 'ended'
      ? 'gameover'
      : 'playing';
    document.body.dataset.state = state;
  }, [room]);

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
            if (prev && prev.updatedAt > remoteRoom.updatedAt) return prev;
            saveLocalRoomSnapshot(remoteRoom);
            return remoteRoom;
          });
        },
        onGpsDelta: (delta) => {
          setRoom((prev) => {
            if (!prev || prev.code !== code) return prev;
            const players = prev.players.map((p) => {
              if (p.id !== delta.playerId) return p;
              const nextPt: GpsPoint = { lat: delta.lat, lng: delta.lng, ts: delta.ts };
              const outside = !isPointInZone(nextPt, prev.currentZone);
              const oobStartedAt =
                prev.phase === 'hunt' && p.role === 'runner' && outside
                  ? p.oobStartedAt ?? delta.ts
                  : null;
              const oobEval = evaluateOobState(outside && prev.phase === 'hunt', oobStartedAt, delta.ts);
              const lastTrail = p.trail[p.trail.length - 1];
              const append =
                !lastTrail || haversineMeters(lastTrail, nextPt) >= 4 || delta.ts - lastTrail.ts >= 10_000;
              return {
                ...p,
                lastPos: nextPt,
                trail: append ? [...p.trail.slice(-400), nextPt] : p.trail,
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
            const updated = processTag(prev, sig.taggedId, sig.taggerId, sig.reason, sig.ts);
            fireAlert('tagged');
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
            // Clear emergency
            const pausedDuration = prev.pausedAt ? Date.now() - prev.pausedAt : 0;
            return {
              ...prev,
              phase: prev.phaseBeforePause ?? 'hunt',
              pausedAt: null,
              roundEndsAt: prev.roundEndsAt ? prev.roundEndsAt + pausedDuration : null,
              headStartEndsAt: prev.headStartEndsAt ? prev.headStartEndsAt + pausedDuration : null,
              emergency: null,
              updatedAt: Date.now(),
            };
          });
        },
        onRadioPacket: (packet: RadioPacket) => {
          const current = roomRef.current;
          if (!current) return;
          const me = current.players.find((p) => p.id === profileRef.current.playerId);
          // Strict team-only walkie-talkie isolation!
          if (!me || me.role !== packet.team || packet.senderId === me.id) return;
          fireAlert('radio_rx');
          playRadioBase64(packet.audioBase64, packet.mimeType);
          setRadioStatusText(
            `${packet.senderName} (${packet.team === 'hunter' ? 'Hunters' : 'Runners'} Radio)`
          );
          window.setTimeout(() => setRadioStatusText(null), Math.max(2500, packet.durationSec * 1000 + 800));
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

  // Handle initial URL query params (?code=XXXXXX or ?autostart=1) and sessionStorage rejoin
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code')?.trim().toUpperCase() ?? '';
    const autoStart = params.get('autostart') === '1';

    if (autoStart) {
      const demo = createSoloDemoRoom(
        profileRef.current.playerId,
        profileRef.current.name || 'Field Agent',
        DEFAULT_COORDS,
        'hunter',
        'classic',
        Date.now()
      );
      // Skip directly into active Hunt phase on autostart for instant map verification
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

    if (codeParam.length === 6) {
      setInitialInviteCode(codeParam);
    }

    // Attempt seamless session rejoin on page refresh or app switch
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
  }, [connectRoomChannel]);

  // Force full room state sync & reacquire Wake Lock on document.visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const cur = roomRef.current;
        if (cur && !cur.isSoloDemo) {
          void supabaseSync.flushQueue();
          void supabaseSync.fetchRoom(cur.code).then((remote) => {
            if (remote && remote.updatedAt >= cur.updatedAt) {
              setRoom(remote);
              saveLocalRoomSnapshot(remote);
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
  }, []);

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

  // Live GPS WatchPosition with smart 4s moving / 12s stationary cellular throttling
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const ts = Date.now();
        const pt: GpsPoint = {
          lat: roundCoord(pos.coords.latitude),
          lng: roundCoord(pos.coords.longitude),
          ts,
        };
        setUserPos({ lat: pt.lat, lng: pt.lng });

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
              !lastTrail || haversineMeters(lastTrail, pt) >= 5 || ts - lastTrail.ts >= 10_000;
            return {
              ...p,
              lastPos: pt,
              trail: append ? [...p.trail.slice(-500), pt] : p.trail,
              oobStartedAt,
              oobStatus: oobEval.status,
              lastSeenAt: ts,
            };
          });
          return { ...prev, players };
        });

        // Smart cellular throttle for outgoing GPS broadcast
        if (!cur.isSoloDemo && shouldThrottleGpsUpload(lastUploadedGpsRef.current, pt)) {
          lastUploadedGpsRef.current = pt;
          void supabaseSync.sendGpsDelta(cur.code, profileRef.current.playerId, pt);
        }
      },
      () => {
        // GPS denied or unavailable in simulator/desktop — smoothly keep DEFAULT_COORDS fallback
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Local 1-second Rule Execution Engine (Timers, Pings, Zone Shrink/Curfew, OOB 2m Auto-Elimination, Solo Bots)
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);

      const cur = roomRef.current;
      if (!cur) return;
      if (cur.phase === 'lobby' || cur.phase === 'ended' || cur.phase === 'emergency_pause') return;

      let next = cur;
      let changed = false;
      const isHost = cur.hostId === profileRef.current.playerId;

      // 1. Auto-resolve Imposter meeting when discussion timer hits 0
      if (next.phase === 'meeting' && next.meeting?.active && now >= next.meeting.endsAt) {
        if (isHost || next.isSoloDemo) {
          next = resolveImposterMeetingState(next, now);
          changed = true;
        }
      }

      // 2. Head Start -> Hunt transition
      if (next.phase === 'head_start' && next.headStartEndsAt && now >= next.headStartEndsAt) {
        next = {
          ...next,
          phase: 'hunt',
          updatedAt: now,
        };
        fireAlert('head_start_end');
        changed = true;
      }

      // 3. Step Solo AI Bots
      if (next.isSoloDemo && (next.phase === 'head_start' || next.phase === 'hunt')) {
        next = stepSoloBots(next, 1, now);
        changed = true;
      }

      // 4. Local Two-Stage Out-of-Bounds Evaluation for active Runners
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
                next = processTag(next, p.id, undefined, 'oob_timeout', now);
                fireAlert('tagged');
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

      // 5. Scheduled Radar Pings (Host or Solo executes authoritative ping snapshot)
      if (
        next.phase === 'hunt' &&
        (isHost || next.isSoloDemo) &&
        next.settings.pingIntervalMin > 0 &&
        next.nextPingAt &&
        now >= next.nextPingAt
      ) {
        const snapshots = createPingSnapshots(next, now);
        next = {
          ...next,
          pings: snapshots,
          lastPingAt: now,
          nextPingAt: now + next.settings.pingIntervalMin * 60_000,
          updatedAt: now,
        };
        fireAlert('radar_ping');
        changed = true;
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
        commitRoom(next, isHost && !next.isSoloDemo && next.phase !== cur.phase);
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
  const handleUpdateName = (name: string) => {
    const updated = { ...profile, name };
    setProfile(updated);
    saveCareerProfile(updated);
  };

  const handleHostGame = (mode: GameMode) => {
    unlockAudioSession();
    const now = Date.now();
    const code = generateRoomCode();
    const settings = createDefaultSettings(userPos);
    settings.mode = mode;

    const hostPlayer: PlayerState = {
      id: profile.playerId,
      name: profile.name.trim() || 'Host Agent',
      isHost: true,
      preference: 'random',
      role: 'runner',
      eliminated: false,
      tagsCount: 0,
      color: PLAYER_COLORS[0],
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
    unlockAudioSession();
    const code = codeInput.trim().toUpperCase();
    const now = Date.now();
    const fetched = (await supabaseSync.fetchRoom(code)) ?? loadLocalRoomSnapshot(code);

    if (!fetched) {
      return `Room ${code} was not found. Ask the host to create the lobby first or verify the code.`;
    }

    const exists = fetched.players.some((p) => p.id === profile.playerId);
    const myPlayer: PlayerState = {
      id: profile.playerId,
      name: profile.name.trim() || `Agent ${profile.playerId.slice(0, 4)}`,
      isHost: fetched.hostId === profile.playerId,
      preference: 'random',
      role: fetched.phase === 'lobby' ? 'runner' : 'spectator',
      eliminated: fetched.phase !== 'lobby',
      tagsCount: 0,
      color: PLAYER_COLORS[fetched.players.length % PLAYER_COLORS.length],
      lastPos: { lat: roundCoord(userPos.lat), lng: roundCoord(userPos.lng), ts: now },
      trail: [{ lat: roundCoord(userPos.lat), lng: roundCoord(userPos.lng), ts: now }],
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
              ? { ...p, name: myPlayer.name, connected: true, lastSeenAt: now }
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

  const handleStartSoloDemo = (role: 'hunter' | 'runner', mode: GameMode) => {
    unlockAudioSession();
    const demo = createSoloDemoRoom(
      profile.playerId,
      profile.name.trim() || 'Field Agent',
      userPos,
      role,
      mode,
      Date.now()
    );
    recordedRoundCodeRef.current = null;
    setNewlyUnlockedBadges([]);
    saveSessionRejoin({
      roomCode: demo.code,
      playerId: profile.playerId,
      playerName: profile.name.trim() || 'Field Agent',
      isSoloDemo: true,
    });
    commitRoom(demo, false);
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
      updatedAt: now,
    };

    recordedRoundCodeRef.current = null;
    setNewlyUnlockedBadges([]);
    fireAlert('head_start_end');
    commitRoom(started, true);
  };

  const handleRunnerGotTagged = () => {
    if (!room) return;
    const now = Date.now();
    const updated = processTag(room, profile.playerId, undefined, 'physical', now);
    fireAlert('tagged');
    commitRoom(updated, true);
    if (!room.isSoloDemo) {
      void supabaseSync.sendTagSignal(room.code, profile.playerId, undefined, 'physical', now);
    }
  };

  const handleTagBotInSolo = (botId: string) => {
    if (!room) return;
    const now = Date.now();
    const updated = processTag(room, botId, profile.playerId, 'physical', now);
    fireAlert('tagged');
    commitRoom(updated, false);
  };

  const handleSendRadioClip = (audioBase64: string, mimeType: string, durationSec: number) => {
    if (!room) return;
    const me = room.players.find((p) => p.id === profile.playerId);
    if (!me || (me.role !== 'hunter' && me.role !== 'runner')) return;

    const packet: RadioPacket = {
      id: `rad_${Date.now()}`,
      senderId: me.id,
      senderName: me.name,
      team: me.role,
      audioBase64,
      mimeType,
      durationSec,
      ts: Date.now(),
    };
    setRadioStatusText(
      `Sent to ${me.role === 'hunter' ? 'Hunters' : 'Runners'} Radio (${durationSec.toFixed(1)}s)`
    );
    window.setTimeout(() => setRadioStatusText(null), 2200);
    if (!room.isSoloDemo) {
      void supabaseSync.sendRadioPacket(packet);
    }
  };

  const handleTriggerRoomEmergency = (address: string) => {
    if (!room) return;
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
    setShowQrModal(false);
    setShowMoreMenu(false);
  };

  const handlePlayAgain = () => {
    if (!room) return;
    if (room.isSoloDemo) {
      const me = room.players.find((p) => p.id === profile.playerId);
      const rolePref = me?.initialRole === 'runner' ? 'runner' : 'hunter';
      handleStartSoloDemo(rolePref, room.settings.mode);
      return;
    }
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
    commitRoom(resetLobby, true);
  };

  const handleChangeMapTheme = (theme: MapTheme) => {
    if (!room) return;
    const nextSettings = { ...room.settings, mapTheme: theme };
    commitRoom({ ...room, settings: nextSettings, updatedAt: Date.now() }, room.hostId === profile.playerId);
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
    fireAlert('head_start_end');
    commitRoom(
      {
        ...room,
        phase: 'hunt',
        headStartEndsAt: now,
        nextPingAt: now + 15_000,
        updatedAt: now,
      },
      false
    );
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

  const inviteUrl = room
    ? `${window.location.origin}${window.location.pathname}?code=${room.code}`
    : '';

  return (
    <>
      {!room && (
        <HomeView
          profile={profile}
          initialRoomCode={initialInviteCode}
          onUpdateName={handleUpdateName}
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onStartSoloDemo={handleStartSoloDemo}
          onOpenProfile={() => setShowProfileModal(true)}
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
          customPresets={customPresets}
          onUpdateSettings={handleUpdateSettings}
          onUpdatePreference={handleUpdatePreference}
          onSaveCustomPreset={handleSaveCustomPreset}
          onDeleteCustomPreset={handleDeleteCustomPreset}
          onRemovePlayer={handleRemovePlayer}
          onStartRound={handleStartRound}
          onShowQr={() => setShowQrModal(true)}
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
            nowMs={nowMs}
            isOnline={isOnline}
            offlineQueueCount={offlineQueueCount}
            stealthHaptic={stealthHaptic}
            flashColor={flashColor}
            radioStatusText={radioStatusText}
            onToggleStealthHaptic={() => setStealthHaptic((v) => !v)}
            onOpenMoreMenu={() => setShowMoreMenu(true)}
            onRunnerGotTagged={handleRunnerGotTagged}
            onTagBotInSolo={handleTagBotInSolo}
            onSendRadioClip={handleSendRadioClip}
            onResolveEmergency={handleResolveEmergency}
            onCallImposterMeeting={handleCallImposterMeeting}
            onCastMeetingVote={handleCastMeetingVote}
            onResolveMeeting={handleResolveMeeting}
            onSoloSkipHeadStart={handleSoloSkipHeadStart}
            onSoloTriggerPing={handleSoloTriggerPing}
            onSoloTriggerShrink={handleSoloTriggerShrink}
            onSoloFinishRound={handleEndRoundNow}
          />
        )}

      {room && room.phase === 'ended' && (
        <PostRoundView
          room={room}
          scores={scores}
          newlyUnlockedBadges={newlyUnlockedBadges}
          allProfileBadges={profile.badges}
          onPlayAgain={handlePlayAgain}
          onReturnHome={handleLeaveGame}
          onOpenMoreMenu={() => setShowMoreMenu(true)}
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
          inActiveRoom={!!room && room.phase !== 'ended'}
          onTriggerRoomEmergency={handleTriggerRoomEmergency}
          onClose={() => setShowEmergencyModal(false)}
        />
      )}

      {showMoreMenu && room && (
        <MoreMenuSheet
          title={
            room.phase === 'lobby'
              ? 'Lobby Menu'
              : room.phase === 'ended'
              ? 'Post-Round Menu'
              : 'Field Menu'
          }
          isHost={room.hostId === profile.playerId}
          players={room.players}
          viewerId={profile.playerId}
          mapTheme={room.settings.mapTheme}
          stealthHaptic={stealthHaptic}
          canEndRound={room.phase === 'head_start' || room.phase === 'hunt'}
          onOpenGetHelp={() => setShowEmergencyModal(true)}
          onOpenHowToPlay={() => setShowHowToPlayModal(true)}
          onChangeMapTheme={handleChangeMapTheme}
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
          units={room?.settings.units ?? 'km'}
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
  );
}

function createPingSnapshots(room: RoomState, nowMs: number): RadarPing[] {
  return room.players
    .filter((p) => p.role === 'runner' && !p.eliminated && p.lastPos)
    .map((p) => ({
      id: `ping_${nowMs}_${p.id}`,
      playerId: p.id,
      playerName: p.name,
      lat: p.lastPos!.lat,
      lng: p.lastPos!.lng,
      pingedAt: nowMs,
    }));
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
