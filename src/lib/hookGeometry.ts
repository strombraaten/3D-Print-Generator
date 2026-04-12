import * as THREE from "three"

export interface HookParams {
  wireDiameter: number
  tolerance: number
  wallThickness: number
  hookHeight: number       // clip cap above the wire
  bodyLength: number       // how far the back wall hangs below the wire (to lower grid wire)
  clipDepth: number        // how far below wire centre the J-clip notch extends (mm)
  armLength: number        // horizontal reach of the shelf
  armThickness: number     // constant vertical depth of the arm/shelf
  armMountHeight: number   // shelf height above body bottom; controls bracket steepness
  width: number
  stopperEnabled: boolean  // whether to add an upward bump at the arm tip
  stopperHeight: number    // bump height above shelf top
  stopperThickness: number // bump depth (Z extent past arm tip)
}

export const DEFAULT_PARAMS: HookParams = {
  wireDiameter: 4,
  tolerance: 0.5,
  wallThickness: 3,
  hookHeight: 10,
  bodyLength: 54,
  clipDepth: 10,        // J-clip notch extends 10mm below wire centre
  armLength: 55,
  armThickness: 8,
  armMountHeight: 40,   // shelf is 40mm above body bottom (~3/4 of bodyLength)
  width: 30,
  stopperEnabled: true,
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
 * Creates a BufferGeometry for the hook by extruding a 2D profile.
 *
 * Shape overview (side view, ZY plane, wire centre at origin):
 *
 *   J-clip — small bracket at the TOP only; grips the upper grid wire (Y=0)
 *   Back wall — solid plate running the full body height (no inner walls below clip)
 *   Shelf arm — horizontal surface extending forward from the clip-zone front face
 *   Triangle bracket — diagonal from arm tip all the way back to body bottom
 *   Stopper — optional upward bump at the arm tip
 *
 * Retention: J-clip prevents upward lift-off. The diagonal bracket's bottom corner
 * rests against the lower grid wire; gravity + arm load keeps the hook seated.
 *
 * The outer Shape is a solid silhouette (no inner wall edges). The wire slot is
 * cut as a closed THREE.Path hole via shape.holes — this avoids the full-height
 * hollow channel of the previous design.
 *
 * THREE.ExtrudeGeometry extrudes a Shape (in its XY plane) along +Z.
 * We define shape-X = profile-Z (depth) and shape-Y = profile-Y (height),
 * then rotate the geometry -90° around Y so extrusion → world-X (width).
 */
export function buildHookGeometry(params: HookParams): THREE.BufferGeometry {
  // Guard: fall back to defaults for any undefined field (HMR / stale Leva state)
  const d = DEFAULT_PARAMS
  const p: HookParams = {
    wireDiameter:    params.wireDiameter    ?? d.wireDiameter,
    tolerance:       params.tolerance       ?? d.tolerance,
    wallThickness:   params.wallThickness   ?? d.wallThickness,
    hookHeight:      params.hookHeight      ?? d.hookHeight,
    bodyLength:      params.bodyLength      ?? d.bodyLength,
    clipDepth:       params.clipDepth       ?? d.clipDepth,
    armLength:       params.armLength       ?? d.armLength,
    armThickness:    params.armThickness    ?? d.armThickness,
    armMountHeight:  params.armMountHeight  ?? d.armMountHeight,
    width:           params.width           ?? d.width,
    stopperEnabled:  params.stopperEnabled  ?? d.stopperEnabled,
    stopperHeight:   params.stopperHeight   ?? d.stopperHeight,
    stopperThickness: params.stopperThickness ?? d.stopperThickness,
  }

  const wg   = p.wireDiameter / 2 + p.tolerance   // half-slot width
  const zb   = -(wg + p.wallThickness)             // outer back face
  const zbi  = -wg                                 // inner back face
  const zfi  = wg                                  // inner front face
  const zfo  = wg + p.wallThickness                // outer front face
  const zarm = zfo + p.armLength                   // arm tip Z

  const yt   = p.hookHeight                        // clip cap top
  const ysb  = -p.bodyLength                       // body bottom (lower wire level)

  // Clamp armMountHeight so shelf is always above the arm thickness
  const mountH = Math.max(p.armMountHeight, p.armThickness + 1)
  const yShelf = ysb + mountH                      // shelf Y level

  // Arc for the wire slot ceiling: CCW semicircle (wg,0)→(0,wg)→(-wg,0)
  const arc = arcPoints(0, 0, wg, 0, Math.PI, 24)

  // ── Shape overview ────────────────────────────────────────────────────────────
  //
  // The hook has two distinct structural zones that share only the outer back wall:
  //
  //   CLIP ZONE  (yShelf → yt, full width zb→zfo):
  //     The J-clip bracket. Solid block with the slot hole punched through it.
  //     The lower grid wire passes ALONGSIDE the outer back face (zb) here —
  //     it does NOT enter the solid. The J-clip hole keeps the wire slot clear.
  //
  //   BRACKET ZONE  (ysb → yShelf, front half only zbi→zfo+armLength):
  //     The arm shelf + diagonal brace. Lives entirely at Z ≥ zbi (-2.5 mm),
  //     which keeps it clear of the lower grid wire at Z=0 down at Y=ysb.
  //     The outer back wall does NOT extend into this zone — there is no
  //     back-wall material at negative Z below the arm mount level.
  //
  // Because the back wall (negative Z) stops at yShelf, and the bracket zone
  // is entirely at positive-ish Z, the lower wire at (Z=0, Y=ysb) sits just
  // outside the solid on its back-left face rather than going through it.
  //
  // Profile trace (CCW):
  //   back-wall bottom (zb, yShelf) → up back wall → top cap → down outer front
  //   → shelf → arm tip → diagonal to (zbi, ysb) → body bottom → closePath

  const shape = new THREE.Shape()

  // ── Clip zone: back wall + top cap + outer front ──────────────────────────────
  shape.moveTo(zb,  yShelf)       // back-wall bottom corner (arm mount level)
  shape.lineTo(zb,  yt)           // up full outer back wall
  shape.lineTo(zfo, yt)           // top cap
  shape.lineTo(zfo, yShelf)       // outer front face down to shelf level

  // ── Bracket zone: shelf + arm tip + diagonal brace ───────────────────────────
  shape.lineTo(zarm, yShelf)      // shelf top (horizontal)

  if (p.stopperEnabled) {
    shape.lineTo(zarm,                      yShelf + p.stopperHeight)
    shape.lineTo(zarm + p.stopperThickness, yShelf + p.stopperHeight)
    shape.lineTo(zarm + p.stopperThickness, yShelf - p.armThickness)
  } else {
    shape.lineTo(zarm, yShelf - p.armThickness)
  }

  // Diagonal brace: arm tip → inner back face at body bottom.
  // Ends at zbi (= -wg = -2.5 mm), not zb, so the outer-back zone at
  // negative Z stays clear of the lower wire at Z=0.
  shape.lineTo(zbi, ysb)

  // Body bottom: 3 mm step from inner back (zbi) to outer back (zb) — the thin
  // strip of material at the very base of the back wall.
  shape.lineTo(zb, ysb)

  // Left face: back wall going up from body bottom to back-wall bottom corner.
  // closePath() draws this segment automatically.
  shape.closePath()               // (zb, ysb) → (zb, yShelf) — completes back wall

  // ── J-clip slot hole ─────────────────────────────────────────────────────────
  // Closed void punched into the clip zone. Floor is clamped to stay above yShelf
  // so the hole never reaches into the open bracket zone below.
  const ySlotBot = Math.max(-p.clipDepth, yShelf + 1)

  const slotPath = new THREE.Path()
  slotPath.moveTo(zfi, ySlotBot)
  slotPath.lineTo(zfi, 0)
  for (const [x, y] of arc) slotPath.lineTo(x, y)
  slotPath.lineTo(zbi, ySlotBot)
  slotPath.closePath()

  shape.holes = [slotPath]

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: p.width,
    bevelEnabled: false,
  })

  // Centre in X (extrusion runs 0→width along shape's Z axis)
  geometry.translate(0, 0, -p.width / 2)

  // Rotate so extrusion aligns with world X: -π/2 around Y
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2))

  return geometry
}

/**
 * Returns representative 2D profile vertices for preview/display.
 * Returns the outer silhouette only — matches the outer Shape in buildHookGeometry.
 * The J-clip slot (hole) is omitted; the profile shows the solid boundary.
 */
export function buildHookProfile(p: HookParams): [number, number][] {
  const wg   = p.wireDiameter / 2 + p.tolerance
  const zb   = -(wg + p.wallThickness)
  const zbi  = -wg
  const zfo  = wg + p.wallThickness
  const zarm = zfo + p.armLength
  const yt   = p.hookHeight
  const ysb  = -p.bodyLength
  const mountH = Math.max(p.armMountHeight, p.armThickness + 1)
  const yShelf = ysb + mountH

  return [
    [zb,   yShelf],  // back-wall bottom corner (arm mount level)
    [zb,   yt],
    [zfo,  yt],
    [zfo,  yShelf],
    [zarm, yShelf],
    ...(p.stopperEnabled ? [
      [zarm,                      yShelf + p.stopperHeight],
      [zarm + p.stopperThickness, yShelf + p.stopperHeight],
      [zarm + p.stopperThickness, yShelf - p.armThickness],
    ] as [number, number][] : [[zarm, yShelf - p.armThickness]] as [number, number][]),
    [zbi,  ysb],  // diagonal to inner back at body bottom
    [zb,   ysb],  // body bottom (outer back)
    // closePath → (zb, yShelf) — closes the back wall
  ]
}
