import { Canvas, Circle, Line } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import { loadWindTiles, sampleWind, visibleWindTiles, type WindFieldTile } from "../wind/met-wind";

type WindOverlayProps = {
  center: [number, number];
  zoom: number;
  bearing: number;
  enabled?: boolean;
};

type Particle = { longitude: number; latitude: number; east: number; north: number; age: number; opacity: number };
type Segment = { x1: number; y1: number; x2: number; y2: number; opacity: number; speed: number };

const PARTICLE_COUNT = 180;
const MAX_TILE_ZOOM = 6;
const METERS_PER_DEGREE = 111_320;

function project(coordinate: [number, number], center: [number, number], zoom: number, bearing: number, width: number, height: number) {
  const world = 256 * 2 ** Math.max(0, zoom);
  const latitudeY = (latitude: number) => {
    const clamped = Math.max(-85.051129, Math.min(85.051129, latitude));
    const phi = (clamped * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world;
  };
  let deltaLongitude = coordinate[0] - center[0];
  if (deltaLongitude > 180) deltaLongitude -= 360;
  if (deltaLongitude < -180) deltaLongitude += 360;
  const x = (deltaLongitude * world) / 360 + width / 2;
  const y = latitudeY(coordinate[1]) - latitudeY(center[1]) + height / 2;
  const angle = (-bearing * Math.PI) / 180;
  const dx = x - width / 2;
  const dy = y - height / 2;
  return { x: width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), y: height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

function seedParticles(tiles: WindFieldTile[], center: [number, number], zoom: number) {
  const span = 70 / Math.max(1, 2 ** (zoom - 4));
  const particles: Particle[] = [];
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const longitude = center[0] + (Math.sin(index * 12.9898) * 0.5 + 0.5 - 0.5) * span;
    const latitude = center[1] + (Math.sin(index * 78.233) * 0.5 + 0.5 - 0.5) * span * 0.55;
    const vector = sampleWind(tiles, longitude, latitude);
    if (vector && Number.isFinite(vector.east) && Number.isFinite(vector.north)) particles.push({ longitude, latitude, ...vector, age: (index * 17) % 90, opacity: 0.25 + (index % 5) * 0.11 });
  }
  return particles;
}

export function WindOverlay({ center, zoom, bearing, enabled = true }: WindOverlayProps) {
  const { width, height } = useWindowDimensions();
  const [tiles, setTiles] = useState<WindFieldTile[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const particles = useRef<Particle[]>([]);
  const generation = useRef(0);
  const lastTile = useRef("");
  const appActive = useRef(AppState.currentState === "active");
  const fps = useRef({ frames: 0, startedAt: Date.now() });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      appActive.current = state === "active";
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled) { setTiles([]); particles.current = []; return; }
    const tileZoom = Math.min(MAX_TILE_ZOOM, Math.max(0, Math.round(zoom)));
    const requestedTiles = visibleWindTiles(center, tileZoom, width, height);
    const key = requestedTiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`).join(",");
    if (lastTile.current === key && tiles.length) return;
    lastTile.current = key;
    const requestGeneration = ++generation.current;
    void loadWindTiles(requestedTiles).then((loaded) => {
      if (requestGeneration !== generation.current) return;
      setTiles(loaded);
      particles.current = seedParticles(loaded, center, zoom);
    }).catch(() => { if (requestGeneration === generation.current) setTiles([]); });
  }, [center, zoom, enabled, width, height]);

  const frame = useMemo(() => ({ center, zoom, bearing, width, height }), [center, zoom, bearing, width, height]);
  useEffect(() => {
    if (!enabled || !tiles.length) return;
    let raf = 0;
    let previous = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (appActive.current) {
        fps.current.frames += 1;
        if (now - fps.current.startedAt >= 5000) {
          if (__DEV__) console.info(`[WindOverlay] FPS ~${Math.round((fps.current.frames * 1000) / (now - fps.current.startedAt))}; tiles=${tiles.length}; particles=${particles.current.length}`);
          fps.current = { frames: 0, startedAt: now };
        }
        const next: Segment[] = [];
        for (const particle of particles.current) {
          const old = project([particle.longitude, particle.latitude], frame.center, frame.zoom, frame.bearing, frame.width, frame.height);
          const meters = Math.max(0, Math.hypot(particle.east, particle.north)) * dt;
          particle.longitude += (particle.east * dt) / (METERS_PER_DEGREE * Math.max(0.25, Math.cos((particle.latitude * Math.PI) / 180)));
          particle.latitude += (particle.north * dt) / METERS_PER_DEGREE;
          particle.age += dt * 10;
          const nextVector = sampleWind(tiles, particle.longitude, particle.latitude);
          if (nextVector) { particle.east = nextVector.east; particle.north = nextVector.north; }
          const current = project([particle.longitude, particle.latitude], frame.center, frame.zoom, frame.bearing, frame.width, frame.height);
          if (particle.age > 100 || current.x < -20 || current.x > frame.width + 20 || current.y < -20 || current.y > frame.height + 20) {
            particle.longitude = frame.center[0] + (Math.random() - 0.5) * 30;
            particle.latitude = frame.center[1] + (Math.random() - 0.5) * 20;
            particle.age = 0;
          } else if (meters > 0.05 && nextVector) next.push({ x1: old.x, y1: old.y, x2: current.x, y2: current.y, opacity: particle.opacity, speed: Math.hypot(particle.east, particle.north) });
        }
        setSegments(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, tiles, frame]);

  if (!enabled || !tiles.length) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Canvas style={StyleSheet.absoluteFill}><>{segments.map((segment, index) => {
    const normalized = Math.max(0, Math.min(1, segment.speed / 20));
    const red = Math.round(70 + 180 * normalized);
    const green = Math.round(205 - 125 * normalized);
    const blue = Math.round(225 - 150 * normalized);
    const color = `rgba(${red},${green},${blue},${Math.min(0.95, segment.opacity + 0.25)})`;
    return <Line key={index} p1={{ x: segment.x1, y: segment.y1 }} p2={{ x: segment.x2, y: segment.y2 }} color={color} strokeWidth={1.4 + normalized * 1.4} />;
  })}{segments.map((segment, index) => <Circle key={`dot-${index}`} cx={segment.x2} cy={segment.y2} r={1.1} color="rgba(255,255,255,0.7)" />)}</></Canvas></View>;
}
