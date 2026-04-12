import * as THREE from "three"

export interface HookParams {
  wireDiameter: number
  tolerance: number
  wallThickness: number
  hookHeight: number
  armLength: number
  armThickness: number
  width: number
  stopperHeight: number
  stopperThickness: number
}

export const DEFAULT_PARAMS: HookParams = {
  wireDiameter: 4,
  tolerance: 0.5,
  wallThickness: 3,
  hookHeight: 35,
  armLength: 50,
  armThickness: 8,
  width: 30,
  stopperHeight: 6,
  stopperThickness: 3,
}

/**
 * Builds the 2D cross-section profile of the J-hook in the ZY plane.
 * Returns an array of [z, y] points forming a closed polygon.
 *
 * Coordinate convention (matches the world scene):
 *   Z = depth from wall (positive = toward room)
 *   Y = height (positive = up)
 *
 * Wire centre sits at (z=0, y=0). The slot is open downward so the hook
 * can be lowered onto the grid wire from above.
 */
export function buildHookProfile(p: HookParams): [number, number][] {
  const wireRadius = p.wireDiameter / 2
  const wg = wireRadius + p.tolerance // half-slot width (wire radius + clearance)

  // Z coordinates
  const zb = -(wg + p.wallThickness) // back wall outer face
  const zbi = -wg // back wall inner face (slot edge)
  const zfi = wg // front wall inner face (slot edge)
  const zfo = wg + p.wallThickness // front wall outer face
  const zsi = zfo + p.armLength // stopper inner face (arm tip)
  const zat = zsi + p.stopperThickness // stopper outer face

  // Y coordinates
  const ysb = -(wg + p.wallThickness) // body/slot bottom
  const yt = p.hookHeight // hook top
  const ybb = wg // arm top (flush with slot top)
  const yab = -(p.armThickness) // arm bottom
  const yst = ybb + p.stopperHeight // stopper top

  return [
    [zb, ysb], // back outer, bottom
    [zb, yt], // back outer, top
    [zfo, yt], // top cap, front outer
    [zfo, ybb], // front wall, arm junction top
    [zsi, ybb], // arm top, inner stopper face
    [zsi, yst], // stopper, inner top
    [zat, yst], // stopper, outer top
    [zat, yab], // arm tip, bottom
    [zfo, yab], // arm bottom, front outer
    [zfi, yab], // front wall inner, arm bottom
    [zfi, wg], // front wall inner, slot top  (index 10 — skipped in buildHookGeometry)
    [zbi, wg], // back wall inner, slot top   (index 11 — skipped; arc inserted instead)
    [zbi, ysb], // back wall inner, bottom → closes polygon
  ]
}

/** Approximate an arc from `startAngle` to `endAngle` (radians) as lineTo points. */
function arcPoints(cx: number, cy: number, r: number, startAngle: number, endAngle: number, segments = 24): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (endAngle - startAngle) * (i / segments)
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  return pts
}

/**
 * Creates a BufferGeometry for the hook by extruding the ZY profile in the X direction.
 *
 * THREE.ExtrudeGeometry extrudes a shape (defined in XY) along +Z.
 * We define the shape with profile-Z→shape-X and profile-Y→shape-Y,
 * then rotate the resulting geometry -90° around Y so that:
 *   shape X (= hook depth)  → world Z
 *   shape Y (= hook height) → world Y
 *   extrusion Z (= width)   → world X (centred at 0)
 */
export function buildHookGeometry(params: HookParams): THREE.BufferGeometry {
  const profile = buildHookProfile(params)
  const wg = params.wireDiameter / 2 + params.tolerance

  // Profile slot section (indices 9-12):
  //   9:  [zfi, yab] (wg, -arm)  — inner front wall bottom  (drawn)
  //  10:  [zfi, wg]  (wg, wg)    — inner front wall top     SKIPPED
  //  11:  [zbi, wg]  (-wg, wg)   — inner back wall top      SKIPPED
  //  12:  [zbi, ysb] (-wg, ysb)  — inner back wall bottom   (drawn last)
  //
  // Replace the flat slot ceiling ([zfi,wg]→[zbi,wg]) with a semicircular arc:
  //   centre (0,0), radius wg, sweeping CCW from angle 0 to π.
  //   Path: (wg,0) → apex (0,wg) → (-wg,0)
  // The inner walls shorten from ±wg to 0 (the arc end-points), giving a D-shaped slot
  // that matches the wire profile instead of a rectangular one.
  const arcPts = arcPoints(0, 0, wg, 0, Math.PI, 24) // (wg,0) → (0,wg) → (-wg,0)

  const shape = new THREE.Shape()
  shape.moveTo(profile[0][0], profile[0][1])
  for (let i = 1; i <= 9; i++) {
    shape.lineTo(profile[i][0], profile[i][1])
  }
  for (const [x, y] of arcPts) {
    shape.lineTo(x, y)
  }
  shape.lineTo(profile[12][0], profile[12][1])
  shape.closePath()

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: params.width,
    bevelEnabled: false,
  }

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)

  // Centre the extrusion in X (extrusion runs 0→width along shape's Z axis)
  geometry.translate(0, 0, -params.width / 2)

  // Rotate so the extrusion (originally shape's +Z) aligns with world X:
  //   rotation.y = -π/2 maps shape-Z→world-X, shape-X→world-Z
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2))

  return geometry
}
