import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type {
  ActiveZone,
  LatLng,
  MapTheme,
  PlayerState,
  RadarPing,
} from '../types/game';

import {
  createCirclePolygon,
  polygonCentroid,
  roundCoord,
  translatePolygon,
} from '../game/geo';
import { getCallsignInitial, type VisiblePlayerMarker } from '../game/rules';

if (typeof window !== 'undefined' && maplibreWorkerUrl) {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

interface TacticalMapProps {
  center: LatLng;
  mapTheme: MapTheme;
  activeZone: ActiveZone;
  nextZonePreview?: ActiveZone | null;
  visibleMarkers?: VisiblePlayerMarker[];
  pings?: RadarPing[];
  viewerId?: string;
  centerLabel?: string;
  nowMs?: number;
  recenterSignal?: number;
  editableZone?: boolean;
  clickToAddPolygonPoint?: boolean;
  onZoneChange?: (zone: ActiveZone) => void;
  showTrailsForPlayers?: PlayerState[];
  className?: string;
}

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri',
    },
    'esri-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-imagery-layer',
      type: 'raster',
      source: 'esri-imagery',
    },
    {
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-labels',
      paint: {
        'raster-opacity': 0.85,
      },
    },
  ],
};

function getMapStyle(theme: MapTheme): string | StyleSpecification {
  switch (theme) {
    case 'night':
      return 'https://tiles.openfreemap.org/styles/dark';
    case 'standard':
      return 'https://tiles.openfreemap.org/styles/liberty';
    case 'snow':
      return 'https://tiles.openfreemap.org/styles/positron';
    case 'satellite':
      return SATELLITE_STYLE;
  }
}

type GeoJsonData = Parameters<GeoJSONSource['setData']>[0];

function zoneToGeoJson(zone: ActiveZone | null | undefined): GeoJsonData {
  if (!zone || zone.shape === 'off') {
    return { type: 'FeatureCollection', features: [] };
  }
  if (zone.shape === 'circle') {
    const ring = createCirclePolygon(zone.center, zone.diameterMeters, 72);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
        },
      ],
    };
  }
  if (zone.polygon.length >= 3) {
    const ring = zone.polygon.map((pt) => [pt.lng, pt.lat] as [number, number]);
    ring.push(ring[0]);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
        },
      ],
    };
  }
  return { type: 'FeatureCollection', features: [] };
}

function trailsToGeoJson(players: PlayerState[] | undefined): GeoJsonData {
  if (!players || players.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features = players
    .filter((p) => p.trail.length >= 2)
    .map((p) => ({
      type: 'Feature' as const,
      properties: { color: p.color || '#10B981' },
      geometry: {
        type: 'LineString' as const,
        coordinates: p.trail.map((pt) => [pt.lng, pt.lat]),
      },
    }));
  return { type: 'FeatureCollection', features };
}

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  center,
  mapTheme,
  activeZone,
  nextZonePreview = null,
  visibleMarkers = [],
  pings = [],
  viewerId,
  centerLabel,
  nowMs = Date.now(),
  recenterSignal = 0,
  editableZone = false,
  clickToAddPolygonPoint = false,
  onZoneChange,
  showTrailsForPlayers,
  className = 'w-full h-full',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef<boolean>(false);
  const currentStyleThemeRef = useRef<MapTheme | null>(null);
  const pingMarkersRef = useRef<
    Map<string, { marker: maplibregl.Marker; el: HTMLDivElement; sig: string; pingedAt: number }>
  >(new Map());
  const playerMarkersRef = useRef<
    Map<string, { marker: maplibregl.Marker; el: HTMLDivElement; sig: string }>
  >(new Map());
  const fallbackMarkerRef = useRef<{
    marker: maplibregl.Marker;
    el: HTMLDivElement;
    sig: string;
  } | null>(null);
  const editorMarkersRef = useRef<maplibregl.Marker[]>([]);
  const isDraggingEditorRef = useRef(false);

  // Latest props stored in refs so MapLibre callbacks never go stale
  const activeZoneRef = useRef(activeZone);
  activeZoneRef.current = activeZone;
  const nextZonePreviewRef = useRef(nextZonePreview);
  nextZonePreviewRef.current = nextZonePreview;
  const trailsRef = useRef(showTrailsForPlayers);
  trailsRef.current = showTrailsForPlayers;
  const editableRef = useRef(editableZone);
  editableRef.current = editableZone;
  const clickAddRef = useRef(clickToAddPolygonPoint);
  clickAddRef.current = clickToAddPolygonPoint;
  const onZoneChangeRef = useRef(onZoneChange);
  onZoneChangeRef.current = onZoneChange;

  const ensureAndSyncGeoJsonLayers = (forceReady = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (forceReady) {
      styleReadyRef.current = true;
    }
    if (!styleReadyRef.current && !map.isStyleLoaded()) return;

    const activeData = zoneToGeoJson(activeZoneRef.current);
    const previewData = zoneToGeoJson(nextZonePreviewRef.current);
    const trailsData = trailsToGeoJson(trailsRef.current);

    try {
      // 1. Active Play Zone (translucent emerald fill + crisp stroke)
      if (!map.getSource('fk-active-zone')) {
        map.addSource('fk-active-zone', { type: 'geojson', data: activeData });
        map.addLayer({
          id: 'fk-active-zone-fill',
          type: 'fill',
          source: 'fk-active-zone',
          paint: {
            'fill-color': '#10B981',
            'fill-opacity': 0.14,
          },
        });
        map.addLayer({
          id: 'fk-active-zone-line',
          type: 'line',
          source: 'fk-active-zone',
          paint: {
            'line-color': '#34D399',
            'line-width': 3,
            'line-opacity': 0.96,
          },
        });
      } else {
        (map.getSource('fk-active-zone') as GeoJSONSource).setData(activeData);
      }

      // 2. Next Shrink / Curfew Preview (dashed amber inner boundary)
      if (!map.getSource('fk-next-zone')) {
        map.addSource('fk-next-zone', { type: 'geojson', data: previewData });
        map.addLayer({
          id: 'fk-next-zone-fill',
          type: 'fill',
          source: 'fk-next-zone',
          paint: {
            'fill-color': '#F59E0B',
            'fill-opacity': 0.06,
          },
        });
        map.addLayer({
          id: 'fk-next-zone-line',
          type: 'line',
          source: 'fk-next-zone',
          paint: {
            'line-color': '#F59E0B',
            'line-width': 2.25,
            'line-dasharray': [3, 3],
            'line-opacity': 0.92,
          },
        });
      } else {
        (map.getSource('fk-next-zone') as GeoJSONSource).setData(previewData);
      }

      // 3. Post-Round Breadcrumb Trails
      if (!map.getSource('fk-trails')) {
        map.addSource('fk-trails', { type: 'geojson', data: trailsData });
        map.addLayer({
          id: 'fk-trails-line',
          type: 'line',
          source: 'fk-trails',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 4,
            'line-opacity': 0.92,
          },
        });
      } else {
        (map.getSource('fk-trails') as GeoJSONSource).setData(trailsData);
      }
    } catch {
      // Style is mid-swap; style.load / load will immediately re-sync.
    }
  };

  // Initialize MapLibre GL JS instance once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialZoom =
      activeZone.shape === 'circle'
        ? activeZone.diameterMeters > 3000
          ? 12.0
          : activeZone.diameterMeters > 1200
          ? 13.1
          : 14.1
        : 14.0;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(mapTheme),
      center: [center.lng, center.lat],
      zoom: initialZoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    currentStyleThemeRef.current = mapTheme;
    styleReadyRef.current = false;
    mapRef.current = map;

    map.on('style.load', () => {
      ensureAndSyncGeoJsonLayers(true);
    });
    map.on('load', () => {
      ensureAndSyncGeoJsonLayers(true);
    });

    map.on('click', (e: MapMouseEvent) => {
      if (!editableRef.current || !onZoneChangeRef.current || isDraggingEditorRef.current) return;
      const z = activeZoneRef.current;
      const clicked: LatLng = {
        lat: roundCoord(e.lngLat.lat),
        lng: roundCoord(e.lngLat.lng),
      };
      if (z.shape === 'circle') {
        onZoneChangeRef.current({ ...z, center: clicked });
      } else if (z.shape === 'polygon' && clickAddRef.current && z.polygon.length < 12) {
        const nextPoly = [...z.polygon, clicked];
        onZoneChangeRef.current({
          ...z,
          polygon: nextPoly,
          center: polygonCentroid(nextPoly),
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      pingMarkersRef.current.forEach((entry) => entry.marker.remove());
      pingMarkersRef.current.clear();
      playerMarkersRef.current.forEach((entry) => entry.marker.remove());
      playerMarkersRef.current.clear();
      if (fallbackMarkerRef.current) {
        fallbackMarkerRef.current.marker.remove();
        fallbackMarkerRef.current = null;
      }
      editorMarkersRef.current.forEach((m) => m.remove());
      editorMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
      currentStyleThemeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch OpenFreeMap / Esri Satellite styles cleanly without tearing down map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleThemeRef.current === mapTheme) return;
    currentStyleThemeRef.current = mapTheme;
    styleReadyRef.current = false;
    map.setStyle(getMapStyle(mapTheme));
  }, [mapTheme]);

  // Smooth recenter on explicit signal
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recenterSignal <= 0) return;
    map.easeTo({
      center: [center.lng, center.lat],
      zoom: Math.max(map.getZoom(), 14.5),
      duration: 500,
    });
  }, [recenterSignal, center.lat, center.lng]);

  // Sync GeoJSON Zone & Trail layers whenever zone or trails update
  useEffect(() => {
    ensureAndSyncGeoJsonLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, nextZonePreview, showTrailsForPlayers]);

  // Fit bounds automatically in post-round trails view
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showTrailsForPlayers || showTrailsForPlayers.length === 0) return;
    const pts: [number, number][] = [];
    for (const p of showTrailsForPlayers) {
      for (const pt of p.trail) {
        pts.push([pt.lng, pt.lat]);
      }
    }
    if (pts.length >= 2) {
      const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
      for (const c of pts) bounds.extend(c);
      map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 450 });
    }
  }, [showTrailsForPlayers]);

  // Render interactive Play Zone Editor draggable handles (Circle center / Polygon corners + center move handle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    editorMarkersRef.current.forEach((m) => m.remove());
    editorMarkersRef.current = [];

    if (!editableZone || !onZoneChange || activeZone.shape === 'off') return;

    if (activeZone.shape === 'circle') {
      const el = document.createElement('div');
      el.setAttribute('aria-label', 'Drag to move play zone center');
      el.style.cssText =
        'width:40px;height:40px;border-radius:9999px;background:rgba(16,185,129,0.22);border:2.5px solid #10B981;display:flex;align-items:center;justify-content:center;cursor:grab;box-shadow:0 4px 16px rgba(0,0,0,0.55);';
      el.innerHTML = `<div style="width:12px;height:12px;border-radius:9999px;background:#10B981;border:2px solid #08090E;"></div>`;

      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([activeZone.center.lng, activeZone.center.lat])
        .addTo(map);

      marker.on('dragstart', () => {
        isDraggingEditorRef.current = true;
      });
      marker.on('drag', () => {
        const pos = marker.getLngLat();
        const previewZone: ActiveZone = {
          ...activeZoneRef.current,
          center: { lat: roundCoord(pos.lat), lng: roundCoord(pos.lng) },
        };
        if (map.isStyleLoaded() && map.getSource('fk-active-zone')) {
          (map.getSource('fk-active-zone') as GeoJSONSource).setData(zoneToGeoJson(previewZone));
        }
      });
      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        onZoneChangeRef.current?.({
          ...activeZoneRef.current,
          center: { lat: roundCoord(pos.lat), lng: roundCoord(pos.lng) },
        });
        window.setTimeout(() => {
          isDraggingEditorRef.current = false;
        }, 60);
      });

      editorMarkersRef.current.push(marker);
    } else if (activeZone.shape === 'polygon' && activeZone.polygon.length >= 3) {
      // 1. Numbered draggable corner handles
      activeZone.polygon.forEach((pt, idx) => {
        const el = document.createElement('div');
        el.setAttribute('aria-label', `Zone corner ${idx + 1}`);
        el.style.cssText =
          'width:28px;height:28px;border-radius:9999px;background:#08090E;border:2.5px solid #10B981;color:#F8FAFC;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:grab;box-shadow:0 3px 12px rgba(0,0,0,0.6);';
        el.textContent = String(idx + 1);

        const cornerMarker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([pt.lng, pt.lat])
          .addTo(map);

        cornerMarker.on('dragstart', () => {
          isDraggingEditorRef.current = true;
        });
        cornerMarker.on('drag', () => {
          const pos = cornerMarker.getLngLat();
          const draftPoly = activeZoneRef.current.polygon.map((v, i) =>
            i === idx ? { lat: roundCoord(pos.lat), lng: roundCoord(pos.lng) } : v
          );
          if (map.isStyleLoaded() && map.getSource('fk-active-zone')) {
            (map.getSource('fk-active-zone') as GeoJSONSource).setData(
              zoneToGeoJson({ ...activeZoneRef.current, polygon: draftPoly })
            );
          }
        });
        cornerMarker.on('dragend', () => {
          const pos = cornerMarker.getLngLat();
          const nextPoly = activeZoneRef.current.polygon.map((v, i) =>
            i === idx ? { lat: roundCoord(pos.lat), lng: roundCoord(pos.lng) } : v
          );
          onZoneChangeRef.current?.({
            ...activeZoneRef.current,
            polygon: nextPoly,
            center: polygonCentroid(nextPoly),
          });
          window.setTimeout(() => {
            isDraggingEditorRef.current = false;
          }, 60);
        });

        editorMarkersRef.current.push(cornerMarker);
      });

      // 2. Center Move-Whole-Zone Handle (translates entire polygon at once)
      const centroid = polygonCentroid(activeZone.polygon);
      const centerEl = document.createElement('div');
      centerEl.setAttribute('aria-label', 'Drag to move entire drawn play zone');
      centerEl.style.cssText =
        'width:40px;height:40px;border-radius:9999px;background:rgba(11,14,23,0.92);border:2px solid #34D399;color:#34D399;display:flex;align-items:center;justify-content:center;cursor:move;box-shadow:0 4px 16px rgba(0,0,0,0.65);';
      centerEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;

      const moveMarker = new maplibregl.Marker({ element: centerEl, draggable: true })
        .setLngLat([centroid.lng, centroid.lat])
        .addTo(map);

      let startCenter = centroid;
      let startPoly = activeZone.polygon;

      moveMarker.on('dragstart', () => {
        isDraggingEditorRef.current = true;
        startPoly = activeZoneRef.current.polygon;
        startCenter = polygonCentroid(startPoly);
      });
      moveMarker.on('drag', () => {
        const pos = moveMarker.getLngLat();
        const dLat = pos.lat - startCenter.lat;
        const dLng = pos.lng - startCenter.lng;
        const translated = translatePolygon(startPoly, dLat, dLng);
        if (map.isStyleLoaded() && map.getSource('fk-active-zone')) {
          (map.getSource('fk-active-zone') as GeoJSONSource).setData(
            zoneToGeoJson({ ...activeZoneRef.current, polygon: translated })
          );
        }
      });
      moveMarker.on('dragend', () => {
        const pos = moveMarker.getLngLat();
        const dLat = pos.lat - startCenter.lat;
        const dLng = pos.lng - startCenter.lng;
        const translated = translatePolygon(startPoly, dLat, dLng);
        onZoneChangeRef.current?.({
          ...activeZoneRef.current,
          polygon: translated,
          center: polygonCentroid(translated),
        });
        window.setTimeout(() => {
          isDraggingEditorRef.current = false;
        }, 60);
      });

      editorMarkersRef.current.push(moveMarker);
    }
  }, [editableZone, activeZone, onZoneChange]);

  // Persistent, flicker-free Player Markers & Radar Pings (smooth setLngLat updates)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const formatAge = (pingedAt: number) => {
      const ageSec = Math.max(0, Math.round((nowMs - pingedAt) / 1000));
      return ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
    };

    // 1. Radar Pings (keyed by playerId; ripple resets only when pingedAt advances)
    const activePingIds = new Set<string>();
    for (const ping of pings) {
      const key = ping.playerId;
      activePingIds.add(key);
      const shortName = ping.playerName.replace(' (AI)', '');
      const sig = `${shortName}|${ping.pingedAt}`;
      const existing = pingMarkersRef.current.get(key);

      if (existing && existing.sig === sig) {
        existing.marker.setLngLat([ping.lng, ping.lat]);
      } else {
        if (existing) {
          existing.marker.remove();
        }
        const el = document.createElement('div');
        el.setAttribute('data-ping-marker', ping.playerId);
        el.style.cssText =
          'position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;';
        el.innerHTML = `
          <div class="fk-ping-ripple"></div>
          <div style="width:14px;height:14px;border-radius:9999px;background:#22D3EE;border:2.5px solid #08090E;box-shadow:0 0 14px rgba(34,211,238,0.85);"></div>
          <div style="margin-top:3px;padding:1px 7px;border-radius:9999px;background:rgba(8,9,14,0.88);border:1px solid rgba(34,211,238,0.45);color:#A5F3FC;font-size:10px;font-weight:700;white-space:nowrap;">${escapeHtml(
            shortName
          )} · <span data-ping-age="true">${formatAge(ping.pingedAt)}</span></div>
        `;
        const marker = new maplibregl.Marker({ element: el, anchor: 'top' })
          .setLngLat([ping.lng, ping.lat])
          .addTo(map);
        pingMarkersRef.current.set(key, { marker, el, sig, pingedAt: ping.pingedAt });
      }
    }
    for (const [key, entry] of pingMarkersRef.current.entries()) {
      if (!activePingIds.has(key)) {
        entry.marker.remove();
        pingMarkersRef.current.delete(key);
      }
    }

    // 2. Visible Players (persistent DOM elements, updated smoothly via setLngLat)
    const activePlayerIds = new Set<string>();
    for (const item of visibleMarkers) {
      const { player, position, isEmergencyPin, isExposedOob, isLastManStandingReveal } = item;
      activePlayerIds.add(player.id);
      const isSelf = player.id === viewerId;
      const initial = getCallsignInitial(player.name);
      const isLmsSurvivor = Boolean(isLastManStandingReveal && player.role === 'runner');
      const isLmsHunter = Boolean(isLastManStandingReveal && player.role === 'hunter');

      const badgeColor = isEmergencyPin
        ? '#EF4444'
        : isExposedOob
        ? '#F59E0B'
        : isLmsHunter
        ? '#EF4444'
        : isLmsSurvivor
        ? '#10B981'
        : player.color || (player.role === 'hunter' ? '#EF4444' : '#10B981');
      const shortName = player.name.replace(' (AI)', '');
      const ringColor = isEmergencyPin
        ? 'rgba(239,68,68,0.75)'
        : isLmsSurvivor
        ? 'rgba(251,191,36,0.85)'
        : isLmsHunter
        ? 'rgba(239,68,68,0.78)'
        : `${badgeColor}88`;
      const borderColor = isSelf
        ? '#FFFFFF'
        : isLmsSurvivor
        ? '#FBBF24'
        : isLmsHunter
        ? '#FCA5A5'
        : '#08090E';
      const labelBorderColor = isLmsSurvivor
        ? 'rgba(251,191,36,0.55)'
        : isLmsHunter
        ? 'rgba(239,68,68,0.55)'
        : 'rgba(255,255,255,0.14)';
      const suffix = isEmergencyPin
        ? ' · SOS'
        : isExposedOob
        ? ' · OOB'
        : isLastManStandingReveal && !isSelf
        ? player.role === 'runner'
          ? ' · SURVIVOR'
          : ' · HUNTER'
        : '';

      const sig = `${isSelf}|${shortName}|${initial}|${badgeColor}|${ringColor}|${borderColor}|${suffix}|${player.role}|${Boolean(
        isLastManStandingReveal
      )}`;
      const existing = playerMarkersRef.current.get(player.id);

      const renderPlayerMarkup = (el: HTMLDivElement) => {
        el.setAttribute('data-player-marker', player.id);
        el.setAttribute('data-player-role', player.role);
        if (isLastManStandingReveal) {
          el.setAttribute('data-lms-reveal', 'true');
        } else {
          el.removeAttribute('data-lms-reveal');
        }
        el.innerHTML = `
          <div class="fk-player-pulse" style="border:2px solid ${ringColor};background:${badgeColor}26;"></div>
          <div style="width:${isSelf ? 32 : 28}px;height:${
          isSelf ? 32 : 28
        }px;border-radius:9999px;background:${badgeColor};border:2.5px solid ${borderColor};color:#08090E;font-size:${
          isSelf ? 13 : 11
        }px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.6);">${escapeHtml(
          initial
        )}</div>
          <div style="margin-top:3px;padding:1px 7px;border-radius:9999px;background:rgba(8,9,14,0.88);border:1px solid ${labelBorderColor};color:#F8FAFC;font-size:10px;font-weight:700;white-space:nowrap;">${escapeHtml(
          isSelf ? 'You' : shortName
        )}${suffix}</div>
        `;
      };

      if (existing) {
        existing.marker.setLngLat([position.lng, position.lat]);
        if (existing.sig !== sig) {
          renderPlayerMarkup(existing.el);
          existing.sig = sig;
        }
      } else {
        const el = document.createElement('div');
        el.style.cssText =
          'position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;';
        renderPlayerMarkup(el);
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([position.lng, position.lat])
          .addTo(map);
        playerMarkersRef.current.set(player.id, { marker, el, sig });
      }
    }
    for (const [key, entry] of playerMarkersRef.current.entries()) {
      if (!activePlayerIds.has(key)) {
        entry.marker.remove();
        playerMarkersRef.current.delete(key);
      }
    }

    // 3. Fallback user center pin if no visibleMarkers provided and not editing
    const showFallback = visibleMarkers.length === 0 && !editableZone && !showTrailsForPlayers;
    if (showFallback) {
      const initial = getCallsignInitial(centerLabel || 'You');
      const sig = initial;
      if (fallbackMarkerRef.current) {
        fallbackMarkerRef.current.marker.setLngLat([center.lng, center.lat]);
        if (fallbackMarkerRef.current.sig !== sig) {
          fallbackMarkerRef.current.el.innerHTML = `
            <div class="fk-player-pulse" style="border:2px solid rgba(16,185,129,0.65);background:rgba(16,185,129,0.2);"></div>
            <div style="width:28px;height:28px;border-radius:9999px;background:#10B981;border:2.5px solid #FFFFFF;color:#08090E;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.6);">${escapeHtml(
              initial
            )}</div>
          `;
          fallbackMarkerRef.current.sig = sig;
        }
      } else {
        const el = document.createElement('div');
        el.style.cssText =
          'position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;';
        el.innerHTML = `
          <div class="fk-player-pulse" style="border:2px solid rgba(16,185,129,0.65);background:rgba(16,185,129,0.2);"></div>
          <div style="width:28px;height:28px;border-radius:9999px;background:#10B981;border:2.5px solid #FFFFFF;color:#08090E;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.6);">${escapeHtml(
            initial
          )}</div>
        `;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([center.lng, center.lat])
          .addTo(map);
        fallbackMarkerRef.current = { marker, el, sig };
      }
    } else if (fallbackMarkerRef.current) {
      fallbackMarkerRef.current.marker.remove();
      fallbackMarkerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMarkers, pings, viewerId, editableZone, centerLabel, center.lat, center.lng, showTrailsForPlayers]);

  // Lightweight in-place ping age text updater (zero marker teardown)
  useEffect(() => {
    for (const entry of pingMarkersRef.current.values()) {
      const ageEl = entry.el.querySelector('[data-ping-age="true"]');
      if (ageEl) {
        const ageSec = Math.max(0, Math.round((nowMs - entry.pingedAt) / 1000));
        ageEl.textContent = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
      }
    }
  }, [nowMs, pings]);

  return (
    <div
      data-testid="tactical-map"
      data-map-engine="maplibre"
      data-map-theme={mapTheme}
      className={`fk-map-${mapTheme} relative overflow-hidden ${className}`}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
