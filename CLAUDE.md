# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A parametric 3D hook designer for a 54×54 mm grid-mesh wall. Users tune parameters via a Leva GUI, preview the result in a Three.js viewport, and export to `.stl` or `.3mf` for slicing in Bambu Studio. Deployed at `https://3d.simenlager.no`.

## Commands

```sh
npm run dev        # Astro dev server (localhost:4321)
npm run build      # Production build → /dist
npm run preview    # Preview production build
npm run typecheck  # Astro type check (astro check)
npm run lint       # ESLint
npm run format     # Prettier
```

## Architecture

**Stack:** Astro 5 + React 19 + Three.js r176 + @react-three/fiber + Leva + Tailwind v4 + shadcn/ui

### Geometry pipeline (`src/lib/hookGeometry.ts`)

`buildHookGeometry(params: HookParams) → THREE.BufferGeometry`

1. Computes named Z/Y coordinates from parameters (all distances from wire center)
2. Draws a single `THREE.Shape` CCW polygon in the ZY-plane using `lineTo` + one `absarc` for the wire slot ceiling
3. Adds a triangular `shape.holes` cutout to save filament
4. Calls `THREE.ExtrudeGeometry` with `depth = width`, no bevel
5. Translates and rotates so extrusion axis = world X

**Coordinate system:** Origin = wire center. Z = depth (positive = into room). Y = height (positive = up). X = extrusion width.

**Slot:** Open downward (Y < −wireRadius − tolerance) — hook hangs by gravity, no lock needed. The ceiling uses `absarc(0, 0, wg, Math.PI, 0, true)` where `wg = wireDiameter/2 + tolerance`.

### Export (`src/lib/hookExport.ts`)

- `exportSTL`: writes binary STL (84-byte header + 50 bytes per triangle), per-face normals computed from cross product
- `export3MF`: deduplicates vertices at 4-decimal precision → XML mesh → JSZip archive with `3D/model.model`, `_rels/.rels`, `[Content_Types].xml`

### UI (`src/components/HookDesigner.tsx`)

- Leva panel owns all parameter state; `React.useMemo` rebuilds geometry on every change
- R3F Canvas renders: `HookMesh` (orange material), `GridPreview` (cylinders toggled on/off), lights, `OrbitControls`
- `ControlsInit` sets camera target once on mount via `useThree`
- Three.js accesses `window` at import time → hydrated as `client:only="react"` in `index.astro`

## Key decisions

| Decision | Why |
|----------|-----|
| Astro with `client:only="react"` | Three.js references `window`/`document` on import; SSR would break it |
| `shape.holes.push()` for cutout | Three.js handles the boolean subtract during tessellation — no CSG library needed |
| `geometry.applyMatrix4(makeRotationY(-π/2))` | `ExtrudeGeometry` extrudes along Z by default; rotation maps it to world X |
| JSZip for .3mf | .3mf is just a ZIP with XML inside; no dedicated library required |
| Vertex deduplication at 4 decimal places | Reduces 3MF file size and ensures clean mesh import in Bambu Studio |

## Grid-mesh specifications

- Wire diameter: **4 mm** (default `wireDiameter`)
- Grid pitch: **54 × 54 mm** outer
- Inner opening: **~45 × 46 mm**
- Working tolerance: **0.5 mm** (default `tolerance`) — tested with PLA

## Future work (unprioritized)

- Semi-circular wire slot: replace square slot bottom with `absarc` for line contact instead of point contact
- Strength calculator: cantilever beam formula (M = F×L, σ = M×c/I) as a sidebar showing go/no-go for given load
- General-purpose tool scope: categories beyond grid-hook (kitchen organizer, tool holder, etc.)
