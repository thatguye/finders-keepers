import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextZone,
  createDefaultPolygonAround,
  formatDistance,
  formatZoneSize,
  haversineMeters,
  isPointInCircle,
  isPointInPolygon,
  isPointInZone,
  movePointByBearing,
  totalPathDistanceMeters,
} from './geo';
import {
  applyInfectionLastManStanding,
  assignTeams,
  calculateScores,
  canAccessGameWithLocation,
  checkWinCondition,
  createDefaultSettings,
  createPingSnapshots,
  DEFAULT_COORDS,
  evaluateOobState,
  filterVisibleChatMessages,
  filterVisiblePlayers,
  formatRealDateTime,
  generateRoomCode,
  getCallsignInitial,
  isInfectionLastManStanding,
  mergeRemoteRoomState,
  OOB_COUNTDOWN_SECONDS,
  processTag,
  resolveReleaseTimestamps,
  shouldShowRoleReveal,
  shouldThrottleGpsUpload,
} from './rules';
import { createSoloDemoRoom, stepSoloBots } from './bots';
import type { ChatMessage, PlayerState, RoomState } from '../types/game';

function makePlayer(id: string, pref: PlayerState['preference'] = 'random'): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    isHost: id === 'p1',
    preference: pref,
    role: 'runner',
    eliminated: false,
    tagsCount: 0,
    color: '#10B981',
    trail: [],
    oobStatus: 'inside',
    connected: true,
    lastSeenAt: 1000,
  };
}

test('haversineMeters and movePointByBearing are accurate within 1%', () => {
  const dest = movePointByBearing(DEFAULT_COORDS, 500, 90);
  const dist = haversineMeters(DEFAULT_COORDS, dest);
  assert.ok(Math.abs(dist - 500) < 5, `Expected ~500m, got ${dist}`);
});

test('point-in-circle and point-in-polygon detect interior vs exterior', () => {
  assert.equal(isPointInCircle(DEFAULT_COORDS, DEFAULT_COORDS, 200), true);
  const far = movePointByBearing(DEFAULT_COORDS, 400, 45);
  assert.equal(isPointInCircle(far, DEFAULT_COORDS, 200), false);

  const poly = createDefaultPolygonAround(DEFAULT_COORDS, 500);
  assert.equal(isPointInPolygon(DEFAULT_COORDS, poly), true);
  const outsidePoly = movePointByBearing(DEFAULT_COORDS, 900, 0);
  assert.equal(isPointInPolygon(outsidePoly, poly), false);
});

test('Curfew mode teleports a smaller sub-zone inside the previous circle boundary', () => {
  const settings = createDefaultSettings(DEFAULT_COORDS);
  settings.zone.shape = 'circle';
  settings.zone.diameterMeters = 2000;
  const next = computeNextZone(settings.zone, 400, true, () => 0.7);
  assert.ok(next.diameterMeters < settings.zone.diameterMeters);
  const centerOffset = haversineMeters(settings.zone.center, next.center);
  assert.ok(centerOffset > 20, 'Curfew zone should teleport away from exact center');
  assert.ok(
    centerOffset + next.diameterMeters / 2 <= settings.zone.diameterMeters / 2 + 5,
    'Curfew sub-zone must remain inside previous circle'
  );
  assert.equal(isPointInZone(next.center, settings.zone), true);
});

test('assignTeams enforces >= 1 Hunter per 10 players and never more Hunters than Runners', () => {
  // 4 players all wanting Hunter -> capped at 2 Hunters, 2 Runners
  const fourAllHunters = ['p1', 'p2', 'p3', 'p4'].map((id) => makePlayer(id, 'hunter'));
  const assigned4 = assignTeams(fourAllHunters, 'classic', () => 0.4);
  const h4 = assigned4.filter((p) => p.role === 'hunter').length;
  const r4 = assigned4.filter((p) => p.role === 'runner').length;
  assert.equal(h4, 2);
  assert.equal(r4, 2);

  // 15 players all wanting Runner -> minimum 2 Hunters (ceil(15/10))
  const fifteenRunners = Array.from({ length: 15 }, (_, i) => makePlayer(`p${i + 1}`, 'runner'));
  const assigned15 = assignTeams(fifteenRunners, 'classic', () => 0.5);
  const h15 = assigned15.filter((p) => p.role === 'hunter').length;
  assert.ok(h15 >= 2, `Expected at least 2 Hunters for 15 players, got ${h15}`);
  assert.ok(h15 <= 7, 'Never more Hunters than Runners');

  // Imposter mode secretly assigns at least 1 imposter
  const assignedImp = assignTeams(fourAllHunters, 'imposter', () => 0.3);
  assert.ok(assignedImp.some((p) => p.isImposter), 'Imposter mode must assign at least one imposter');
});

test('evaluateOobState enforces single 30s countdown directly into automatic elimination (no grace period)', () => {
  const start = 10_000;
  const inside = evaluateOobState(false, null, start);
  assert.equal(inside.status, 'inside');
  assert.equal(inside.secondsUntilEliminated, OOB_COUNTDOWN_SECONDS);

  const warn = evaluateOobState(true, start, start + 15_000);
  assert.equal(warn.status, 'warning');
  assert.equal(warn.secondsUntilEliminated, 15);

  const almostOut = evaluateOobState(true, start, start + 29_500);
  assert.equal(almostOut.status, 'warning');
  assert.equal(almostOut.secondsUntilEliminated, 1);

  // At 30s, immediately eliminated — NO exposed grace period
  const elimAt30 = evaluateOobState(true, start, start + 30_000);
  assert.equal(elimAt30.status, 'eliminated');
  assert.equal(elimAt30.secondsUntilEliminated, 0);

  const elimAt45 = evaluateOobState(true, start, start + 45_000);
  assert.equal(elimAt45.status, 'eliminated');
});

test('canAccessGameWithLocation blocks gameplay until real GPS coordinates are granted', () => {
  assert.equal(canAccessGameWithLocation('checking', null), false);
  assert.equal(canAccessGameWithLocation('denied', null), false);
  assert.equal(canAccessGameWithLocation('unavailable', null), false);
  assert.equal(canAccessGameWithLocation('denied', { lat: 30.2672, lng: -97.7431 }), false);
  assert.equal(canAccessGameWithLocation('granted', null), false);
  assert.equal(canAccessGameWithLocation('granted', { lat: Number.NaN, lng: -97.7431 }), false);
  assert.equal(canAccessGameWithLocation('granted', { lat: 30.2672, lng: -97.7431 }), true);
});

test('shouldThrottleGpsUpload uses high-frequency 1.5s moving (>1.5m), 4s stationary, and force bypass', () => {
  const p0 = { lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng, ts: 1000 };
  const moved3m = movePointByBearing(DEFAULT_COORDS, 3, 90);
  assert.equal(shouldThrottleGpsUpload(p0, { ...moved3m, ts: 2100 }), false);
  assert.equal(shouldThrottleGpsUpload(p0, { ...moved3m, ts: 2600 }), true);

  const stationaryHalfMeter = movePointByBearing(DEFAULT_COORDS, 0.5, 90);
  assert.equal(shouldThrottleGpsUpload(p0, { ...stationaryHalfMeter, ts: 4200 }), false);
  assert.equal(shouldThrottleGpsUpload(p0, { ...stationaryHalfMeter, ts: 5100 }), true);

  // Forced pre-ping / LMS flush bypasses throttling
  assert.equal(shouldThrottleGpsUpload(p0, { ...stationaryHalfMeter, ts: 1200 }, true), true);
});

test('strict asymmetrical fog-of-war hides Runners from Hunters except OOB exposed or Emergency', () => {
  const now = 100_000;
  const hunter: PlayerState = {
    ...makePlayer('h1', 'hunter'),
    role: 'hunter',
    lastPos: { ...DEFAULT_COORDS, ts: now },
  };
  const hiddenRunner: PlayerState = {
    ...makePlayer('r1', 'runner'),
    role: 'runner',
    oobStatus: 'inside',
    lastPos: { ...movePointByBearing(DEFAULT_COORDS, 100, 90), ts: now },
  };
  const exposedRunner: PlayerState = {
    ...makePlayer('r2', 'runner'),
    role: 'runner',
    oobStatus: 'exposed',
    lastPos: { ...movePointByBearing(DEFAULT_COORDS, 400, 180), ts: now },
  };

  const room: RoomState = {
    code: generateRoomCode(),
    isSoloDemo: false,
    hostId: 'h1',
    phase: 'hunt',
    settings: createDefaultSettings(DEFAULT_COORDS),
    currentZone: createDefaultSettings(DEFAULT_COORDS).zone,
    nextZonePreview: null,
    nextZoneTransitionAt: null,
    shrinkStep: 0,
    players: [hunter, hiddenRunner, exposedRunner],
    pings: [],
    tags: [],
    roundStartedAt: now - 60_000,
    headStartEndsAt: now - 50_000,
    roundEndsAt: now + 600_000,
    lastPingAt: null,
    nextPingAt: null,
    pausedAt: null,
    emergency: null,
    meeting: null,
    winner: null,
    updatedAt: now,
  };

  // Hunter sees self + exposedRunner, NOT hiddenRunner
  const hunterSees = filterVisiblePlayers(hunter, room, now);
  assert.deepEqual(
    hunterSees.map((v) => v.player.id).sort(),
    ['h1', 'r2']
  );

  // Runner sees fellow Runners, NEVER Hunters
  const runnerSees = filterVisiblePlayers(hiddenRunner, room, now);
  assert.deepEqual(
    runnerSees.map((v) => v.player.id).sort(),
    ['r1', 'r2']
  );

  // During Head Start, Hunter does NOT even see exposedRunner
  const headStartRoom = { ...room, phase: 'head_start' as const };
  assert.deepEqual(
    filterVisiblePlayers(hunter, headStartRoom, now).map((v) => v.player.id),
    ['h1']
  );
});

test('processTag handles Classic elimination, Infection team switch, and scoring rules', () => {
  const start = 0;
  const nineMin = 9 * 60_000;
  const h1: PlayerState = {
    ...makePlayer('h1', 'hunter'),
    role: 'hunter',
    initialRole: 'hunter',
    trail: [
      { ...DEFAULT_COORDS, ts: start },
      { ...movePointByBearing(DEFAULT_COORDS, 120, 45), ts: nineMin },
    ],
  };
  const r1: PlayerState = {
    ...makePlayer('r1', 'runner'),
    role: 'runner',
    initialRole: 'runner',
    trail: [{ ...DEFAULT_COORDS, ts: start }],
  };
  const r2: PlayerState = {
    ...makePlayer('r2', 'runner'),
    role: 'runner',
    initialRole: 'runner',
    trail: [{ ...DEFAULT_COORDS, ts: start }],
  };

  const baseRoom: RoomState = {
    code: 'TEST99',
    isSoloDemo: false,
    hostId: 'h1',
    phase: 'hunt',
    settings: createDefaultSettings(DEFAULT_COORDS),
    currentZone: createDefaultSettings(DEFAULT_COORDS).zone,
    nextZonePreview: null,
    nextZoneTransitionAt: null,
    shrinkStep: 0,
    players: [h1, r1, r2],
    pings: [],
    tags: [],
    roundStartedAt: start,
    headStartEndsAt: start,
    roundEndsAt: 20 * 60_000,
    lastPingAt: null,
    nextPingAt: null,
    pausedAt: null,
    emergency: null,
    meeting: null,
    winner: null,
    updatedAt: start,
  };

  // Classic: r1 tagged -> spectator; r2 survives -> ends when r2 tagged -> Hunter clean sweep
  const after1 = processTag(baseRoom, 'r1', 'h1', 'physical', nineMin);
  assert.equal(after1.players.find((p) => p.id === 'r1')?.role, 'spectator');
  assert.equal(after1.phase, 'hunt');

  const after2 = processTag(after1, 'r2', 'h1', 'physical', nineMin + 60_000);
  assert.equal(after2.phase, 'ended');
  assert.equal(after2.winner, 'hunters');

  const scores = calculateScores(after2, nineMin + 60_000);
  const hScore = scores.find((s) => s.playerId === 'h1')!;
  const r1Score = scores.find((s) => s.playerId === 'r1')!;
  assert.equal(hScore.points, 2 * 3 + 10); // 2 tags (+6) + clean sweep (+10) = 16
  assert.equal(r1Score.points, 3); // 9 min survived = 3 pts, no +10 survivor bonus

  // Infection: tagged Runner becomes Hunter!
  const infectionRoom: RoomState = {
    ...baseRoom,
    settings: { ...baseRoom.settings, mode: 'infection' },
  };
  const afterInf = processTag(infectionRoom, 'r1', 'h1', 'physical', nineMin);
  const infectedR1 = afterInf.players.find((p) => p.id === 'r1')!;
  assert.equal(infectedR1.role, 'hunter');
  assert.equal(infectedR1.eliminated, false);

  // Runner survivor win at round end
  const winCheck = checkWinCondition(after1, 21 * 60_000);
  assert.equal(winCheck.winner, 'runners');
  const endRoom: RoomState = { ...after1, phase: 'ended', updatedAt: 12 * 60_000 };
  const survivorScores = calculateScores(endRoom, 12 * 60_000);
  const r2Score = survivorScores.find((s) => s.playerId === 'r2')!;
  assert.equal(r2Score.points, 4 + 10); // 12 min = 4 pts + 10 never caught
});

test('Solo demo room spawns bots and moves them cleanly over time', () => {
  const demo = createSoloDemoRoom('me', 'Tester', DEFAULT_COORDS, 'hunter', 'classic', 1000);
  assert.equal(demo.isSoloDemo, true);
  assert.equal(demo.players.length, 6);
  const moved = stepSoloBots({ ...demo, phase: 'hunt' }, 3, 4000);
  const botMovedDist = totalPathDistanceMeters(moved.players[2].trail);
  assert.ok(botMovedDist > 10, `Expected AI bot to move >10m, moved ${botMovedDist}m`);
});

test('US imperial units (miles & feet) are the default across settings and formatters', () => {
  const settings = createDefaultSettings(DEFAULT_COORDS);
  assert.equal(settings.units, 'mi');
  assert.equal(formatZoneSize(settings.zone.diameterMeters), '2.0 mi');
  assert.equal(formatZoneSize(400), '1,310 ft');
  assert.equal(formatDistance(1609.344), '1.00 mi');
  assert.equal(formatDistance(100), '328 ft');
  assert.equal(formatDistance(1500, 'km'), '1.50 km');
});

test('getCallsignInitial extracts first uppercase letter and filterVisibleChatMessages isolates teams', () => {
  assert.equal(getCallsignInitial('ghostRunner'), 'G');
  assert.equal(getCallsignInitial('  viper  '), 'V');
  assert.equal(getCallsignInitial(''), 'A');

  const hunter: PlayerState = { ...makePlayer('h1', 'hunter'), role: 'hunter' };
  const runner: PlayerState = { ...makePlayer('r1', 'runner'), role: 'runner' };
  const msgs: ChatMessage[] = [
    {
      id: 'm1',
      scope: 'team',
      team: 'hunter',
      senderId: 'h1',
      senderName: 'Hunter One',
      senderColor: '#EF4444',
      kind: 'text',
      text: 'Flank north',
      ts: 1,
    },
    {
      id: 'm2',
      scope: 'team',
      team: 'runner',
      senderId: 'r1',
      senderName: 'Runner One',
      senderColor: '#10B981',
      kind: 'voice',
      audioBase64: 'AAA',
      durationSec: 2,
      ts: 2,
    },
    {
      id: 'm3',
      scope: 'global',
      team: 'runner',
      senderId: 'r1',
      senderName: 'Runner One',
      senderColor: '#10B981',
      kind: 'text',
      text: 'Good luck everyone!',
      ts: 3,
    },
  ];

  assert.deepEqual(
    filterVisibleChatMessages(msgs, hunter, 'hunt').map((m) => m.id),
    ['m1', 'm3']
  );
  assert.deepEqual(
    filterVisibleChatMessages(msgs, runner, 'hunt').map((m) => m.id),
    ['m2', 'm3']
  );
  assert.deepEqual(
    filterVisibleChatMessages(msgs, hunter, 'lobby').map((m) => m.id),
    ['m1', 'm2', 'm3']
  );
});

test('shouldShowRoleReveal gates on random preference and resolveReleaseTimestamps persists real dates/times', () => {
  assert.equal(shouldShowRoleReveal(makePlayer('p1', 'random')), true);
  assert.equal(shouldShowRoleReveal(makePlayer('p2', 'hunter')), false);
  assert.equal(shouldShowRoleReveal(makePlayer('p3', 'runner')), false);

  const now = new Date('2026-04-18T16:30:00Z').getTime();
  const exactIso = '2026-11-27T14:13:00-08:00';
  const resolved = resolveReleaseTimestamps(
    [
      { version: '2.3', releasedAt: exactIso },
      { version: '1.5', offsetMinutesAgo: 0 },
      { version: '1.4', offsetMinutesAgo: 30 },
    ],
    now,
    { '1.4': now - 90 * 60_000, '2.3': now }
  );
  assert.equal(resolved['2.3'], Date.parse(exactIso));
  assert.equal(resolved['1.5'], now);
  assert.equal(resolved['1.4'], now - 90 * 60_000);
  const formatted = formatRealDateTime(resolved['2.3']);
  assert.ok(formatted.includes('·') && /\d{1,2}:\d{2}/.test(formatted), `Expected real date & time, got ${formatted}`);
});

test('MapLibre GeoJSON polygon circle, translation, and corner resizing work accurately', async () => {
  const { createCirclePolygon, translatePolygon, resizePolygonCornerCount } = await import('./geo');
  const ring = createCirclePolygon(DEFAULT_COORDS, 1000, 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  const distFromCenter = haversineMeters(DEFAULT_COORDS, { lat: ring[0][1], lng: ring[0][0] });
  assert.ok(Math.abs(distFromCenter - 500) < 8, `Expected ~500m radius, got ${distFromCenter}`);

  const poly = createDefaultPolygonAround(DEFAULT_COORDS, 400, 5);
  assert.equal(poly.length, 5);
  const shifted = translatePolygon(poly, 0.001, -0.002);
  assert.ok(Math.abs(shifted[0].lat - (poly[0].lat + 0.001)) < 1e-4);
  assert.ok(Math.abs(shifted[0].lng - (poly[0].lng - 0.002)) < 1e-4);

  const grown = resizePolygonCornerCount(poly, DEFAULT_COORDS, 7);
  assert.equal(grown.length, 7);
  const shrunk = resizePolygonCornerCount(grown, DEFAULT_COORDS, 4);
  assert.equal(shrunk.length, 4);
});

test('custom room code formatting, GPS accuracy label, team preference cycling, and demo lobby work', async () => {
  const { formatRoomCodeInput, formatAccuracyLabel, cycleTeamPreference } = await import('./rules');
  const { createSoloDemoLobby } = await import('./bots');

  assert.equal(formatRoomCodeInput('  ab-12!cd99 '), 'AB12CD');
  assert.equal(formatAccuracyLabel(20, 'mi'), 'Accurate to about 65 ft');
  assert.equal(formatAccuracyLabel(20, 'km'), 'Accurate to about 20 m');
  assert.equal(formatAccuracyLabel(null, 'mi'), 'GPS signal locked');

  assert.equal(cycleTeamPreference('hunter'), 'runner');
  assert.equal(cycleTeamPreference('runner'), 'random');
  assert.equal(cycleTeamPreference('random'), 'hunter');

  const demoLobby = createSoloDemoLobby('u1', 'Alex', DEFAULT_COORDS, '#06B6D4', 'standard', 5000);
  assert.equal(demoLobby.phase, 'lobby');
  assert.equal(demoLobby.isSoloDemo, true);
  assert.equal(demoLobby.players.length, 6);
  assert.equal(demoLobby.settings.mapTheme, 'standard');
  assert.equal(demoLobby.players[0].color, '#06B6D4');
});

test('shouldShowSplashOnLaunch honors normal timing, reduced motion, and ?autostart=1 bypass', async () => {
  const { shouldShowSplashOnLaunch } = await import('./rules');

  assert.deepEqual(shouldShowSplashOnLaunch('', false), { show: true, durationMs: 2250 });
  assert.deepEqual(shouldShowSplashOnLaunch('', true), { show: true, durationMs: 800 });
  assert.deepEqual(shouldShowSplashOnLaunch('?code=ABC123', false), { show: true, durationMs: 2250 });
  assert.deepEqual(shouldShowSplashOnLaunch('?autostart=1', false), { show: false, durationMs: 0 });
  assert.deepEqual(shouldShowSplashOnLaunch('?code=ABC123&autostart=1', true), { show: false, durationMs: 0 });
});

test('Infection Last Man Standing clamps timer down to configured minutes, never adds time, and reveals all active players to both sides', () => {
  const now = 500_000;
  const settings = {
    ...createDefaultSettings(DEFAULT_COORDS),
    mode: 'infection' as const,
    lastManStandingMin: 2,
  };
  const hunter: PlayerState = {
    ...makePlayer('h1', 'hunter'),
    role: 'hunter',
    lastPos: { ...DEFAULT_COORDS, ts: now },
  };
  const r1: PlayerState = {
    ...makePlayer('r1', 'runner'),
    role: 'runner',
    lastPos: { ...movePointByBearing(DEFAULT_COORDS, 150, 90), ts: now },
  };
  const r2: PlayerState = {
    ...makePlayer('r2', 'runner'),
    role: 'runner',
    lastPos: { ...movePointByBearing(DEFAULT_COORDS, 280, 180), ts: now },
  };

  const room: RoomState = {
    code: 'INF001',
    isSoloDemo: false,
    hostId: 'h1',
    phase: 'hunt',
    settings,
    currentZone: settings.zone,
    nextZonePreview: null,
    nextZoneTransitionAt: null,
    shrinkStep: 0,
    players: [hunter, r1, r2],
    pings: [],
    tags: [],
    roundStartedAt: now - 60_000,
    headStartEndsAt: now - 50_000,
    roundEndsAt: now + 15 * 60_000, // 15 min remaining
    lastPingAt: null,
    nextPingAt: now + 60_000,
    pausedAt: null,
    emergency: null,
    meeting: null,
    winner: null,
    updatedAt: now,
  };

  // With 2 Runners still active, LMS is NOT active
  assert.equal(isInfectionLastManStanding(room), false);

  // Tagging r1 turns r1 into an Infected Hunter and leaves r2 as the 1 final Survivor -> triggers LMS!
  const afterTag = processTag(room, 'r1', 'h1', 'physical', now + 1000);
  assert.equal(afterTag.lastManStandingActive, true);
  assert.equal(isInfectionLastManStanding(afterTag), true);
  assert.equal(afterTag.roundEndsAt, now + 1000 + 2 * 60_000);

  // Idempotent duplicate tag on already-infected r1 is ignored
  const afterDupTag = processTag(afterTag, 'r1', 'h1', 'physical', now + 2000);
  assert.equal(afterDupTag, afterTag);

  // Both original Hunter, newly Infected Hunter, AND final Survivor see ALL 3 active players live
  const finalHunter = afterTag.players.find((p) => p.id === 'h1')!;
  const infectedHunter = afterTag.players.find((p) => p.id === 'r1')!;
  const lastSurvivor = afterTag.players.find((p) => p.id === 'r2')!;

  const hunterSees = filterVisiblePlayers(finalHunter, afterTag, now + 1000);
  const infectedSees = filterVisiblePlayers(infectedHunter, afterTag, now + 1000);
  const survivorSees = filterVisiblePlayers(lastSurvivor, afterTag, now + 1000);

  assert.deepEqual(hunterSees.map((v) => v.player.id).sort(), ['h1', 'r1', 'r2']);
  assert.deepEqual(infectedSees.map((v) => v.player.id).sort(), ['h1', 'r1', 'r2']);
  assert.deepEqual(survivorSees.map((v) => v.player.id).sort(), ['h1', 'r1', 'r2']);
  assert.equal(hunterSees.find((v) => v.player.id === 'r2')?.isLastManStandingReveal, true);
  assert.equal(survivorSees.find((v) => v.player.id === 'h1')?.isLastManStandingReveal, true);
  assert.equal(survivorSees.find((v) => v.player.id === 'r1')?.isLastManStandingReveal, true);

  // If round already had LESS time remaining than LMS setting (e.g., 45s left vs 2 min slider), never add time
  const shortClockRoom: RoomState = {
    ...room,
    players: [hunter, { ...r1, role: 'hunter' }, r2],
    roundEndsAt: now + 45_000,
    lastManStandingActive: false,
  };
  const applied = applyInfectionLastManStanding(shortClockRoom, now);
  assert.equal(applied.justTriggered, true);
  assert.equal(applied.room.roundEndsAt, now + 45_000);
});

test('createPingSnapshots and mergeRemoteRoomState preserve fresher live GPS and adopt newer synced pings', () => {
  const t0 = 1_000_000;
  const h1: PlayerState = {
    ...makePlayer('h1', 'hunter'),
    role: 'hunter',
    lastPos: { ...DEFAULT_COORDS, ts: t0 },
  };
  const r1: PlayerState = {
    ...makePlayer('r1', 'runner'),
    role: 'runner',
    lastPos: { ...movePointByBearing(DEFAULT_COORDS, 120, 45), ts: t0 + 5000 },
  };

  const localRoom: RoomState = {
    code: 'SYNC01',
    isSoloDemo: false,
    hostId: 'h1',
    phase: 'hunt',
    settings: createDefaultSettings(DEFAULT_COORDS),
    currentZone: createDefaultSettings(DEFAULT_COORDS).zone,
    nextZonePreview: null,
    nextZoneTransitionAt: null,
    shrinkStep: 0,
    players: [h1, r1],
    pings: [],
    tags: [],
    roundStartedAt: t0 - 10_000,
    headStartEndsAt: t0 - 5000,
    roundEndsAt: t0 + 600_000,
    lastPingAt: null,
    nextPingAt: t0 + 30_000,
    pausedAt: null,
    emergency: null,
    meeting: null,
    winner: null,
    updatedAt: t0 + 5000,
  };

  const pings = createPingSnapshots(localRoom, t0 + 6000);
  assert.equal(pings.length, 1);
  assert.equal(pings[0].playerId, 'r1');

  // Remote room has slightly older GPS for r1 (ts: t0), but newer synced pings (lastPingAt: t0 + 6000)
  const remoteRoom: RoomState = {
    ...localRoom,
    players: [
      h1,
      { ...r1, lastPos: { ...DEFAULT_COORDS, ts: t0 } },
    ],
    pings,
    lastPingAt: t0 + 6000,
    nextPingAt: t0 + 66_000,
    updatedAt: t0 + 6000,
  };

  const merged = mergeRemoteRoomState(localRoom, remoteRoom);
  // Preserves local fresher GPS fix (ts: t0 + 5000)
  assert.equal(merged.players.find((p) => p.id === 'r1')?.lastPos?.ts, t0 + 5000);
  // Adopts newer synced pings from remote
  assert.equal(merged.pings.length, 1);
  assert.equal(merged.lastPingAt, t0 + 6000);
  assert.equal(merged.nextPingAt, t0 + 66_000);
});
