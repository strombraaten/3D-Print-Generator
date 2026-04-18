import * as THREE from "three"

export interface HookParams {
  wireDiameter: number
  tolerance: number
  wallThickness: number
  hookHeight: number        // clip cap above the wire
  bodyLength: number        // distance from wire centre down to body bottom (min 54 = one grid square)
  clipDepth: number         // how far below wire centre the J-clip notch extends (mm)
  armMountHeight: number    // how far below wire centre the shelf arm sits (mm)
  armLength: number         // horizontal reach of the shelf
  armThickness: number      // constant vertical depth of the arm/shelf
  width: number
  stopperEnabled: boolean   // whether to add an upward bump at the arm tip
  stopperHeight: number     // bump height above shelf top
  stopperThickness: number  // bump depth (Z extent past arm tip)
}

export const DEFAULT_PARAMS: HookParams = {
  wireDiameter: 4,
  tolerance: 0.5,
  wallThickness: 10,
  hookHeight: 10,
  bodyLength: 97,
  clipDepth: 13,
  armMountHeight: 42,
  armLength: 82,
  armThickness: 10,
  width: 24,
  stopperEnabled: false,
  stopperHeight: 6,
  stopperThickness: 3,
}

/** Approximate an arc from startAngle to endAngle (radians) as lineTo points. */
function arcPoints(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
  segments = 24,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (endAngle - startAngle) * (i / segments)
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  return pts
}

/**
 * Builds the triangular lightening hole punched into the bracket interior.
 *
 * The hole sits in the right triangle formed by:
 *   A = (zfo, yShelf−armThickness)  — arm bottom meets back-plate front face
 *   B = (zarm, yShelf−armThickness) — arm tip bottom
 *   C = (zfo, yC)                   — where z=zfo intersects the diagonal strut
 *
 * This is a right-angle triangle (90° at A). Each edge is inset by `margin`
 * toward the interior, leaving structural material on all sides.
 */
function buildLighteningHole(
  zfo: number, zarm: number, zbi: number,
  yShelf: number, armThickness: number, ysb: number,
  margin: number,
): THREE.Path {
  const ay = yShelf - armThickness

  // Find C: where z=zfo intersects the diagonal from (zarm, ay) to (zbi, ysb)
  const t = (zfo - zarm) / (zbi - zarm)
  const yC = ay + t * (ysb - ay)

  // BC direction (hypotenuse from B to C)
  const bcDz = zfo - zarm
  const bcDy = yC - ay
  const bcLen = Math.sqrt(bcDz * bcDz + bcDy * bcDy)

  // Inward normal to BC (CW rotation of direction vector)
  const inNz = bcDy / bcLen
  const inNy = -bcDz / bcLen

  // A point on the inset BC line (shift B toward interior by margin)
  const pz = zarm + inNz * margin
  const py = ay + inNy * margin

  // Corner A': intersection of inset left edge (z=zfo+margin) and inset top edge (y=ay-margin)
  const Az = zfo + margin
  const Ay = ay - margin

  // Corner B': intersection of inset top edge and inset BC
  const tB = bcDy !== 0 ? (Ay - py) / bcDy : 0
  const Bz = pz + tB * bcDz

  // Corner C': intersection of inset left edge and inset BC
  const tC = bcDz !== 0 ? (Az - pz) / bcDz : 0
  const Cy = py + tC * bcDy

  // CW winding (hole in a CCW outer shape): A'→B'→C'→A'
  const path = new THREE.Path()
  path.moveTo(Az, Ay)
  path.lineTo(Bz, Ay)
  path.lineTo(Az, Cy)
  path.closePath()

  return path
}

/**
 * Creates a BufferGeometry for the bracket by extruding a 2D profile.
 *
 * Shape overview (side view, ZY plane, wire centre at origin):
 *
 *   J-clip    — at the TOP; grips the upper grid wire (Y=0)
 *   Back wall — solid plate running the full body height
 *   Shelf arm — horizontal surface at bodyLength/2 height, extending forward
 *   Diagonal  — from arm tip down to body bottom (zbi, ysb)
 *   Lightening hole — triangular void in the bracket interior to save material
 *   Stopper   — optional upward bump at the arm tip
 *
 * THREE.ExtrudeGeometry extrudes a Shape (in its XY plane) along +Z.
 * shape-X = profile-Z (depth), shape-Y = profile-Y (height),
 * then rotated -90° around Y so extrusion → world-X (width).
 */
export function buildHookGeometry(params: HookParams): THREE.BufferGeometry {
  const d = DEFAULT_PARAMS
  const p: HookParams = {
    wireDiameter:     params.wireDiameter     ?? d.wireDiameter,
    tolerance:        params.tolerance        ?? d.tolerance,
    wallThickness:    params.wallThickness    ?? d.wallThickness,
    hookHeight:       params.hookHeight       ?? d.hookHeight,
    bodyLength:       params.bodyLength       ?? d.bodyLength,
    clipDepth:        params.clipDepth        ?? d.clipDepth,
    armMountHeight:   params.armMountHeight   ?? d.armMountHeight,
    armLength:        params.armLength        ?? d.armLength,
    armThickness:     params.armThickness     ?? d.armThickness,
    width:            params.width            ?? d.width,
    stopperEnabled:   params.stopperEnabled   ?? d.stopperEnabled,
    stopperHeight:    params.stopperHeight    ?? d.stopperHeight,
    stopperThickness: params.stopperThickness ?? d.stopperThickness,
  }

  const wg   = p.wireDiameter / 2 + p.tolerance   // half-slot width
  const zb   = -(wg + p.wallThickness)             // outer back face
  const zbi  = -wg                                 // inner back face
  const zfi  = wg                                  // inner front face
  const zfo  = wg + p.wallThickness                // outer front face
  const zarm = zfo + p.armLength                   // arm tip Z

  const yt     = p.hookHeight                      // clip cap top
  const ysb    = -p.bodyLength                     // body bottom
  const yShelf = -p.armMountHeight                 // arm top, below wire centre

  // Arc for the wire slot ceiling: CCW semicircle (wg,0)→(0,wg)→(-wg,0)
  const arc = arcPoints(0, 0, wg, 0, Math.PI, 24)

  const shape = new THREE.Shape()

  // ── Clip zone: outer back wall + cap + outer front wall ──────────────────────
  // Runs from arm level up to clip cap top (full J-clip width).
  shape.moveTo(zb,  yShelf)
  shape.lineTo(zb,  yt)
  shape.lineTo(zfo, yt)
  shape.lineTo(zfo, yShelf)

  // ── Shelf arm: extends forward from the clip front ───────────────────────────
  shape.lineTo(zarm, yShelf)

  if (p.stopperEnabled) {
    shape.lineTo(zarm,                      yShelf + p.stopperHeight)
    shape.lineTo(zarm + p.stopperThickness, yShelf + p.stopperHeight)
    shape.lineTo(zarm + p.stopperThickness, yShelf - p.armThickness)
  } else {
    shape.lineTo(zarm, yShelf - p.armThickness)
  }

  // ── Diagonal brace + inner back wall ─────────────────────────────────────────
  // Below the arm, only the inner back face (zbi) is used — no outer back wall.
  // Diagonal runs from arm-tip bottom to inner back face at body bottom.
  shape.lineTo(zbi, ysb)
  // Inner back face runs straight up to arm level, then closePath draws the
  // horizontal connection (zbi → zb) at arm level, completing the clip base.
  shape.lineTo(zbi, yShelf)
  shape.closePath()

  // ── J-clip slot hole ─────────────────────────────────────────────────────────
  // Slot extends clipDepth below wire centre (Y=0), but no lower than body bottom.
  const ySlotBot = Math.max(-p.clipDepth, ysb + 1)

  const slotPath = new THREE.Path()
  slotPath.moveTo(zfi, ySlotBot)
  slotPath.lineTo(zfi, 0)
  for (const [x, y] of arc) slotPath.lineTo(x, y)
  slotPath.lineTo(zbi, ySlotBot)
  slotPath.closePath()

  // ── Lightening hole ───────────────────────────────────────────────────────────
  const lighteningHole = buildLighteningHole(
    zfo, zarm, zbi,
    yShelf, p.armThickness, ysb,
    p.wallThickness / 2,
  )

  shape.holes = [slotPath, lighteningHole]

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: p.width,
    bevelEnabled: false,
  })

  geometry.translate(0, 0, -p.width / 2)
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2))

  return geometry
}

/**
 * Returns representative 2D profile vertices for preview/display (outer silhouette only).
 */
export function buildHookProfile(p: HookParams): [number, number][] {
  const wg     = p.wireDiameter / 2 + p.tolerance
  const zb     = -(wg + p.wallThickness)
  const zbi    = -wg
  const zfo    = wg + p.wallThickness
  const zarm   = zfo + p.armLength
  const yt     = p.hookHeight
  const ysb    = -p.bodyLength
  const yShelf = -p.armMountHeight

  return [
    [zb,   yShelf],
    [zb,   yt],
    [zfo,  yt],
    [zfo,  yShelf],
    [zarm, yShelf],
    ...(p.stopperEnabled ? [
      [zarm,                      yShelf + p.stopperHeight],
      [zarm + p.stopperThickness, yShelf + p.stopperHeight],
      [zarm + p.stopperThickness, yShelf - p.armThickness],
    ] as [number, number][] : [[zarm, yShelf - p.armThickness]] as [number, number][]),
    [zbi,  ysb],
    [zbi,  yShelf],
  ]
}
