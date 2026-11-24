import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {
  ActiveZone,
  LatLng,
  MapTheme,
  PlayerState,
  RadarPing,
} from '../types/game';
import type { VisiblePlayerMarker } from '../game/rules';
import { roundCoord } from '../game/geo';

interface TacticalMapProps {
  center: LatLng;
  mapTheme: MapTheme;
  activeZone: ActiveZone;
  nextZonePreview?: ActiveZone | null;
  visibleMarkers?: VisiblePlayerMarker[];
  pings?: RadarPing[];
  showTrailsForPlayers?: PlayerState[];
  viewerId?: string;
  nowMs?: number;
  /** Lobby zone editing mode */
  editableZone?: boolean;
  onZoneChange?: (zone: ActiveZone) => void;
  /** Increment to pan back to center */
  recenterSignal?: number;
  className?: string;
}

const TILE_CONFIG: Record<MapTheme, { url: string; attribution: string }> = {
  standard: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
  night: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery',
  },
  snow: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
};

export const TacticalMap: React.FC<TacticalMapProps> = ({
  center,
  mapTheme,
  activeZone,
  nextZonePreview = null,
  visibleMarkers = [],
  pings = [],
  showTrailsForPlayers = [],
  viewerId,
  nowMs = Date.now(),
  editableZone = false,
  onZoneChange,
  recenterSignal = 0,
  className = 'w-full h-full',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const zoneLayerRef = useRef<L.LayerGroup | null>(null);
  const dynamicLayerRef = useRef<L.LayerGroup | null>(null);
  const zonePropsRef = useRef({ activeZone, editableZone, onZoneChange });

  zonePropsRef.current = { activeZone, editableZone, onZoneChange };

  // Mount Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    const cfg = TILE_CONFIG[mapTheme];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      maxZoom: 19,
      attribution: cfg.attribution,
    }).addTo(map);

    zoneLayerRef.current = L.layerGroup().addTo(map);
    dynamicLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { activeZone: z, editableZone: canEdit, onZoneChange: cb } = zonePropsRef.current;
      if (!canEdit || !cb) return;
      const clicked = { lat: roundCoord(e.latlng.lat), lng: roundCoord(e.latlng.lng) };
      if (z.shape === 'circle') {
        cb({ ...z, center: clicked });
      } else if (z.shape === 'polygon') {
        cb({ ...z, polygon: [...z.polygon, clicked] });
      }
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      zoneLayerRef.current = null;
      dynamicLayerRef.current = null;
    };
  }, []);

  // Swap tile source when mapTheme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_CONFIG[mapTheme];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      maxZoom: 19,
      attribution: cfg.attribution,
    }).addTo(map);
  }, [mapTheme]);

  // Recenter when explicitly requested
  useEffect(() => {
    if (!mapRef.current || recenterSignal === 0) return;
    mapRef.current.setView([center.lat, center.lng], Math.max(mapRef.current.getZoom(), 15), {
      animate: true,
    });
  }, [recenterSignal]);

  // Render active zone, dashed preview zone, and editable vertex/center handles
  useEffect(() => {
    const group = zoneLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (activeZone.shape === 'circle') {
      L.circle([activeZone.center.lat, activeZone.center.lng], {
        radius: activeZone.diameterMeters / 2,
        color: '#10B981',
        weight: 2.5,
        fillColor: '#10B981',
        fillOpacity: 0.08,
      }).addTo(group);

      if (editableZone) {
        const pin = L.marker([activeZone.center.lat, activeZone.center.lng], {
          draggable: true,
          icon: L.divIcon({
            className: 'fk-center-pin',
            html: `<div style="width:30px;height:30px;border-radius:9999px;background:#10B981;border:3px solid #09090E;box-shadow:0 4px 14px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;color:#09090E;font-weight:800;font-size:12px;">C</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).addTo(group);

        pin.on('dragend', () => {
          const ll = pin.getLatLng();
          zonePropsRef.current.onZoneChange?.({
            ...zonePropsRef.current.activeZone,
            center: { lat: roundCoord(ll.lat), lng: roundCoord(ll.lng) },
          });
        });
      }
    } else if (activeZone.shape === 'polygon' && activeZone.polygon.length >= 3) {
      L.polygon(
        activeZone.polygon.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: '#10B981',
          weight: 2.5,
          fillColor: '#10B981',
          fillOpacity: 0.09,
        }
      ).addTo(group);

      if (editableZone) {
        activeZone.polygon.forEach((pt, idx) => {
          const marker = L.marker([pt.lat, pt.lng], {
            draggable: true,
            icon: L.divIcon({
              className: 'fk-vertex-pin',
              html: `<div style="width:28px;height:28px;border-radius:9999px;background:#06B6D4;border:3px solid #09090E;box-shadow:0 3px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:#09090E;font-weight:800;font-size:11px;font-family:JetBrains Mono,monospace;">${
                idx + 1
              }</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          }).addTo(group);

          marker.on('dragend', () => {
            const ll = marker.getLatLng();
            const current = zonePropsRef.current.activeZone;
            const nextPoly = current.polygon.map((v, i) =>
              i === idx ? { lat: roundCoord(ll.lat), lng: roundCoord(ll.lng) } : v
            );
            zonePropsRef.current.onZoneChange?.({ ...current, polygon: nextPoly });
          });
        });
      }
    }

    // Dashed preview ring/polygon showing where next shrink or Curfew zone will land
    if (nextZonePreview && nextZonePreview.shape !== 'off') {
      if (nextZonePreview.shape === 'circle') {
        L.circle([nextZonePreview.center.lat, nextZonePreview.center.lng], {
          radius: nextZonePreview.diameterMeters / 2,
          color: '#F59E0B',
          weight: 2,
          dashArray: '8 8',
          fillColor: '#F59E0B',
          fillOpacity: 0.04,
        }).addTo(group);
      } else if (nextZonePreview.shape === 'polygon' && nextZonePreview.polygon.length >= 3) {
        L.polygon(
          nextZonePreview.polygon.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: '#F59E0B',
            weight: 2,
            dashArray: '8 8',
            fillColor: '#F59E0B',
            fillOpacity: 0.04,
          }
        ).addTo(group);
      }
    }
  }, [activeZone, nextZonePreview, editableZone]);

  // Render players, radar pings, and post-round trails
  useEffect(() => {
    const group = dynamicLayerRef.current;
    if (!group) return;
    group.clearLayers();

    // Post-round GPS breadcrumb trails
    for (const p of showTrailsForPlayers) {
      if (p.trail.length >= 2) {
        L.polyline(
          p.trail.map((pt) => [pt.lat, pt.lng] as [number, number]),
          {
            color: p.color,
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }
        ).addTo(group);
      }
    }

    // Radar Ping Snapshot markers (Hunters & Spectators see these with live ticking age)
    for (const ping of pings) {
      const ageSec = Math.max(0, Math.floor((nowMs - ping.pingedAt) / 1000));
      const ageLabel =
        ageSec < 60
          ? `Pinged ${ageSec}s ago`
          : `Pinged ${Math.floor(ageSec / 60)}m ${ageSec % 60}s ago`;

      L.circle([ping.lat, ping.lng], {
        radius: 26,
        color: '#06B6D4',
        weight: 1.5,
        fillColor: '#06B6D4',
        fillOpacity: 0.16,
      }).addTo(group);

      L.marker([ping.lat, ping.lng], {
        icon: L.divIcon({
          className: 'fk-ping-marker',
          html: `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
            <div style="width:14px;height:14px;border-radius:9999px;background:#06B6D4;border:2.5px solid #09090E;box-shadow:0 0 0 3px rgba(6,182,212,0.35);"></div>
            <div style="margin-top:3px;padding:2px 6px;border-radius:6px;background:rgba(9,9,14,0.92);border:1px solid rgba(6,182,212,0.55);color:#E2E8F0;font-size:9.5px;line-height:1.2;text-align:center;white-space:nowrap;font-family:JetBrains Mono,monospace;"><div style="font-weight:700;color:#FFFFFF;">${escapeHtml(
              ping.playerName
            )}</div><div style="color:#67E8F9;font-weight:600;">${ageLabel}</div></div>
          </div>`,
          iconSize: [0, 0],
        }),
      }).addTo(group);
    }

    // Live visible player markers (already filtered by strict fog-of-war)
    for (const item of visibleMarkers) {
      const { player, position, isExposedOob, isEmergencyPin, isDelayed } = item;
      const isSelf = player.id === viewerId;
      const badgeColor = isEmergencyPin
        ? '#DC2626'
        : isExposedOob
        ? '#F59E0B'
        : player.role === 'hunter'
        ? '#EF4444'
        : '#10B981';
      const subLabel = isEmergencyPin
        ? 'SOS EMERGENCY'
        : isExposedOob
        ? 'EXPOSED (OOB)'
        : isSelf
        ? 'YOU'
        : isDelayed
        ? '1m DELAY'
        : player.role.toUpperCase();

      L.marker([position.lat, position.lng], {
        zIndexOffset: isEmergencyPin ? 1000 : isSelf ? 500 : 100,
        icon: L.divIcon({
          className: 'fk-player-marker',
          html: `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
            <div style="width:${isSelf ? 20 : 16}px;height:${
            isSelf ? 20 : 16
          }px;border-radius:9999px;background:${badgeColor};border:3px solid #FFFFFF;box-shadow:0 3px 12px rgba(0,0,0,0.7);"></div>
            <div style="margin-top:4px;padding:2px 6px;border-radius:6px;background:rgba(9,9,14,0.92);border:1px solid ${badgeColor};color:#F8FAFC;font-size:10px;font-weight:700;white-space:nowrap;">${escapeHtml(
              player.name
            )} <span style="color:${badgeColor};margin-left:3px;">${subLabel}</span></div>
          </div>`,
          iconSize: [0, 0],
        }),
      }).addTo(group);
    }
  }, [visibleMarkers, pings, showTrailsForPlayers, viewerId, nowMs]);

  const themeClass =
    mapTheme === 'night'
      ? 'fk-map-night'
      : mapTheme === 'snow'
      ? 'fk-map-snow'
      : '';

  return (
    <div
      ref={containerRef}
      data-testid="tactical-map"
      data-theme={mapTheme}
      className={`${className} ${themeClass} relative z-0`}
    />
  );
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
