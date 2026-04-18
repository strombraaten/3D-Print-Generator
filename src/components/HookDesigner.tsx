import * as React from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { useControls, button, folder } from "leva"
import * as THREE from "three"
import { buildHookGeometry, DEFAULT_PARAMS, type HookParams } from "@/lib/hookGeometry"
import { exportSTL, export3MF } from "@/lib/hookExport"

// ─── Hook Mesh ───────────────────────────────────────────────────────────────

function HookMesh({ params, center }: { params: HookParams; center: THREE.Vector3 }) {
  const geometry = React.useMemo(() => buildHookGeometry(params), [params])

  React.useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  // Offset the mesh so its bounding-box centre sits at world origin.
  // Geometry coordinates are untouched so export values stay correct.
  return (
    <mesh
      geometry={geometry}
      position={[-center.x, -center.y, -center.z]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#e07b39" roughness={0.6} metalness={0.05} />
    </mesh>
  )
}

// ─── Grid Preview ─────────────────────────────────────────────────────────────

function GridPreview({
  bodyLength,
  width,
  wireDiameter,
  offset,
  gridOuter,
  show,
}: {
  bodyLength: number
  width: number
  wireDiameter: number
  offset: THREE.Vector3
  gridOuter: number
  show: boolean
}) {
  const { rows, cols, xMin, xMax, yMin, yMax, z } = React.useMemo(() => {
    const yBot  = -bodyLength
    const xLeft = -width / 2
    const xRight =  width / 2

    // rowMax = 0: the gripped wire always sits at grid row 0 (Y=0).
    const rowMin = Math.ceil(yBot / gridOuter)
    const rowMax = 0
    // Columns offset by half a spacing so the hook sits between vertical wires, not on one.
    const colMin = Math.floor(xLeft / gridOuter - 0.5)
    const colMax = Math.ceil(xRight / gridOuter - 0.5)

    const rows = Array.from({ length: rowMax - rowMin + 1 }, (_, i) => ({
      key: `h-${rowMin + i}`,
      y: (rowMin + i) * gridOuter - offset.y,
    }))
    const cols = Array.from({ length: colMax - colMin + 1 }, (_, i) => ({
      key: `v-${colMin + i}`,
      x: (colMin + i + 0.5) * gridOuter - offset.x,
    }))

    return {
      rows,
      cols,
      xMin: cols[0].x,
      xMax: cols[cols.length - 1].x,
      yMin: rows[0].y,
      yMax: rows[rows.length - 1].y,
      z: -offset.z,
    }
  }, [bodyLength, width, offset, gridOuter])

  if (!show) return null

  const r = wireDiameter / 2
  const EXTEND = 150
  const hLen = xMax - xMin + 2 * EXTEND
  const vLen = yMax - yMin + 2 * EXTEND
  const hCenterX = (xMin + xMax) / 2
  const vCenterY = (yMin + yMax) / 2

  return (
    <>
      {rows.map(({ key, y }) => (
        <mesh key={key} rotation={[0, 0, Math.PI / 2]} position={[hCenterX, y, z]}>
          <cylinderGeometry args={[r, r, hLen, 16]} />
          <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      {cols.map(({ key, x }) => (
        <mesh key={key} position={[x, vCenterY, z]}>
          <cylinderGeometry args={[r, r, vLen, 16]} />
          <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function ControlsInit() {
  const get = useThree((s) => s.get)
  React.useEffect(() => {
    const { camera, controls } = get()
    if (controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oc = controls as any
      oc.target?.set(0, 0, 0)
      oc.update?.()
    } else {
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
    }
  }, [get])
  return null
}

function Scene({
  params,
  showGrid,
  gridOuter,
}: {
  params: HookParams
  showGrid: boolean
  gridOuter: number
}) {
  const center = React.useMemo(() => {
    const geo = buildHookGeometry(params)
    geo.computeBoundingBox()
    const c = new THREE.Vector3()
    geo.boundingBox!.getCenter(c)
    geo.dispose()
    return c
  }, [params])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[80, 120, 60]} intensity={1.2} castShadow />
      <directionalLight position={[-60, 40, -40]} intensity={0.4} />

      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping={false} autoRotate={false} />
      <ControlsInit />

      <HookMesh params={params} center={center} />
      <GridPreview
        bodyLength={params.bodyLength}
        width={params.width}
        wireDiameter={params.wireDiameter}
        offset={center}
        gridOuter={gridOuter}
        show={showGrid}
      />
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function HookDesigner() {
  const [
    {
      wireDiameter,
      tolerance,
      width,
      wallThickness,
      clipWallThickness,
      clipCapHeight,
      clipOpeningDepth,
      bodyLength,
      armLength,
      armTopOffset,
      stopperEnabled,
      stopperHeight,
      stopperThickness,
      showGrid,
      gridOuter,
    },
    set,
  ] = useControls(() => ({
    "Gitterwire": folder({
      wireDiameter: { value: DEFAULT_PARAMS.wireDiameter, min: 2, max: 8, step: 0.5, label: "Diameter (mm)" },
      tolerance: { value: DEFAULT_PARAMS.tolerance, min: 0, max: 2, step: 0.1, label: "Toleranse (mm)" },
      gridOuter: { value: 54, min: 40, max: 80, step: 0.5, label: "Rutestørrelse (mm)" },
    }),
    "J-klype": folder({
      clipWallThickness: { value: DEFAULT_PARAMS.clipWallThickness, min: 2, max: 12, step: 0.5, label: "Yttervegg (mm)" },
      clipCapHeight: { value: DEFAULT_PARAMS.clipCapHeight, min: 4, max: 20, step: 0.5, label: "Topphøyde (mm)" },
      clipOpeningDepth: { value: DEFAULT_PARAMS.clipOpeningDepth, min: 5, max: 25, step: 0.5, label: "Åpning nedover (mm)" },
    }),
    "Kropp": folder({
      wallThickness: { value: DEFAULT_PARAMS.wallThickness, min: 2, max: 12, step: 0.5, label: "Bakvegg (mm)" },
      bodyLength: { value: DEFAULT_PARAMS.bodyLength, min: 40, max: 150, step: 1, label: "Høyde (mm)" },
      width: { value: DEFAULT_PARAMS.width, min: 10, max: 80, step: 1, label: "Bredde (mm)" },
    }),
    "Arm": folder({
      armLength: { value: DEFAULT_PARAMS.armLength, min: 30, max: 200, step: 1, label: "Lengde (mm)" },
      armTopOffset: { value: DEFAULT_PARAMS.armTopOffset, min: 15, max: 80, step: 1, label: "Arm-høyde (mm)" },
    }),
    "Stopper": folder({
      stopperEnabled: { value: DEFAULT_PARAMS.stopperEnabled, label: "På" },
      stopperHeight: { value: DEFAULT_PARAMS.stopperHeight, min: 2, max: 25, step: 0.5, label: "Høyde (mm)" },
      stopperThickness: { value: DEFAULT_PARAMS.stopperThickness, min: 2, max: 15, step: 0.5, label: "Tykkelse (mm)" },
    }),
    "Visning": folder({
      showGrid: { value: true, label: "Vis rutenett" },
    }),
    "Reset": button(() => set({ ...DEFAULT_PARAMS, showGrid: true, gridOuter: 54 })),
  }))

  const params: HookParams = {
    wireDiameter,
    tolerance,
    width,
    wallThickness,
    clipWallThickness,
    clipCapHeight,
    clipOpeningDepth,
    bodyLength,
    armLength,
    armTopOffset,
    stopperEnabled,
    stopperHeight,
    stopperThickness,
  }

  function handleExportSTL() {
    const geo = buildHookGeometry(params)
    exportSTL(geo, "3d_print_generator.stl")
  }

  async function handleExport3MF() {
    const geo = buildHookGeometry(params)
    await export3MF(geo, "3d_print_generator.3mf", params)
  }

  return (
    <div className="flex h-full w-full flex-col gap-0">
      {/* 3D viewport */}
      <div className="relative flex-1">
        <Canvas shadows className="h-full w-full" camera={{ position: [60, 50, 160], fov: 45 }}>
          <Scene params={params} showGrid={showGrid} gridOuter={gridOuter} />
        </Canvas>
      </div>

      {/* Export toolbar */}
      <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-3">
        <span className="text-xs text-muted-foreground">Eksporter:</span>
        <button
          onClick={handleExportSTL}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          .stl
        </button>
        <button
          onClick={handleExport3MF}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          .3mf
        </button>
        <span className="ml-auto text-xs text-muted-foreground/60">
          Bambu Studio: importer .3mf for beste resultat
        </span>
      </div>
    </div>
  )
}
