import * as React from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
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
  // This keeps OrbitControls orbiting the hook instead of the wire slot.
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

// ─── Wire Preview ─────────────────────────────────────────────────────────────

function WirePreview({
  wireDiameter,
  width,
  offset,
  show,
}: {
  wireDiameter: number
  width: number
  offset: THREE.Vector3
  show: boolean
}) {
  if (!show) return null
  // Visualise the grid wire as a cylinder along X (the extrusion/width axis).
  // Position is offset to stay inside the slot even after the hook is centred.
  return (
    <mesh
      rotation={[0, 0, Math.PI / 2]}
      position={[-offset.x, -offset.y, -offset.z]}
    >
      <cylinderGeometry args={[wireDiameter / 2, wireDiameter / 2, width * 2, 16]} />
      <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
    </mesh>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

// Forces OrbitControls to orient the camera toward its target on mount.
// We use `get()` inside the effect — not `useThree()` at render time — because
// OrbitControls.makeDefault writes the controls instance to the R3F store via
// its own useEffect (earlier sibling). `get()` reads the live state at run-time.
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

function Scene({ params, showWire }: { params: HookParams; showWire: boolean }) {
  // Compute bounding box center once so both mesh and wire share the same offset
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
      <WirePreview
        wireDiameter={params.wireDiameter}
        width={params.width}
        offset={center}
        show={showWire}
      />

      <Grid
        position={[0, -(params.hookHeight * 0.8), 0]}
        args={[160, 160]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#888"
        sectionSize={54}
        sectionThickness={1}
        sectionColor="#555"
        fadeDistance={200}
        infiniteGrid
      />
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function HookDesigner() {
  // Leva control panel — mirrors the parameter set from the standalone HTML
  const [
    {
      wireDiameter,
      tolerance,
      wallThickness,
      hookHeight,
      armLength,
      armThickness,
      width,
      stopperHeight,
      stopperThickness,
      showWire,
    },
    set,
  ] = useControls(() => ({
    "Grid wire": folder({
      wireDiameter: { value: DEFAULT_PARAMS.wireDiameter, min: 2, max: 8, step: 0.5, label: "Diameter (mm)" },
      tolerance: { value: DEFAULT_PARAMS.tolerance, min: 0, max: 2, step: 0.1, label: "Toleranse (mm)" },
    }),
    "Hook body": folder({
      wallThickness: { value: DEFAULT_PARAMS.wallThickness, min: 1.5, max: 8, step: 0.5, label: "Veggtykkelse (mm)" },
      hookHeight: { value: DEFAULT_PARAMS.hookHeight, min: 15, max: 80, step: 1, label: "Høyde (mm)" },
      width: { value: DEFAULT_PARAMS.width, min: 10, max: 80, step: 1, label: "Bredde (mm)" },
    }),
    "Arm": folder({
      armLength: { value: DEFAULT_PARAMS.armLength, min: 10, max: 120, step: 1, label: "Lengde (mm)" },
      armThickness: { value: DEFAULT_PARAMS.armThickness, min: 3, max: 20, step: 0.5, label: "Tykkelse (mm)" },
    }),
    "Stopper": folder({
      stopperHeight: { value: DEFAULT_PARAMS.stopperHeight, min: 0, max: 20, step: 0.5, label: "Høyde (mm)" },
      stopperThickness: { value: DEFAULT_PARAMS.stopperThickness, min: 0, max: 10, step: 0.5, label: "Tykkelse (mm)" },
    }),
    "Visning": folder({
      showWire: { value: true, label: "Vis tråd" },
    }),
    "Reset": button(() => set({ ...DEFAULT_PARAMS, showWire: true })),
  }))

  const params: HookParams = {
    wireDiameter,
    tolerance,
    wallThickness,
    hookHeight,
    armLength,
    armThickness,
    width,
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
          <Scene params={params} showWire={showWire} />
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
