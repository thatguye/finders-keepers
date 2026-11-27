import type { ActiveZone, GpsPoint, LatLng, UnitSystem } from '../types/game';

const EARTH_RADIUS_M = 6371000;

export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function movePointByBearing(
  origin: LatLng,
  distanceMeters: number,
  bearingDeg: number
): LatLng {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const angularDist = distanceMeters / EARTH_RADIUS_M;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: roundCoord(toDeg(lat2)),
    lng: roundCoord(toDeg(lng2)),
  };
}

export function isPointInCircle(point: LatLng, center: LatLng, radiusMeters: number): boolean {
  return haversineMeters(point, center) <= radiusMeters;
}

/** Standard ray-casting point-in-polygon check */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInZone(point: LatLng, zone: ActiveZone): boolean {
  if (zone.shape === 'off') return true;
  if (zone.shape === 'circle') {
    return isPointInCircle(point, zone.center, zone.diameterMeters / 2);
  }
  return isPointInPolygon(point, zone.polygon);
}

export function polygonCentroid(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) return { lat: 37.7694, lng: -122.4862 };
  const sum = polygon.reduce(
    (acc, pt) => ({ lat: acc.lat + pt.lat, lng: acc.lng + pt.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: roundCoord(sum.lat / polygon.length),
    lng: roundCoord(sum.lng / polygon.length),
  };
}

export function createDefaultPolygonAround(center: LatLng, radiusMeters = 450, corners = 5): LatLng[] {
  const count = Math.max(3, Math.min(12, Math.round(corners)));
  return Array.from({ length: count }, (_, i) => {
    const bearing = (i * 360) / count + 24;
    return movePointByBearing(center, radiusMeters, bearing);
  });
}

/**
 * Generates a smooth closed GeoJSON ring (array of [lng, lat] pairs) approximating a circle.
 * Used by MapLibre GL JS fill & line layers for crisp 60fps vector zone rendering.
 */
export function createCirclePolygon(
  center: LatLng,
  diameterMeters: number,
  steps = 64
): [number, number][] {
  const radius = Math.max(25, diameterMeters / 2);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 360) / steps;
    const pt = movePointByBearing(center, radius, bearing);
    ring.push([pt.lng, pt.lat]);
  }
  return ring;
}

/** Translates every vertex of a polygon by a delta latitude/longitude */
export function translatePolygon(polygon: LatLng[], dLat: number, dLng: number): LatLng[] {
  return polygon.map((pt) => ({
    lat: roundCoord(pt.lat + dLat),
    lng: roundCoord(pt.lng + dLng),
  }));
}

/** Adds or removes corners cleanly from a drawn polygon while preserving shape */
export function resizePolygonCornerCount(
  polygon: LatLng[],
  center: LatLng,
  targetCount: number
): LatLng[] {
  const clamped = Math.max(3, Math.min(12, Math.round(targetCount)));
  if (polygon.length < 3) {
    return createDefaultPolygonAround(center, 450, clamped);
  }
  if (clamped === polygon.length) return polygon;
  if (clamped < polygon.length) {
    return polygon.slice(0, clamped);
  }
  const next = [...polygon];
  while (next.length < clamped) {
    // Find longest edge and insert a midpoint slightly pushed outward from centroid
    let longestIdx = 0;
    let longestDist = -1;
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      const b = next[(i + 1) % next.length];
      const d = haversineMeters(a, b);
      if (d > longestDist) {
        longestDist = d;
        longestIdx = i;
      }
    }
    const a = next[longestIdx];
    const b = next[(longestIdx + 1) % next.length];
    const c = polygonCentroid(next);
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;
    const pushed: LatLng = {
      lat: roundCoord(midLat + (midLat - c.lat) * 0.12),
      lng: roundCoord(midLng + (midLng - c.lng) * 0.12),
    };
    next.splice(longestIdx + 1, 0, pushed);
  }
  return next;
}

export function scalePolygonAroundAnchor(
  polygon: LatLng[],
  anchor: LatLng,
  scaleFactor: number
): LatLng[] {
  return polygon.map((pt) => ({
    lat: roundCoord(anchor.lat + (pt.lat - anchor.lat) * scaleFactor),
    lng: roundCoord(anchor.lng + (pt.lng - anchor.lng) * scaleFactor),
  }));
}

/**
 * Generates the next zone boundary.
 * - Normal shrink: smoothly contracts toward center/centroid.
 * - Curfew mode: teleports/jumps to a smaller sub-zone positioned strictly INSIDE the previous boundary!
 */
export function computeNextZone(
  current: ActiveZone,
  targetDiameterMeters: number,
  isCurfew: boolean,
  rng: () => number = Math.random
): ActiveZone {
  if (current.shape === 'off') return current;

  const clampedNextDiameter = Math.max(
    120,
    Math.min(current.diameterMeters * 0.85, Math.max(targetDiameterMeters, current.diameterMeters * 0.58))
  );
  const scaleFactor = clampedNextDiameter / Math.max(current.diameterMeters, 1);

  if (current.shape === 'circle') {
    if (!isCurfew) {
      return {
        ...current,
        diameterMeters: Math.round(clampedNextDiameter),
      };
    }
    // Curfew: pick a random sub-center inside the safe offset radius (R_old - R_new)
    const oldRadius = current.diameterMeters / 2;
    const newRadius = clampedNextDiameter / 2;
    const maxOffset = Math.max(0, (oldRadius - newRadius) * 0.85);
    const offsetDist = maxOffset * (0.45 + 0.55 * rng());
    const bearing = rng() * 360;
    const nextCenter = movePointByBearing(current.center, offsetDist, bearing);

    return {
      ...current,
      center: nextCenter,
      diameterMeters: Math.round(clampedNextDiameter),
    };
  }

  // Polygon zone
  const centroid = polygonCentroid(current.polygon);
  let anchor = centroid;
  if (isCurfew && current.polygon.length >= 3) {
    // Pick an interior anchor biased toward one vertex so the sub-polygon teleports inside the old polygon
    const vertex = current.polygon[Math.floor(rng() * current.polygon.length)];
    const pull = 0.25 + 0.3 * rng();
    const candidate = {
      lat: roundCoord(centroid.lat + (vertex.lat - centroid.lat) * pull),
      lng: roundCoord(centroid.lng + (vertex.lng - centroid.lng) * pull),
    };
    if (isPointInPolygon(candidate, current.polygon)) {
      anchor = candidate;
    }
  }

  const nextPolygon = scalePolygonAroundAnchor(current.polygon, anchor, Math.min(0.85, Math.max(0.45, scaleFactor)));
  return {
    ...current,
    center: polygonCentroid(nextPolygon),
    diameterMeters: Math.round(clampedNextDiameter),
    polygon: nextPolygon,
  };
}

export function totalPathDistanceMeters(points: GpsPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const step = haversineMeters(points[i - 1], points[i]);
    // Filter impossible GPS teleport spikes (> 80m/s)
    const dtSec = Math.max(1, (points[i].ts - points[i - 1].ts) / 1000);
    if (step / dtSec <= 80) {
      total += step;
    }
  }
  return Math.round(total);
}

export function formatDistance(meters: number, units: UnitSystem = 'mi'): string {
  if (units === 'mi') {
    const miles = meters / 1609.344;
    if (miles < 0.2) {
      const feet = Math.round(meters * 3.28084);
      return `${feet.toLocaleString('en-US')} ft`;
    }
    return `${miles.toFixed(2)} mi`;
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatZoneSize(diameterMeters: number, units: UnitSystem = 'mi'): string {
  if (units === 'mi') {
    const miles = diameterMeters / 1609.344;
    if (miles < 0.25) {
      const feet = Math.round((diameterMeters * 3.28084) / 10) * 10;
      return `${feet.toLocaleString('en-US')} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  }
  return diameterMeters < 1000
    ? `${Math.round(diameterMeters)} m`
    : `${(diameterMeters / 1000).toFixed(1)} km`;
}

export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}
