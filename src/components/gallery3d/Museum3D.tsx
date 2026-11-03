'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type Drawing = { id: string; slug: string; title: string; imageUrl: string };
export type Craft = {
  id: string;
  slug: string;
  title: string;
  modelUrl: string | null;
  imageUrl: string | null;
};
export type Scan = Craft;

type Focus = { title: string; slug: string } | null;

type Quality = 'low' | 'balanced' | 'high';

type QualityProfile = {
  dpr: [number, number];
  shadows: boolean;
  spotlightLimit: number;
  fog: [number, number];
  modelRotation: boolean;
};

const QUALITY: Record<Quality, QualityProfile> = {
  low: { dpr: [1, 1], shadows: false, spotlightLimit: 4, fog: [10, 28], modelRotation: false },
  balanced: { dpr: [1, 1.5], shadows: false, spotlightLimit: 8, fog: [16, 48], modelRotation: true },
  high: { dpr: [1, 2], shadows: true, spotlightLimit: 16, fog: [22, 70], modelRotation: true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Museum layout — rooms, corridors, door openings, walkable rectangles
// ─────────────────────────────────────────────────────────────────────────────

type Rect = { cx: number; cz: number; w: number; d: number };
type Room = Rect & {
  id: string;
  name: string;
  height: number;
  doors: { side: 'N' | 'S' | 'E' | 'W'; width: number }[];
};
// `axis` is the direction of travel through the corridor: 'z' = north-south,
// 'x' = east-west. It is explicit (not inferred from w/d) so that short-but-wide
// connectors render their walls on the correct sides instead of sealing the passage.
type Corridor = Rect & { height: number; axis: 'x' | 'z' };

const DOOR_W = 4;
const WALL_T = 0.25;
const ROOM_H = 5;

const LOBBY: Room = {
  id: 'lobby',
  name: 'Entrance Lobby',
  cx: 0,
  cz: 0,
  w: 16,
  d: 14,
  height: ROOM_H,
  doors: [
    { side: 'N', width: DOOR_W },
    { side: 'E', width: DOOR_W },
    { side: 'W', width: DOOR_W },
    { side: 'S', width: DOOR_W },
  ],
};

const DRAWING: Room = {
  id: 'drawings',
  name: 'Drawing Gallery',
  cx: 0,
  cz: -22,
  w: 24,
  d: 24,
  height: ROOM_H,
  doors: [{ side: 'S', width: DOOR_W }],
};

const CRAFTS: Room = {
  id: 'crafts',
  name: '3D Crafting Hall',
  cx: 22,
  cz: 0,
  w: 20,
  d: 20,
  height: ROOM_H,
  doors: [{ side: 'W', width: DOOR_W }],
};

const SCANS: Room = {
  id: 'scans',
  name: 'Scan Showcase',
  cx: -22,
  cz: 0,
  w: 20,
  d: 20,
  height: ROOM_H,
  doors: [{ side: 'E', width: DOOR_W }],
};

const EXPORT_ROOM: Room = {
  id: 'export',
  name: 'Export & AR Room',
  cx: 0,
  cz: 18,
  w: 18,
  d: 16,
  height: ROOM_H,
  doors: [{ side: 'N', width: DOOR_W }],
};

const ROOMS: Room[] = [LOBBY, DRAWING, CRAFTS, SCANS, EXPORT_ROOM];

// Corridors connect lobby door edges to neighbor room door edges.
// Lobby half-extents: w/2 = 8, d/2 = 7. `axis` is the travel direction; for N/S
// connectors the depth (d) is the short span and the width (w) matches the door.
const CORRIDORS: Corridor[] = [
  { cx: 0, cz: -8.5, w: DOOR_W, d: 3, height: ROOM_H, axis: 'z' }, // lobby N → drawings S (drawings south = -22+12 = -10)
  { cx: 10, cz: 0, w: 4, d: DOOR_W, height: ROOM_H, axis: 'x' }, // lobby E → crafts W (crafts west = 22-10 = 12)
  { cx: -10, cz: 0, w: 4, d: DOOR_W, height: ROOM_H, axis: 'x' }, // lobby W → scans E (scans east = -22+10 = -12)
  { cx: 0, cz: 8.5, w: DOOR_W, d: 3, height: ROOM_H, axis: 'z' }, // lobby S → export N (export north = 18-8 = 10)
];

// Walkable rectangles (XZ): rooms + corridors. Player position must lie within at least one.
const WALKABLE: Rect[] = [...ROOMS, ...CORRIDORS];

// Dev-only sanity check: each corridor should bridge two rooms. We verify that its
// two ends along the travel axis each land inside a room footprint, which catches
// layout drift where a connector no longer reaches the rooms it is meant to join.
function validateCorridors() {
  if (process.env.NODE_ENV === 'production') return;
  for (const c of CORRIDORS) {
    const half = (c.axis === 'z' ? c.d : c.w) / 2;
    const ends: [number, number][] =
      c.axis === 'z'
        ? [
            [c.cx, c.cz - half],
            [c.cx, c.cz + half],
          ]
        : [
            [c.cx - half, c.cz],
            [c.cx + half, c.cz],
          ];
    const touching = ends.filter(([ex, ez]) =>
      ROOMS.some(
        (r) =>
          ex >= r.cx - r.w / 2 &&
          ex <= r.cx + r.w / 2 &&
          ez >= r.cz - r.d / 2 &&
          ez <= r.cz + r.d / 2,
      ),
    ).length;
    if (touching < 2) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Museum3D] Corridor at (${c.cx}, ${c.cz}) reaches ${touching}/2 rooms; check layout.`,
      );
    }
  }
}
validateCorridors();

// ─────────────────────────────────────────────────────────────────────────────
// Procedural textures (CanvasTexture) — generated once
// ─────────────────────────────────────────────────────────────────────────────

function makeCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function useFloorTexture(tint = '#d8cdb8') {
  return useMemo(() => {
    const t = makeCanvas(512, (ctx, s) => {
      // Warm marble base
      const base = ctx.createLinearGradient(0, 0, s, s);
      base.addColorStop(0, tint);
      base.addColorStop(0.5, '#c9bda5');
      base.addColorStop(1, '#b9ad95');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      // Cloudy veining
      for (let n = 0; n < 18; n++) {
        ctx.strokeStyle = `rgba(90,70,50,${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 1 + Math.random() * 2.5;
        ctx.beginPath();
        let x = Math.random() * s;
        let y = Math.random() * s;
        ctx.moveTo(x, y);
        const steps = 8 + Math.floor(Math.random() * 10);
        for (let i = 0; i < steps; i++) {
          x += (Math.random() - 0.5) * s * 0.25;
          y += (Math.random() - 0.5) * s * 0.25;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Rose-gold thin veins
      for (let n = 0; n < 6; n++) {
        ctx.strokeStyle = `rgba(160,110,80,${0.07 + Math.random() * 0.06})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        let x = Math.random() * s;
        let y = Math.random() * s;
        ctx.moveTo(x, y);
        for (let i = 0; i < 14; i++) {
          x += (Math.random() - 0.5) * s * 0.2;
          y += (Math.random() - 0.5) * s * 0.2;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Large slab seams (2x2 within each tile)
      const slab = s / 2;
      ctx.strokeStyle = 'rgba(40,28,18,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * slab);
        ctx.lineTo(s, i * slab);
        ctx.moveTo(i * slab, 0);
        ctx.lineTo(i * slab, s);
        ctx.stroke();
      }
      // Fine sparkle
      for (let n = 0; n < 220; n++) {
        ctx.fillStyle = `rgba(255,250,235,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
    });
    t.repeat.set(4, 4);
    return t;
  }, [tint]);
}

function useWallTexture(tint = '#efe7d2') {
  return useMemo(() => {
    const t = makeCanvas(512, (ctx, s) => {
      // Warm limestone gradient
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#f6efdb');
      grad.addColorStop(0.5, tint);
      grad.addColorStop(1, '#e2d8be');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      // Soft cloudy variation
      for (let n = 0; n < 24; n++) {
        const r = 60 + Math.random() * 120;
        const x = Math.random() * s;
        const y = Math.random() * s;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(120,90,55,${0.02 + Math.random() * 0.04})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // Faint vertical panel seams
      ctx.strokeStyle = 'rgba(70,50,30,0.07)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((i * s) / 3, 0);
        ctx.lineTo((i * s) / 3, s);
        ctx.stroke();
      }
      // Fine grain
      for (let n = 0; n < 1500; n++) {
        ctx.fillStyle = `rgba(80,55,30,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
    });
    t.repeat.set(2, 1);
    return t;
  }, [tint]);
}

function useCeilingTexture() {
  return useMemo(() => {
    const t = makeCanvas(512, (ctx, s) => {
      // Coffered ceiling: 3x3 panels with shadowed recesses and gilded trim
      ctx.fillStyle = '#3a3327';
      ctx.fillRect(0, 0, s, s);
      const cells = 3;
      const cell = s / cells;
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const x = i * cell;
          const y = j * cell;
          // Recessed panel inside
          const pad = cell * 0.12;
          // Recess shadow
          ctx.fillStyle = '#1d1812';
          ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
          // Inner panel highlight
          const inner = ctx.createRadialGradient(
            x + cell / 2,
            y + cell / 2,
            cell * 0.1,
            x + cell / 2,
            y + cell / 2,
            cell * 0.55,
          );
          inner.addColorStop(0, '#5a4d36');
          inner.addColorStop(1, '#241d14');
          ctx.fillStyle = inner;
          ctx.fillRect(x + pad * 1.6, y + pad * 1.6, cell - pad * 3.2, cell - pad * 3.2);
          // Gilded medallion at center
          const cxp = x + cell / 2;
          const cyp = y + cell / 2;
          const med = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, cell * 0.13);
          med.addColorStop(0, 'rgba(220,180,100,0.95)');
          med.addColorStop(1, 'rgba(160,120,60,0)');
          ctx.fillStyle = med;
          ctx.beginPath();
          ctx.arc(cxp, cyp, cell * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Gilded trim along beams
      ctx.strokeStyle = 'rgba(200,160,90,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= cells; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(s, i * cell);
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, s);
        ctx.stroke();
      }
    });
    t.repeat.set(2, 2);
    return t;
  }, []);
}

function makeLabelTexture(title: string, subtitle?: string) {
  const w = 512;
  const h = 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  // Plate background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f7efdc');
  grad.addColorStop(1, '#d9c89c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#5b4a2a';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  // Text
  ctx.fillStyle = '#2a1f10';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.textBaseline = 'top';
  wrapText(ctx, title, 24, 28, w - 48, 48);
  if (subtitle) {
    ctx.font = 'italic 22px Georgia, serif';
    ctx.fillStyle = '#3b2c14';
    ctx.fillText(subtitle, 24, h - 44);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSignTexture(line1: string, line2?: string) {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#161310';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#caa86a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#f4e3b8';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line1, w / 2, line2 ? h / 2 - 28 : h / 2);
  if (line2) {
    ctx.font = '32px Georgia, serif';
    ctx.fillStyle = '#d6c69a';
    ctx.fillText(line2, w / 2, h / 2 + 36);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line, x, yy);
      line = words[n] + ' ';
      yy += lineHeight;
      if (yy > y + lineHeight * 2) break; // cap to 3 lines
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collision: walkable union + obstacles
// ─────────────────────────────────────────────────────────────────────────────

const PLAYER_R = 0.45;

function inRect(x: number, z: number, r: Rect, pad = 0): boolean {
  return (
    x >= r.cx - r.w / 2 + pad &&
    x <= r.cx + r.w / 2 - pad &&
    z >= r.cz - r.d / 2 + pad &&
    z <= r.cz + r.d / 2 - pad
  );
}

// Returns true if the circle (x,z,r) is fully inside the union of walkable rects.
function inWalkable(x: number, z: number, r = PLAYER_R): boolean {
  // Test the four cardinal extremes; if all four lie in some walkable rect, accept.
  const pts: [number, number][] = [
    [x + r, z],
    [x - r, z],
    [x, z + r],
    [x, z - r],
  ];
  for (const [px, pz] of pts) {
    let ok = false;
    for (const w of WALKABLE) {
      if (inRect(px, pz, w)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

function hitsObstacle(x: number, z: number, obstacles: Rect[], r = PLAYER_R): boolean {
  for (const o of obstacles) {
    const dx = Math.max(o.cx - o.w / 2 - x, 0, x - (o.cx + o.w / 2));
    const dz = Math.max(o.cz - o.d / 2 - z, 0, z - (o.cz + o.d / 2));
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry pieces
// ─────────────────────────────────────────────────────────────────────────────

function FloorTile({ rect, tint }: { rect: Rect; tint?: string }) {
  const tex = useFloorTexture(tint);
  return (
    <mesh
      receiveShadow
      position={[rect.cx, 0, rect.cz]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[rect.w, rect.d]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}

function CeilingTile({ rect, height }: { rect: Rect; height: number }) {
  const tex = useCeilingTexture();
  return (
    <mesh position={[rect.cx, height, rect.cz]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[rect.w, rect.d]} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

function WallSegment({
  cx,
  cz,
  length,
  height,
  axis, // 'x' = wall runs along x; 'z' = wall runs along z
  tex,
}: {
  cx: number;
  cz: number;
  length: number;
  height: number;
  axis: 'x' | 'z';
  tex: THREE.Texture;
}) {
  const sizeX = axis === 'x' ? length : WALL_T;
  const sizeZ = axis === 'z' ? length : WALL_T;
  return (
    <mesh position={[cx, height / 2, cz]} castShadow={false} receiveShadow>
      <boxGeometry args={[sizeX, height, sizeZ]} />
      <meshStandardMaterial map={tex} roughness={0.92} />
    </mesh>
  );
}

function Baseboard({
  cx,
  cz,
  length,
  axis,
}: {
  cx: number;
  cz: number;
  length: number;
  axis: 'x' | 'z';
}) {
  const sizeX = axis === 'x' ? length : WALL_T + 0.06;
  const sizeZ = axis === 'z' ? length : WALL_T + 0.06;
  return (
    <group>
      <mesh position={[cx, 0.1, cz]}>
        <boxGeometry args={[sizeX, 0.2, sizeZ]} />
        <meshStandardMaterial color="#3a2e1c" roughness={0.7} />
      </mesh>
      {/* Top molding accent */}
      <mesh position={[cx, 0.22, cz]}>
        <boxGeometry args={[sizeX, 0.04, sizeZ + 0.02]} />
        <meshStandardMaterial color="#5a4423" roughness={0.55} metalness={0.15} />
      </mesh>
    </group>
  );
}

function CrownMolding({
  cx,
  cz,
  length,
  axis,
  height,
}: {
  cx: number;
  cz: number;
  length: number;
  axis: 'x' | 'z';
  height: number;
}) {
  const sizeX = axis === 'x' ? length : WALL_T + 0.18;
  const sizeZ = axis === 'z' ? length : WALL_T + 0.18;
  return (
    <group>
      <mesh position={[cx, height - 0.22, cz]}>
        <boxGeometry args={[sizeX, 0.32, sizeZ]} />
        <meshStandardMaterial color="#efe2c1" roughness={0.6} />
      </mesh>
      <mesh position={[cx, height - 0.07, cz]}>
        <boxGeometry args={[sizeX + 0.02, 0.06, sizeZ + 0.02]} />
        <meshStandardMaterial color="#d2b06c" roughness={0.4} metalness={0.35} />
      </mesh>
    </group>
  );
}

function DadoRail({
  cx,
  cz,
  length,
  axis,
}: {
  cx: number;
  cz: number;
  length: number;
  axis: 'x' | 'z';
}) {
  const sizeX = axis === 'x' ? length : WALL_T + 0.06;
  const sizeZ = axis === 'z' ? length : WALL_T + 0.06;
  return (
    <mesh position={[cx, 1.1, cz]}>
      <boxGeometry args={[sizeX, 0.08, sizeZ]} />
      <meshStandardMaterial color="#c8b282" roughness={0.55} metalness={0.2} />
    </mesh>
  );
}

function Pilaster({
  cx,
  cz,
  height,
  axis, // wall orientation: 'x' means the wall runs along X, so the pilaster faces +/- Z
}: {
  cx: number;
  cz: number;
  height: number;
  axis: 'x' | 'z';
}) {
  // A flat decorative column attached to a wall.
  const w = axis === 'x' ? 0.45 : 0.18;
  const d = axis === 'x' ? 0.18 : 0.45;
  return (
    <group position={[cx, 0, cz]}>
      {/* Base */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[w + 0.1, 0.36, d + 0.1]} />
        <meshStandardMaterial color="#e8dcbe" roughness={0.7} />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, height / 2 + 0.05, 0]}>
        <boxGeometry args={[w, height - 0.7, d]} />
        <meshStandardMaterial color="#f1e6cb" roughness={0.7} />
      </mesh>
      {/* Capital */}
      <mesh position={[0, height - 0.4, 0]}>
        <boxGeometry args={[w + 0.16, 0.18, d + 0.16]} />
        <meshStandardMaterial color="#efe2c1" roughness={0.55} />
      </mesh>
      {/* Gilded fillet under capital */}
      <mesh position={[0, height - 0.52, 0]}>
        <boxGeometry args={[w + 0.08, 0.04, d + 0.08]} />
        <meshStandardMaterial color="#caa86a" roughness={0.4} metalness={0.45} />
      </mesh>
    </group>
  );
}

function DoorPediment({
  cx,
  cz,
  axis,
  width,
  height,
}: {
  cx: number;
  cz: number;
  axis: 'x' | 'z';
  width: number;
  height: number;
}) {
  const beamSizeX = axis === 'x' ? width + 1.0 : 0.5;
  const beamSizeZ = axis === 'z' ? width + 1.0 : 0.5;
  const archSizeX = axis === 'x' ? width + 0.4 : 0.55;
  const archSizeZ = axis === 'z' ? width + 0.4 : 0.55;
  // Side jambs flanking the door opening
  const jambDepth = WALL_T + 0.1;
  const jambW = axis === 'x' ? 0.28 : jambDepth;
  const jambD = axis === 'z' ? 0.28 : jambDepth;
  const halfDoor = width / 2;
  const jambOffset = halfDoor + 0.14;
  return (
    <group>
      {/* Architrave (main horizontal beam) */}
      <mesh position={[cx, height - 0.25, cz]}>
        <boxGeometry args={[beamSizeX, 0.5, beamSizeZ]} />
        <meshStandardMaterial color="#f1e6cb" roughness={0.6} />
      </mesh>
      {/* Cornice strip above */}
      <mesh position={[cx, height + 0.04, cz]}>
        <boxGeometry args={[beamSizeX + 0.12, 0.1, beamSizeZ + 0.12]} />
        <meshStandardMaterial color="#caa86a" roughness={0.45} metalness={0.4} />
      </mesh>
      {/* Triangular pediment cap */}
      <mesh
        position={[cx, height + 0.32, cz]}
        rotation={axis === 'x' ? [0, 0, 0] : [0, Math.PI / 2, 0]}
      >
        <coneGeometry args={[archSizeX / 1.6, 0.5, 3]} />
        <meshStandardMaterial color="#f1e6cb" roughness={0.6} />
      </mesh>
      {/* Side jambs */}
      <mesh
        position={[
          axis === 'x' ? cx - jambOffset : cx,
          (height - 0.5) / 2 + 0.05,
          axis === 'z' ? cz - jambOffset : cz,
        ]}
      >
        <boxGeometry args={[jambW, height - 0.5, jambD]} />
        <meshStandardMaterial color="#efe2c1" roughness={0.65} />
      </mesh>
      <mesh
        position={[
          axis === 'x' ? cx + jambOffset : cx,
          (height - 0.5) / 2 + 0.05,
          axis === 'z' ? cz + jambOffset : cz,
        ]}
      >
        <boxGeometry args={[jambW, height - 0.5, jambD]} />
        <meshStandardMaterial color="#efe2c1" roughness={0.65} />
      </mesh>
    </group>
  );
}

// Renders a room's four walls with door openings cut out, plus baseboards and door frames.
function RoomWalls({ room }: { room: Room }) {
  const tex = useWallTexture();
  const halfW = room.w / 2;
  const halfD = room.d / 2;
  const segments: React.ReactNode[] = [];
  const baseboards: React.ReactNode[] = [];
  const crowns: React.ReactNode[] = [];
  const dados: React.ReactNode[] = [];
  const doorFrames: React.ReactNode[] = [];
  const pilasters: React.ReactNode[] = [];

  // Helper: emit wall along a side, splitting where doors exist.
  const emitSide = (
    side: 'N' | 'S' | 'E' | 'W',
    fixedCoord: number, // z for N/S, x for E/W
    fromAxis: number, // start along the variable axis
    toAxis: number,
    axis: 'x' | 'z',
  ) => {
    const door = room.doors.find((d) => d.side === side);
    const variableCenter = (a: number, b: number) => (a + b) / 2;
    const variableLen = (a: number, b: number) => Math.abs(b - a);
    const segs: { from: number; to: number }[] = [];
    if (door) {
      const halfDoor = door.width / 2;
      segs.push({ from: fromAxis, to: 0 - halfDoor });
      segs.push({ from: 0 + halfDoor, to: toAxis });
      // Classical pediment over the door
      doorFrames.push(
        <DoorPediment
          key={`df-${room.id}-${side}`}
          cx={axis === 'x' ? 0 : fixedCoord}
          cz={axis === 'z' ? 0 : fixedCoord}
          axis={axis}
          width={door.width}
          height={room.height}
        />,
      );
    } else {
      segs.push({ from: fromAxis, to: toAxis });
    }
    for (const s of segs) {
      const mid = variableCenter(s.from, s.to);
      const len = variableLen(s.from, s.to);
      if (len <= 0.05) continue;
      const cx = axis === 'x' ? mid : fixedCoord;
      const cz = axis === 'z' ? mid : fixedCoord;
      segments.push(
        <WallSegment
          key={`w-${room.id}-${side}-${s.from}-${s.to}`}
          cx={cx}
          cz={cz}
          length={len}
          height={room.height}
          axis={axis}
          tex={tex}
        />,
      );
      baseboards.push(
        <Baseboard
          key={`b-${room.id}-${side}-${s.from}-${s.to}`}
          cx={cx}
          cz={cz}
          length={len}
          axis={axis}
        />,
      );
      crowns.push(
        <CrownMolding
          key={`c-${room.id}-${side}-${s.from}-${s.to}`}
          cx={cx}
          cz={cz}
          length={len}
          axis={axis}
          height={room.height}
        />,
      );
      // Dado rails only on long segments to avoid clutter near doors
      if (len > 3) {
        dados.push(
          <DadoRail
            key={`d-${room.id}-${side}-${s.from}-${s.to}`}
            cx={cx}
            cz={cz}
            length={len}
            axis={axis}
          />,
        );
      }
    }
  };

  // Walls in room-local coordinates, then offset by room center.
  // North side: z = -halfD, axis = x
  emitSide('N', -halfD, -halfW, halfW, 'x');
  emitSide('S', halfD, -halfW, halfW, 'x');
  emitSide('W', -halfW, -halfD, halfD, 'z');
  emitSide('E', halfW, -halfD, halfD, 'z');

  // Pilasters near the four interior corners and flanking door openings.
  const inset = 0.55;
  pilasters.push(
    <Pilaster key={`p-${room.id}-nw`} cx={-halfW + inset} cz={-halfD + inset} height={room.height} axis="x" />,
    <Pilaster key={`p-${room.id}-ne`} cx={halfW - inset} cz={-halfD + inset} height={room.height} axis="x" />,
    <Pilaster key={`p-${room.id}-sw`} cx={-halfW + inset} cz={halfD - inset} height={room.height} axis="x" />,
    <Pilaster key={`p-${room.id}-se`} cx={halfW - inset} cz={halfD - inset} height={room.height} axis="x" />,
  );

  // Apply room center offset by wrapping in a group.
  return (
    <group position={[room.cx, 0, room.cz]}>
      {segments}
      {baseboards}
      {dados}
      {crowns}
      {doorFrames}
      {pilasters}
    </group>
  );
}

function CorridorBox({ c }: { c: Corridor }) {
  const wallTex = useWallTexture('#e5dcc6');
  // Corridor is open-ended along its travel axis; walls go only on the long sides.
  // Use the explicit axis so the open ends always face the rooms being connected.
  const isNS = c.axis === 'z'; // runs north-south
  const halfLen = (isNS ? c.d : c.w) / 2;
  const sideOffset = (isNS ? c.w : c.d) / 2 + WALL_T / 2;
  return (
    <group position={[c.cx, 0, c.cz]}>
      {/* Long-side walls */}
      {isNS ? (
        <>
          <WallSegment cx={-sideOffset} cz={0} length={c.d} height={c.height} axis="z" tex={wallTex} />
          <WallSegment cx={sideOffset} cz={0} length={c.d} height={c.height} axis="z" tex={wallTex} />
          <Baseboard cx={-sideOffset} cz={0} length={c.d} axis="z" />
          <Baseboard cx={sideOffset} cz={0} length={c.d} axis="z" />
        </>
      ) : (
        <>
          <WallSegment cx={0} cz={-sideOffset} length={c.w} height={c.height} axis="x" tex={wallTex} />
          <WallSegment cx={0} cz={sideOffset} length={c.w} height={c.height} axis="x" tex={wallTex} />
          <Baseboard cx={0} cz={-sideOffset} length={c.w} axis="x" />
          <Baseboard cx={0} cz={sideOffset} length={c.w} axis="x" />
        </>
      )}
      <FloorTile rect={{ cx: 0, cz: 0, w: c.w, d: c.d }} tint="#34302a" />
      <CeilingTile rect={{ cx: 0, cz: 0, w: c.w, d: c.d }} height={c.height} />
      {/* small ceiling light */}
      <pointLight position={[0, c.height - 0.3, 0]} intensity={0.5} distance={Math.max(c.w, c.d) * 1.6} color="#fff1d8" />
      <mesh position={[0, c.height - 0.05, 0]}>
        <boxGeometry args={[0.6, 0.05, 0.6]} />
        <meshStandardMaterial color="#ffeeb8" emissive="#ffeeb8" emissiveIntensity={0.7} />
      </mesh>
      {/* Directional sign at far end */}
      <DirectionalSign axis={isNS ? 'z' : 'x'} length={halfLen} />
    </group>
  );
}

function DirectionalSign({ axis, length }: { axis: 'x' | 'z'; length: number }) {
  // Hangs from ceiling near the far end of the corridor toward the destination.
  // We don't know which end is "far" generically, so place one at each end.
  const tex = useMemo(() => makeSignTexture('Gallery', '↑ this way'), []);
  const yPos = 3.4;
  return (
    <>
      <mesh
        position={axis === 'z' ? [0, yPos, -length + 0.4] : [-length + 0.4, yPos, 0]}
        rotation={axis === 'z' ? [0, 0, 0] : [0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[1.6, 0.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        position={axis === 'z' ? [0, yPos, length - 0.4] : [length - 0.4, yPos, 0]}
        rotation={axis === 'z' ? [0, Math.PI, 0] : [0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[1.6, 0.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby props: welcome sign, benches, info plaques
// ─────────────────────────────────────────────────────────────────────────────

function Bench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.6, 0.08, 0.45]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.7} />
      </mesh>
      <mesh position={[-0.7, 0.22, 0]}>
        <boxGeometry args={[0.08, 0.45, 0.45]} />
        <meshStandardMaterial color="#1d1410" />
      </mesh>
      <mesh position={[0.7, 0.22, 0]}>
        <boxGeometry args={[0.08, 0.45, 0.45]} />
        <meshStandardMaterial color="#1d1410" />
      </mesh>
    </group>
  );
}

function WallSign({
  position,
  rotationY = 0,
  line1,
  line2,
  width = 2.8,
  height = 1.4,
}: {
  position: [number, number, number];
  rotationY?: number;
  line1: string;
  line2?: string;
  width?: number;
  height?: number;
}) {
  const tex = useMemo(() => makeSignTexture(line1, line2), [line1, line2]);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Lobby() {
  return (
    <group position={[LOBBY.cx, 0, LOBBY.cz]}>
      {/* Welcome sign on the south wall (the wall the player faces when spawning) */}
      <WallSign position={[0, 3.55, LOBBY.d / 2 - 0.13]} rotationY={Math.PI} line1="Hei Gallery" line2="welcome" />

      {/* Directional signs near each doorway */}
      <WallSign
        position={[-LOBBY.w / 2 + 0.13, 2.4, 0]}
        rotationY={Math.PI / 2}
        line1="Scan Showcase"
        line2="←"
        width={2.4}
        height={1.2}
      />
      <WallSign
        position={[LOBBY.w / 2 - 0.13, 2.4, 0]}
        rotationY={-Math.PI / 2}
        line1="3D Crafting Hall"
        line2="→"
        width={2.4}
        height={1.2}
      />
      <WallSign
        position={[0, 2.4, -LOBBY.d / 2 + 0.13]}
        line1="Drawing Gallery"
        line2="↑"
        width={2.4}
        height={1.2}
      />
      <WallSign
        position={[LOBBY.w / 2 - 2.85, 2.15, LOBBY.d / 2 - 0.13]}
        rotationY={Math.PI}
        line1="Export & AR"
        line2="↓"
        width={2.0}
        height={1.0}
      />

      {/* Benches in the corners */}
      <Bench position={[-5, 0, -3]} rotationY={Math.PI / 2} />
      <Bench position={[5, 0, -3]} rotationY={-Math.PI / 2} />

      {/* Soft hemispheric feel via two warm point lights */}
      <pointLight position={[0, LOBBY.height - 0.4, 0]} intensity={0.7} distance={20} color="#ffe9c2" />
      <pointLight position={[0, LOBBY.height - 0.4, 4]} intensity={0.4} distance={14} color="#ffe9c2" />

      {/* Central plinth with a placard */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.45, 0.5, 1.1, 24]} />
          <meshStandardMaterial color="#1f1a16" roughness={0.7} />
        </mesh>
        <PlinthLabel position={[0, 1.35, 0]} title="Hei Gallery" subtitle="A young artist's collection" />
      </group>
    </group>
  );
}

function PlinthLabel({
  position,
  title,
  subtitle,
}: {
  position: [number, number, number];
  title: string;
  subtitle?: string;
}) {
  const tex = useMemo(() => makeLabelTexture(title, subtitle), [title, subtitle]);
  return (
    <mesh position={position} rotation={[-Math.PI / 8, 0, 0]}>
      <planeGeometry args={[0.85, 0.32]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing gallery — framed wall art with mat board, plaque, spotlight
// ─────────────────────────────────────────────────────────────────────────────

function DrawingGallery({ drawings }: { drawings: Drawing[] }) {
  // Place along the long walls (east/west walls of the drawings room).
  const slots = useMemo(() => buildDrawingSlots(drawings.length), [drawings.length]);
  return (
    <group position={[DRAWING.cx, 0, DRAWING.cz]}>
      <WallSign position={[0, 3.4, -DRAWING.d / 2 + 0.13]} line1="Drawing Gallery" />
      {/* Spotlights for each slot */}
      {slots.map((s, i) => {
        const dw = drawings[i];
        if (!dw) return null;
        return (
          <FramedDrawing
            key={dw.id}
            drawing={dw}
            position={[s.x, 1.7, s.z]}
            rotationY={s.rotY}
          />
        );
      })}
      {/* Bench in the middle */}
      <Bench position={[0, 0, 0]} />
      <Bench position={[0, 0, -3]} rotationY={Math.PI} />
    </group>
  );
}

function buildDrawingSlots(n: number) {
  // Returns positions in DRAWING-local coordinates.
  const halfW = DRAWING.w / 2;
  const halfD = DRAWING.d / 2;
  const slots: { x: number; z: number; rotY: number }[] = [];
  if (n === 0) return slots;
  const perWall = Math.ceil(n / 2);
  const usableD = DRAWING.d - 4;
  const spacing = usableD / Math.max(1, perWall);
  for (let i = 0; i < n; i++) {
    const onLeft = i % 2 === 0;
    const slot = Math.floor(i / 2);
    const z = -halfD + 2 + spacing / 2 + slot * spacing;
    const x = onLeft ? -halfW + 0.18 : halfW - 0.18;
    const rotY = onLeft ? Math.PI / 2 : -Math.PI / 2;
    slots.push({ x, z, rotY });
  }
  return slots;
}

function FramedDrawing({
  drawing,
  position,
  rotationY,
}: {
  drawing: Drawing;
  position: [number, number, number];
  rotationY: number;
}) {
  const tex = useTexture(drawing.imageUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = (tex.image?.width ?? 1) / (tex.image?.height ?? 1) || 1;
  const artH = 1.4;
  const artW = artH * aspect;
  const matPad = 0.2;
  const frameThickness = 0.08;
  const matW = artW + matPad * 2;
  const matH = artH + matPad * 2;
  const frameW = matW + frameThickness * 2;
  const frameH = matH + frameThickness * 2;

  const labelTex = useMemo(() => makeLabelTexture(drawing.title), [drawing.title]);

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ slug: drawing.slug, title: drawing.title, focusable: true }}
    >
      {/* Frame */}
      <mesh position={[0, 0, -0.04]} castShadow>
        <boxGeometry args={[frameW, frameH, 0.06]} />
        <meshStandardMaterial color="#3a2a16" roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Mat board */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[matW, matH]} />
        <meshStandardMaterial color="#f3ebd8" roughness={0.95} />
      </mesh>
      {/* Artwork canvas */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[artW, artH]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* Glass-like overlay */}
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[matW, matH]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.05}
          roughness={0.05}
          transmission={0.9}
          thickness={0.02}
          clearcoat={1}
          clearcoatRoughness={0.05}
        />
      </mesh>
      {/* Plaque */}
      <mesh position={[0, -frameH / 2 - 0.18, 0.02]}>
        <planeGeometry args={[Math.min(frameW, 1.0), 0.22]} />
        <meshBasicMaterial map={labelTex} toneMapped={false} />
      </mesh>
      {/* Dedicated spotlight */}
      <spotLight
        position={[0, 1.0, 0.6]}
        target-position={[0, 0, 0]}
        angle={0.45}
        penumbra={0.6}
        intensity={1.2}
        distance={4.5}
        color="#fff1d8"
      />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D crafting hall — plinths, glass cases, turntables
// ─────────────────────────────────────────────────────────────────────────────

function CraftingHall({ crafts, modelRotation }: { crafts: Craft[]; modelRotation: boolean }) {
  const slots = useMemo(() => buildCraftSlots(crafts.length), [crafts.length]);
  return (
    <group position={[CRAFTS.cx, 0, CRAFTS.cz]}>
      <WallSign position={[0, 3.4, -CRAFTS.d / 2 + 0.13]} line1="3D Crafting Hall" />
      {slots.map((s, i) => {
        const c = crafts[i];
        if (!c) return null;
        return (
          <CraftDisplay key={c.id} craft={c} position={[s.x, 0, s.z]} rotation={modelRotation} />
        );
      })}
      {/* Hall lighting */}
      <pointLight position={[0, CRAFTS.height - 0.3, 0]} intensity={0.55} distance={22} color="#fff1d8" />
      <pointLight position={[-4, CRAFTS.height - 0.3, -4]} intensity={0.35} distance={14} color="#fff1d8" />
      <pointLight position={[4, CRAFTS.height - 0.3, 4]} intensity={0.35} distance={14} color="#fff1d8" />
    </group>
  );
}

function buildCraftSlots(n: number) {
  const slots: { x: number; z: number }[] = [];
  if (n === 0) return slots;
  // 2 rows × variable cols, centered.
  const cols = Math.max(2, Math.ceil(n / 2));
  const usableW = CRAFTS.w - 6;
  const usableD = CRAFTS.d - 6;
  const spacingX = usableW / Math.max(1, cols - 1 || 1);
  const spacingZ = usableD / 3;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = -usableW / 2 + col * spacingX;
    const z = -usableD / 2 + 1.5 + row * spacingZ;
    slots.push({ x, z });
  }
  return slots;
}

function CraftDisplay({
  craft,
  position,
  rotation,
}: {
  craft: Craft;
  position: [number, number, number];
  rotation: boolean;
}) {
  const labelTex = useMemo(() => makeLabelTexture(craft.title), [craft.title]);
  return (
    <group
      position={position}
      userData={{ slug: craft.slug, title: craft.title, focusable: true }}
    >
      {/* Plinth */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 1.0, 0.9]} />
        <meshStandardMaterial color="#15110d" roughness={0.6} />
      </mesh>
      {/* Plinth top trim */}
      <mesh position={[0, 1.01, 0]}>
        <boxGeometry args={[0.95, 0.02, 0.95]} />
        <meshStandardMaterial color="#caa86a" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Object on turntable */}
      <Turntable rotate={rotation}>
        {craft.modelUrl ? (
          <GlbModel url={craft.modelUrl} y={1.05} scaleTarget={0.7} />
        ) : craft.imageUrl ? (
          <PhotoStand url={craft.imageUrl} y={1.05} />
        ) : (
          <mesh position={[0, 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, 0.55, 24]} />
            <meshStandardMaterial color="#b08a3e" roughness={0.4} metalness={0.1} />
          </mesh>
        )}
      </Turntable>
      {/* Glass case */}
      <GlassCase center={[0, 1.05, 0]} size={[0.85, 1.0, 0.85]} />
      {/* Object label on plinth front */}
      <mesh position={[0, 0.7, 0.46]}>
        <planeGeometry args={[0.7, 0.22]} />
        <meshBasicMaterial map={labelTex} toneMapped={false} />
      </mesh>
      {/* Spotlight from above */}
      <spotLight
        position={[0, 3.5, 0]}
        target-position={[0, 1.2, 0]}
        angle={0.5}
        penumbra={0.5}
        intensity={1.1}
        distance={5}
        color="#fff1d8"
      />
    </group>
  );
}

function Turntable({ rotate, children }: { rotate: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotate && ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return <group ref={ref}>{children}</group>;
}

function GlassCase({
  center,
  size,
}: {
  center: [number, number, number];
  size: [number, number, number];
}) {
  const [cx, cy, cz] = center;
  const [w, h, d] = size;
  return (
    <group position={[cx, cy, cz]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.12}
          roughness={0.05}
          transmission={0.9}
          thickness={0.02}
          clearcoat={1}
          clearcoatRoughness={0.05}
          ior={1.45}
        />
      </mesh>
    </group>
  );
}

function GlbModel({
  url,
  y,
  scaleTarget = 0.7,
}: {
  url: string;
  y: number;
  scaleTarget?: number;
}) {
  const gltf = useGLTF(url);
  const scaled = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return scaleTarget / maxDim;
  }, [gltf, scaleTarget]);
  return (
    <group position={[0, y, 0]} scale={scaled}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function PhotoStand({ url, y }: { url: string; y: number }) {
  const tex = useTexture(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = (tex.image?.width ?? 1) / (tex.image?.height ?? 1) || 1;
  const height = 0.7;
  const width = height * aspect;
  return (
    <mesh position={[0, y + height / 2, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan showcase — featured generated scans on lit pillars
// ─────────────────────────────────────────────────────────────────────────────

function ScanShowcase({ scans, modelRotation }: { scans: Scan[]; modelRotation: boolean }) {
  const slots = useMemo(() => buildCraftSlots(Math.max(scans.length, 0)), [scans.length]);
  return (
    <group position={[SCANS.cx, 0, SCANS.cz]}>
      <WallSign position={[0, 3.4, -SCANS.d / 2 + 0.13]} line1="Scan Showcase" />
      {scans.length === 0 ? (
        <EmptyShowcasePlaceholder
          line1="Generated scans"
          line2="will appear here"
          position={[0, 1.6, 0]}
        />
      ) : (
        scans.map((s, i) => {
          const slot = slots[i] ?? { x: 0, z: 0 };
          return (
            <CraftDisplay
              key={s.id}
              craft={s}
              position={[slot.x, 0, slot.z]}
              rotation={modelRotation}
            />
          );
        })
      )}
      <pointLight position={[0, SCANS.height - 0.3, 0]} intensity={0.5} distance={20} color="#cfe5ff" />
      <hemisphereLight args={['#cfe5ff', '#1a1714', 0.25]} position={[0, 4, 0]} />
    </group>
  );
}

function EmptyShowcasePlaceholder({
  line1,
  line2,
  position,
}: {
  line1: string;
  line2?: string;
  position: [number, number, number];
}) {
  const tex = useMemo(() => makeSignTexture(line1, line2), [line1, line2]);
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[3.2, 1.6]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 0.6, 1.2]} intensity={0.3} distance={6} color="#cfe5ff" />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export & AR room — preview plinths and signage
// ─────────────────────────────────────────────────────────────────────────────

function ExportARRoom() {
  return (
    <group position={[EXPORT_ROOM.cx, 0, EXPORT_ROOM.cz]}>
      <WallSign position={[0, 3.4, EXPORT_ROOM.d / 2 - 0.13]} rotationY={Math.PI} line1="Export & AR" line2="coming soon" />

      {/* AR preview plinth */}
      <group position={[-3, 0, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#1a1714" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <icosahedronGeometry args={[0.3, 1]} />
          <meshStandardMaterial color="#caa86a" roughness={0.4} metalness={0.5} />
        </mesh>
        <PlinthLabel position={[0, 1.65, 0]} title="AR Preview" subtitle="point your phone here" />
        <spotLight position={[0, 3.5, 0]} target-position={[0, 1.2, 0]} angle={0.5} penumbra={0.5} intensity={1.0} distance={5} color="#fff1d8" />
      </group>

      {/* Export plinth */}
      <group position={[3, 0, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#1a1714" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <torusKnotGeometry args={[0.22, 0.07, 100, 16]} />
          <meshStandardMaterial color="#caa86a" roughness={0.3} metalness={0.6} />
        </mesh>
        <PlinthLabel position={[0, 1.65, 0]} title="Export" subtitle="GLB / USDZ / image" />
        <spotLight position={[0, 3.5, 0]} target-position={[0, 1.2, 0]} angle={0.5} penumbra={0.5} intensity={1.0} distance={5} color="#fff1d8" />
      </group>

      <pointLight position={[0, EXPORT_ROOM.height - 0.3, 0]} intensity={0.5} distance={18} color="#fff1d8" />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player — desktop click-drag + keyboard, mobile joystick + drag look
// ─────────────────────────────────────────────────────────────────────────────

type TouchState = {
  moveX: number;
  moveY: number;
  lookActive: boolean;
  lookId: number | null;
  lookLastX: number;
  lookLastY: number;
};

function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.matchMedia?.('(pointer: coarse)').matches
  );
}

const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function Player({
  active,
  isTouch,
  touchRef,
  pitchRef,
  onFocus,
  obstacles,
  onClickFocused,
}: {
  active: boolean;
  isTouch: boolean;
  touchRef: React.MutableRefObject<TouchState>;
  pitchRef: React.MutableRefObject<number>;
  onFocus: (f: Focus) => void;
  obstacles: Rect[];
  onClickFocused: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const lastFocus = useRef<string | null>(null);
  const baseY = 1.6;
  const bobT = useRef(0);

  // Set Euler order so yaw + pitch compose cleanly with pointer-lock and touch.
  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!active || isTouch || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, button, [role="textbox"]'))
      ) return;
      if (MOVEMENT_KEYS.has(e.code)) {
        if (e.cancelable) e.preventDefault();
        keys.current[e.code] = true;
      } else if (e.code === 'KeyE') {
        onClickFocused();
      }
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    // Desktop click-and-drag look: drag rotates the camera; a short tap counts as a click.
    let dragging = false;
    let dragMoved = 0;
    let lastX = 0;
    let lastY = 0;
    let activePointerId: number | null = null;
    const sens = 0.0035;

    const onPointerDown = (e: PointerEvent) => {
      if (!active || isTouch) return;
      if (e.button !== 0) return;
      dragging = true;
      dragMoved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      activePointerId = e.pointerId;
      try {
        gl.domElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      gl.domElement.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activePointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      camera.rotation.y -= dx * sens;
      pitchRef.current = Math.max(-1.2, Math.min(1.2, pitchRef.current - dy * sens));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      const wasDrag = dragMoved > 6;
      dragging = false;
      activePointerId = null;
      try {
        gl.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      gl.domElement.style.cursor = active && !isTouch ? 'grab' : '';
      if (!wasDrag && active && !isTouch) onClickFocused();
    };
    const resetInput = () => {
      keys.current = {};
      dragging = false;
      if (activePointerId !== null && gl.domElement.hasPointerCapture(activePointerId)) {
        gl.domElement.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      gl.domElement.style.cursor = active && !isTouch ? 'grab' : '';
    };

    gl.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', resetInput);

    // Initial cursor hint
    if (active && !isTouch) gl.domElement.style.cursor = 'grab';

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      gl.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', resetInput);
      resetInput();
      gl.domElement.style.cursor = '';
    };
  }, [active, gl, isTouch, onClickFocused, camera, pitchRef]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);

    if (!active) {
      velocity.current.set(0, 0, 0);
      return;
    }

    // Apply pitch from pitchRef (used by both desktop drag-look and touch look pad).
    camera.rotation.x = pitchRef.current;

    const speed = 3.4;
    const k = keys.current;

    let fwd = 0;
    let str = 0;
    if (isTouch) {
      // Joystick (-1..1)
      str = touchRef.current.moveX;
      fwd = -touchRef.current.moveY;
    } else {
      fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
      str = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    }

    direction.current.set(str, 0, -fwd);
    if (direction.current.lengthSq() > 1) direction.current.normalize();

    const yaw = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
    direction.current.applyEuler(yaw);

    velocity.current.lerp(direction.current.multiplyScalar(speed), Math.min(1, dt * 10));

    // Try movement on each axis separately and slide along walls.
    const proposedX = camera.position.x + velocity.current.x * dt;
    const proposedZ = camera.position.z + velocity.current.z * dt;

    let newX = camera.position.x;
    let newZ = camera.position.z;

    if (inWalkable(proposedX, newZ) && !hitsObstacle(proposedX, newZ, obstacles)) {
      newX = proposedX;
    } else {
      velocity.current.x = 0;
    }
    if (inWalkable(newX, proposedZ) && !hitsObstacle(newX, proposedZ, obstacles)) {
      newZ = proposedZ;
    } else {
      velocity.current.z = 0;
    }

    camera.position.x = newX;
    camera.position.z = newZ;

    // Body bob
    const moving = velocity.current.lengthSq() > 0.05;
    if (moving) {
      bobT.current += dt;
      camera.position.y = baseY + Math.sin(bobT.current * 9) * 0.04;
    } else {
      camera.position.y += (baseY - camera.position.y) * Math.min(1, dt * 8);
    }

    // Hover focus
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.current.intersectObjects(scene.children, true);
    let found: Focus = null;
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData?.slug) o = o.parent;
      if (o && o.userData?.slug && h.distance < 4.5) {
        found = { title: o.userData.title as string, slug: o.userData.slug as string };
        break;
      }
    }
    const key = found?.slug ?? null;
    if (key !== lastFocus.current) {
      lastFocus.current = key;
      onFocus(found);
    }
  });

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obstacles list — derived once from layout (plinths, benches, etc.)
// ─────────────────────────────────────────────────────────────────────────────

function buildObstacles(drawingsCount: number, craftsCount: number, scansCount: number): Rect[] {
  const obs: Rect[] = [];
  // Lobby central plinth
  obs.push({ cx: 0, cz: 0, w: 1.1, d: 1.1 });
  // Lobby benches
  obs.push({ cx: -5, cz: -3, w: 0.5, d: 1.7 });
  obs.push({ cx: 5, cz: -3, w: 0.5, d: 1.7 });

  // Drawing benches in middle of drawing room
  obs.push({ cx: DRAWING.cx, cz: DRAWING.cz, w: 1.7, d: 0.5 });
  obs.push({ cx: DRAWING.cx, cz: DRAWING.cz - 3, w: 1.7, d: 0.5 });

  // Crafts plinths
  const cs = buildCraftSlots(craftsCount);
  for (const s of cs) {
    obs.push({ cx: CRAFTS.cx + s.x, cz: CRAFTS.cz + s.z, w: 1.0, d: 1.0 });
  }
  // Scan plinths
  const ss = buildCraftSlots(scansCount);
  for (const s of ss) {
    obs.push({ cx: SCANS.cx + s.x, cz: SCANS.cz + s.z, w: 1.0, d: 1.0 });
  }
  // Export room plinths
  obs.push({ cx: EXPORT_ROOM.cx - 3, cz: EXPORT_ROOM.cz, w: 1.1, d: 1.1 });
  obs.push({ cx: EXPORT_ROOM.cx + 3, cz: EXPORT_ROOM.cz, w: 1.1, d: 1.1 });

  return obs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level Museum component
// ─────────────────────────────────────────────────────────────────────────────

export default function Museum3D({
  drawings,
  crafts,
  scans,
}: {
  drawings: Drawing[];
  crafts: Craft[];
  scans: Scan[];
}) {
  const [desktopActive, setDesktopActive] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const [quality, setQuality] = useState<Quality>('balanced');
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(isTouchDevice());
    const stored = (typeof window !== 'undefined' && localStorage.getItem('hei.museum.quality')) as
      | Quality
      | null;
    if (stored && (stored === 'low' || stored === 'balanced' || stored === 'high')) {
      setQuality(stored);
    } else if (isTouchDevice()) {
      setQuality('low');
    }
  }, []);

  const setQualityPersist = useCallback((q: Quality) => {
    setQuality(q);
    try {
      localStorage.setItem('hei.museum.quality', q);
    } catch {
      // ignore
    }
  }, []);

  const profile = QUALITY[quality];

  // Touch is "active" once the user taps to enter; desktop is active once they click Enter.
  const [touchActive, setTouchActive] = useState(false);
  const active = touch ? touchActive : desktopActive;

  const touchRef = useRef<TouchState>({
    moveX: 0,
    moveY: 0,
    lookActive: false,
    lookId: null,
    lookLastX: 0,
    lookLastY: 0,
  });
  const pitchRef = useRef(0);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const focusedRef = useRef<Focus>(null);
  focusedRef.current = focus;

  const obstacles = useMemo(
    () => buildObstacles(drawings.length, crafts.length, scans.length),
    [drawings.length, crafts.length, scans.length],
  );

  const onClickFocused = useCallback(() => {
    const f = focusedRef.current;
    if (f) window.location.href = `/artwork/${f.slug}`;
  }, []);

  // Spawn position: just inside the lobby south wall, looking north.
  const spawn: [number, number, number] = [0, 1.6, LOBBY.d / 2 - 1.5];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        className="h-full w-full"
        shadows={profile.shadows}
        dpr={profile.dpr}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 70, position: spawn, rotation: [0, Math.PI, 0] }}
        onCreated={({ camera, gl }) => {
          cameraRef.current = camera;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <color attach="background" args={['#0e0c0a']} />
        <fog attach="fog" args={['#0e0c0a', profile.fog[0], profile.fog[1]]} />

        {/* Global lighting */}
        <ambientLight intensity={0.25} />
        <hemisphereLight args={['#fff1d8', '#1a1714', 0.35]} position={[0, 8, 0]} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={0.45}
          castShadow={profile.shadows}
          shadow-mapSize={[1024, 1024]}
        />

        <Suspense fallback={<Html center><div className="text-bone/80">Loading museum…</div></Html>}>
          {/* Floors and ceilings for each room */}
          {ROOMS.map((r) => (
            <group key={`floor-${r.id}`}>
              <FloorTile rect={r} tint={r.id === 'lobby' ? '#3d362d' : undefined} />
              <CeilingTile rect={r} height={r.height} />
            </group>
          ))}
          {/* Walls per room (with door cutouts) */}
          {ROOMS.map((r) => (
            <RoomWalls key={`walls-${r.id}`} room={r} />
          ))}
          {/* Corridors */}
          {CORRIDORS.map((c, i) => (
            <CorridorBox key={`corr-${i}`} c={c} />
          ))}

          <Lobby />
          <DrawingGallery drawings={drawings} />
          <CraftingHall crafts={crafts} modelRotation={profile.modelRotation} />
          <ScanShowcase scans={scans} modelRotation={profile.modelRotation} />
          <ExportARRoom />

          <Player
            active={active}
            isTouch={touch}
            touchRef={touchRef}
            pitchRef={pitchRef}
            onFocus={setFocus}
            obstacles={obstacles}
            onClickFocused={onClickFocused}
          />
          <_CameraExposer />
        </Suspense>
      </Canvas>

      <Overlay
        active={active}
        isTouch={touch}
        focus={focus}
        quality={quality}
        onQuality={setQualityPersist}
        onEnterDesktop={() => setDesktopActive(true)}
        onEnterTouch={() => setTouchActive(true)}
        onExitTouch={() => setTouchActive(false)}
        onExitDesktop={() => setDesktopActive(false)}
        touchRef={touchRef}
        pitchRef={pitchRef}
        onClickFocused={onClickFocused}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay UI: exit, instructions, quality menu, mobile controls
// ─────────────────────────────────────────────────────────────────────────────

// GTA-style mini-map. Reads camera transform via window.__heiCamera and paints
// a top-down view of the rooms, corridors, and player chevron.
function MiniMap({ isTouch }: { isTouch: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const size = isTouch ? 130 : 170;

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // World bounds — rooms span roughly x [-32, 32], z [-34, 26]. Pad a bit.
    const minX = -34,
      maxX = 34,
      minZ = -36,
      maxZ = 28;
    const worldW = maxX - minX;
    const worldH = maxZ - minZ;
    const scale = Math.min(size / worldW, size / worldH) * 0.95;
    const offX = (size - worldW * scale) / 2 - minX * scale;
    const offY = (size - worldH * scale) / 2 - minZ * scale;
    const toPx = (x: number, z: number) => ({ x: x * scale + offX, y: z * scale + offY });

    const tick = () => {
      ctx.clearRect(0, 0, size, size);
      // Background
      ctx.fillStyle = 'rgba(20,16,12,0.7)';
      const r = 10;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.fill();
      // Border
      ctx.strokeStyle = 'rgba(220,200,160,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Corridors first (under rooms)
      ctx.fillStyle = 'rgba(220,200,160,0.18)';
      for (const c of CORRIDORS) {
        const p = toPx(c.cx - c.w / 2, c.cz - c.d / 2);
        ctx.fillRect(p.x, p.y, c.w * scale, c.d * scale);
      }
      // Rooms
      ctx.fillStyle = 'rgba(220,200,160,0.32)';
      ctx.strokeStyle = 'rgba(220,200,160,0.55)';
      for (const room of ROOMS) {
        const p = toPx(room.cx - room.w / 2, room.cz - room.d / 2);
        ctx.fillRect(p.x, p.y, room.w * scale, room.d * scale);
        ctx.strokeRect(p.x, p.y, room.w * scale, room.d * scale);
      }

      // Player
      const cam = (window as unknown as { __heiCamera?: { position: { x: number; z: number }; rotation: { y: number } } }).__heiCamera;
      let currentRoom = '';
      if (cam) {
        const p = toPx(cam.position.x, cam.position.z);
        // Determine current room/corridor label
        for (const room of ROOMS) {
          if (
            cam.position.x >= room.cx - room.w / 2 &&
            cam.position.x <= room.cx + room.w / 2 &&
            cam.position.z >= room.cz - room.d / 2 &&
            cam.position.z <= room.cz + room.d / 2
          ) {
            currentRoom = room.name;
            break;
          }
        }
        if (!currentRoom) currentRoom = 'Corridor';

        // Chevron pointing along camera yaw
        ctx.save();
        ctx.translate(p.x, p.y);
        // In our scene, camera starts rotated PI around Y; forward is -Z * cos(yaw).
        // Convert yaw to map-space angle (z grows downward in canvas).
        ctx.rotate(-cam.rotation.y);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(5, 5);
        ctx.lineTo(0, 2);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fillStyle = '#f5ecd2';
        ctx.strokeStyle = '#1a1714';
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (labelRef.current && labelRef.current.textContent !== currentRoom) {
        labelRef.current.textContent = currentRoom;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // Place desktop bottom-left; on touch, top-left under the exit bar to avoid joystick.
  const positionClass = isTouch ? 'top-16 left-3' : 'bottom-6 left-6';
  return (
    <div className={`pointer-events-none fixed ${positionClass} z-40 select-none`}>
      <div
        ref={labelRef}
        className="mb-1 inline-block rounded-full bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-bone backdrop-blur"
      >
        Entrance Lobby
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block rounded-xl border border-bone/20 shadow-lg"
      />
    </div>
  );
}

function Overlay({
  active,
  isTouch,
  focus,
  quality,
  onQuality,
  onEnterDesktop,
  onEnterTouch,
  onExitTouch,
  onExitDesktop,
  touchRef,
  pitchRef,
  onClickFocused,
}: {
  active: boolean;
  isTouch: boolean;
  focus: Focus;
  quality: Quality;
  onQuality: (q: Quality) => void;
  onEnterDesktop: () => void;
  onEnterTouch: () => void;
  onExitTouch: () => void;
  onExitDesktop: () => void;
  touchRef: React.MutableRefObject<TouchState>;
  pitchRef: React.MutableRefObject<number>;
  onClickFocused: () => void;
}) {
  return (
    <>
      {/* Top bar: exit, hint, quality */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-3 p-3 text-bone">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="pointer-events-auto rounded-full bg-black/60 px-3 py-1 text-sm no-underline backdrop-blur"
            onClick={() => {
              onExitTouch();
              onExitDesktop();
            }}
          >
            ← Exit museum
          </Link>
          {active && (
            <button
              type="button"
              onClick={() => {
                onExitTouch();
                onExitDesktop();
              }}
              className="pointer-events-auto rounded-full bg-black/60 px-3 py-1 text-sm backdrop-blur"
            >
              Pause
            </button>
          )}
        </div>
        <div className="hidden sm:block rounded-full bg-black/60 px-3 py-1 text-xs tracking-widest backdrop-blur">
          {isTouch
            ? 'left stick · walk · right side · drag to look'
            : 'WASD/arrows · click-drag to look · click or press E to open'}
        </div>
        <QualityMenu quality={quality} onQuality={onQuality} />
      </div>

      {/* Enter prompt */}
      {!active && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/55">
          <div className="pointer-events-auto max-w-md rounded-lg border border-bone/20 bg-stone/85 p-6 text-center text-bone">
            <h2 className="serif text-2xl">Enter the museum</h2>
            {isTouch ? (
              <p className="mt-2 text-sm text-bone/80">
                Tap to enter. Use the <strong>left joystick</strong> to walk and drag the{' '}
                <strong>right side of the screen</strong> to look around. Tap an artwork to open it.
              </p>
            ) : (
              <p className="mt-2 text-sm text-bone/80">
                Use <strong>W A S D</strong> or arrow keys to walk. <strong>Click and drag</strong> anywhere
                on the scene to look around. A short click (or <kbd>E</kbd>) opens the focused artwork.
              </p>
            )}
            <button
              type="button"
              className="btn mt-4"
              onClick={isTouch ? onEnterTouch : onEnterDesktop}
            >
              {isTouch ? 'Tap to enter' : 'Click to enter'}
            </button>
          </div>
        </div>
      )}

      {/* Focus card */}
      {focus && active && (
        <div
          className="pointer-events-auto fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black/75 px-4 py-3 text-bone backdrop-blur"
          onClick={onClickFocused}
          role="button"
          tabIndex={0}
        >
          <div className="serif text-lg">{focus.title}</div>
          <div className="mt-1 text-xs tracking-widest">
            {isTouch ? 'tap here' : <>press <kbd>E</kbd> · or click</>} ·{' '}
            <Link href={`/artwork/${focus.slug}`} className="underline">
              View details
            </Link>
          </div>
        </div>
      )}

      {/* Mobile controls */}
      {isTouch && active && (
        <MobileControls touchRef={touchRef} pitchRef={pitchRef} />
      )}

      {/* Minimap */}
      {active && <MiniMap isTouch={isTouch} />}
    </>
  );
}

function QualityMenu({ quality, onQuality }: { quality: Quality; onQuality: (q: Quality) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-black/60 px-3 py-1 text-xs tracking-widest text-bone backdrop-blur"
      >
        Quality: {quality}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-32 rounded-md border border-bone/20 bg-stone/95 p-1 text-bone">
          {(['low', 'balanced', 'high'] as Quality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                onQuality(q);
                setOpen(false);
              }}
              className={`block w-full rounded px-3 py-1 text-left text-sm hover:bg-bone/10 ${
                q === quality ? 'bg-bone/10' : ''
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileControls({
  touchRef,
  pitchRef,
}: {
  touchRef: React.MutableRefObject<TouchState>;
  pitchRef: React.MutableRefObject<number>;
}) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const stickActive = useRef<{ id: number; cx: number; cy: number } | null>(null);

  const resetStick = useCallback((recenter = true) => {
    const id = stickActive.current?.id;
    stickActive.current = null;
    touchRef.current.moveX = 0;
    touchRef.current.moveY = 0;
    if (recenter) setStickPos({ x: 0, y: 0 });
    if (id !== undefined && stickRef.current?.hasPointerCapture(id)) {
      stickRef.current.releasePointerCapture(id);
    }
  }, [touchRef]);

  const onStickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickActive.current || e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    stickActive.current = {
      id: e.pointerId,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    };
    el.setPointerCapture(e.pointerId);
  };
  const onStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = stickActive.current;
    if (!a || a.id !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const radius = 56;
    const dx = e.clientX - a.cx;
    const dy = e.clientY - a.cy;
    const len = Math.hypot(dx, dy);
    const clampedLen = Math.min(len, radius);
    const nx = len > 0 ? (dx / len) * clampedLen : 0;
    const ny = len > 0 ? (dy / len) * clampedLen : 0;
    setStickPos({ x: nx, y: ny });
    touchRef.current.moveX = nx / radius;
    touchRef.current.moveY = ny / radius;
  };
  const onStickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stickActive.current || stickActive.current.id !== e.pointerId) return;
    e.stopPropagation();
    resetStick();
  };

  // Right-side look pad
  const lookPadRef = useRef<HTMLDivElement | null>(null);
  const resetLook = useCallback(() => {
    const id = touchRef.current.lookId;
    touchRef.current.lookActive = false;
    touchRef.current.lookId = null;
    touchRef.current.lookLastX = 0;
    touchRef.current.lookLastY = 0;
    if (id !== null && lookPadRef.current?.hasPointerCapture(id)) {
      lookPadRef.current.releasePointerCapture(id);
    }
  }, [touchRef]);

  useEffect(() => {
    const reset = () => {
      resetStick();
      resetLook();
    };
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      resetStick(false);
      resetLook();
    };
  }, [resetStick, resetLook]);

  const onLookStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchRef.current.lookId !== null || e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    touchRef.current.lookActive = true;
    touchRef.current.lookId = e.pointerId;
    touchRef.current.lookLastX = e.clientX;
    touchRef.current.lookLastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchRef.current.lookActive || touchRef.current.lookId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - touchRef.current.lookLastX;
    const dy = e.clientY - touchRef.current.lookLastY;
    touchRef.current.lookLastX = e.clientX;
    touchRef.current.lookLastY = e.clientY;
    const sensitivity = 0.0035;
    // Yaw: rotate camera around Y. We don't have the camera here; we update via window event.
    const ev = new CustomEvent<{ dyaw: number; dpitch: number }>('hei-look', {
      detail: { dyaw: -dx * sensitivity, dpitch: -dy * sensitivity },
    });
    window.dispatchEvent(ev);
    pitchRef.current = Math.max(-1.2, Math.min(1.2, pitchRef.current - dy * sensitivity));
  };
  const onLookEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchRef.current.lookId !== e.pointerId) return;
    e.stopPropagation();
    resetLook();
  };

  // Apply yaw via window event to camera
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ dyaw: number }>;
      const cam = (window as unknown as { __heiCamera?: THREE.Camera }).__heiCamera;
      if (cam) {
        cam.rotation.y += ce.detail.dyaw;
      }
    };
    window.addEventListener('hei-look', handler);
    return () => window.removeEventListener('hei-look', handler);
  }, []);

  return (
    <>
      {/* Joystick (bottom-left) */}
      <div className="pointer-events-none fixed bottom-6 left-6 z-50 select-none">
        <div
          ref={stickRef}
          onPointerDown={onStickStart}
          onPointerMove={onStickMove}
          onPointerUp={onStickEnd}
          onPointerCancel={onStickEnd}
          onLostPointerCapture={onStickEnd}
          className="pointer-events-auto touch-none relative h-32 w-32 rounded-full border border-bone/30 bg-black/35 backdrop-blur"
        >
          <div
            className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-bone/70"
            style={{ transform: `translate(calc(-50% + ${stickPos.x}px), calc(-50% + ${stickPos.y}px))` }}
          />
        </div>
      </div>

      {/* Right-side look pad (covers right half except top bar / focus card) */}
      <div
        ref={lookPadRef}
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
        onLostPointerCapture={onLookEnd}
        className="pointer-events-auto touch-none fixed right-0 top-16 bottom-44 z-30 w-1/2"
      />
    </>
  );
}

// Expose the camera globally for the touch look-pad. Done inside a separate effect to
// avoid React rendering races on first paint.
function useExposeCamera() {
  const { camera } = useThree();
  useEffect(() => {
    (window as unknown as { __heiCamera?: THREE.Camera }).__heiCamera = camera;
    return () => {
      delete (window as unknown as { __heiCamera?: THREE.Camera }).__heiCamera;
    };
  }, [camera]);
}

// Render the camera-exposer alongside Player by piggybacking on a child component.
// Done at the end so JSX above stays readable.
// (Inlined into Player via a sub-component to avoid extra exports.)
function _CameraExposer() {
  useExposeCamera();
  return null;
}
// _CameraExposer is referenced indirectly: we mount it inside <Suspense> via a wrapper.
// Re-export to keep tree-shaking honest in some bundlers.
export { _CameraExposer as __CameraExposer };
