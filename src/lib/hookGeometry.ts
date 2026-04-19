import * as THREE from "three"

/**
 * Parametric bracket hook for a 54x54 mm grid-mesh wall.
 *
 * Coordinate system (ZY profile, extruded along X):
 *   Z = depth (positive = out from wall, toward room)
 *   Y = height (positive = up)
 *   X = width (extrusion direction)
 * Origin (0, 0) sits at the gripped wire center.
 *
 * Shape silhouette (CCW):
 *   A ── L ─────── H  (clip cap + back-wall top + stopper top)
 *   │             │
 *   B ── C─┐ ┌─E  │
 *          │o│    │   (slot arc around wire at origin)
 *          └─┘──K J
 *              │  (arm top horizontal)
 *              F───┐
 *                   \  (diagonal brace bottom)
 *                    G
 */
export interface HookParams {
  wireDiameter: number      // diameter of grid wire (mm)
  tolerance: number         // slot radius = wireDiameter/2 + tolerance (mm)
  width: number             // extrusion width — must span >= 1 grid cell (mm)
  wallThickness: number     // back-wall Z thickness (mm)
  clipWallThickness: number // outer U-clip wall Z thickness, behind the wire (mm)
  clipCapHeight: number     // material above wire center up to top of clip (mm)
  clipOpeningDepth: number  // how far below wire center the outer U wall extends (mm)
  bodyLength: number        // back-wall length below wire center (mm)
  armLength: number         // horizontal reach from back-wall-inner to arm tip (mm)
  armTopOffset: number      // arm top Y position below wire center, i.e. |-armTopY| (mm)
  stopperEnabled: boolean   // whether the arm tip has an upward lip
  stopperHeight: number     // stopper height above arm top (mm)
  stopperThickness: number  // stopper Z thickness, measured inward from arm-tip outer (mm)
}

export const DEFAULT_PARAMS: HookParams = {
  wireDiameter: 4,
  tolerance: 0.5,
  width: 25,
  wallThickness: 10,
  clipWallThickness: 10,
  clipCapHeight: 10,
  clipOpeningDepth: 13.5,
  bodyLength: 120,
  armLength: 100,
  armTopOffset: 50,
  stopperEnabled: true,
  stopperHeight: 10,
  stopperThickness: 10,
}

/**
 * Builds the bracket hook as an X-aligned extrusion of its ZY silhouette.
 * Slot ceiling is a CW arc over the wire (interior is CCW polygon overall).
 */
export function buildHookGeometry(params: HookParams): THREE.BufferGeometry {
  const d = DEFAULT_PARAMS
  const p: HookParams = {
    wireDiameter:      params.wireDiameter      ?? d.wireDiameter,
    tolerance:         params.tolerance         ?? d.tolerance,
    width:             params.width             ?? d.width,
    wallThickness:     params.wallThickness     ?? d.wallThickness,
    clipWallThickness: params.clipWallThickness ?? d.clipWallThickness,
    clipCapHeight:     params.clipCapHeight     ?? d.clipCapHeight,
    clipOpeningDepth:  params.clipOpeningDepth  ?? d.clipOpeningDepth,
    bodyLength:        params.bodyLength        ?? d.bodyLength,
    armLength:         params.armLength         ?? d.armLength,
    armTopOffset:      params.armTopOffset      ?? d.armTopOffset,
    stopperEnabled:    params.stopperEnabled    ?? d.stopperEnabled,
    stopperHeight:     params.stopperHeight     ?? d.stopperHeight,
    stopperThickness:  params.stopperThickness  ?? d.stopperThickness,
  }

  const wg        = p.wireDiameter / 2 + p.tolerance
  const zClipOut  = -(wg + p.clipWallThickness)
  const zSlotOut  = -wg
  const zBackOut  = wg
  const zBackIn   = wg + p.wallThickness
  const zArmTip   = zBackIn + p.armLength
  const zStopIn   = zArmTip - p.stopperThickness

  const yCapTop   = p.clipCapHeight
  const yClipBot  = -(wg + p.clipOpeningDepth)
  const yArmTop   = -p.armTopOffset
  const yStopTop  = yArmTop + p.stopperHeight
  const yBodyBot  = -p.bodyLength

  // Silhouette polygon vertices (CCW). Every labelled corner gets a fillet
  // below — none of these are raw polygon vertices on the final shape.
  const A: [number, number] = [zClipOut, yCapTop]  // top-left outer of clip cap
  const B: [number, number] = [zClipOut, yClipBot] // bottom-left of outer U-wall
  const C: [number, number] = [zSlotOut, yClipBot] // underside of clip, inner edge
  const D: [number, number] = [zSlotOut, 0]        // slot-left, tangent to arc
  const E: [number, number] = [zBackOut, 0]        // slot-right, tangent to arc
  const F: [number, number] = [zBackOut, yBodyBot] // back-wall outer bottom
  const G: [number, number] = [zArmTip, yArmTop]   // arm-tip bottom outer
  const H: [number, number] = [zArmTip, yStopTop]  // stopper top outer
  const I: [number, number] = [zStopIn,  yStopTop] // stopper top inner
  const J: [number, number] = [zStopIn,  yArmTop]  // stopper meets arm top
  const K: [number, number] = [zBackIn,  yArmTop]  // arm top meets back-wall inner
  const L: [number, number] = [zBackIn,  yCapTop]  // back-wall inner top

  // Fillet radii. None are user-configurable — rounded corners are just how
  // the model looks.
  //   rCos : cosmetic convex/concave fillets on the clip + brace silhouette.
  //   rTip : stopper-tip fillets (scale with stopper).
  //   rArm : structural stress-relief on the arm-to-spine concave corner (K).
  //          Matches wallThickness so it's proportional to the weakest section.
  const rCos = Math.min(p.wallThickness, p.clipWallThickness) / 2.5
  const rTip = Math.min(p.stopperThickness, p.stopperHeight) / 2.5
  const rArm = p.wallThickness

  const shape = new THREE.Shape()

  // Start on edge LA at t1 of A's fillet. closePath() at the end will draw the
  // final straight segment of LA from t2_of_L back to this point.
  shape.moveTo(zClipOut + rCos, yCapTop)

  // Clip cap + outer-U wall (convex A, B; concave C under the clip)
  filletCorner(shape, L, A, B, rCos)
  filletCorner(shape, A, B, C, rCos)
  filletCorner(shape, B, C, D, rCos)

  // Slot ceiling — CW half-arc OVER the wire. D and E are tangent to their
  // adjacent vertical edges (no fillet needed at either).
  shape.lineTo(D[0], D[1])
  shape.absarc(0, 0, wg, Math.PI, 0, true)   // D → E via top

  // Back-wall outer → diagonal brace bottom (convex F at the spine-to-brace
  // transition). filletCorner walks us from E onto EF and into the F arc.
  filletCorner(shape, E, F, G, rCos)

  // Arm tip
  if (p.stopperEnabled) {
    filletCorner(shape, F, G, H, rTip)  // G: brace → arm-tip vertical
    filletCorner(shape, G, H, I, rTip)  // H: stopper top outer
    filletCorner(shape, H, I, J, rTip)  // I: stopper top inner
    filletCorner(shape, I, J, K, rTip)  // J: stopper inner → arm top (concave)
    filletCorner(shape, J, K, L, rArm)  // K: arm top → spine (concave, stress relief)
  } else {
    filletCorner(shape, F, G, K, rTip)  // G alone: pointed tip without stopper
    filletCorner(shape, G, K, L, rArm)  // K: arm → spine (concave)
  }

  // Back-wall inner top corner (convex L)
  filletCorner(shape, K, L, A, rCos)

  shape.closePath()                      // straight along LA back to t1_of_A

  // Cut-through hole: triangular cutout flush with the back-wall-inner face, so
  // the back wall is one continuous strip of wallThickness (spine and the wall
  // behind the hole are the same wall). The top and diagonal edges are inset by
  // wallThickness to leave matching walls on those sides.
  {
    const m   = p.wallThickness
    const dz  = zArmTip - zBackOut
    const dy  = yArmTop - yBodyBot
    const len = Math.hypot(dz, dy)
    // Offset the diagonal inward (up-left) by m:
    const oz = zBackOut - m * dy / len
    const oy = yBodyBot + m * dz / len

    const p1z = zBackIn                          // flush with back-wall-inner
    const p1y = yArmTop - m
    const p2z = oz + dz * (p1y - oy) / dy        // inset-top  ∩ inset-diagonal
    const p3y = oy + dy * (p1z - oz) / dz        // Z=zBackIn  ∩ inset-diagonal

    if (p2z > p1z + 1 && p3y < p1y - 1) {
      const hole = new THREE.Path()
      hole.moveTo(p1z, p1y)
      hole.lineTo(p2z, p1y)
      hole.lineTo(p1z, p3y)
      hole.closePath()
      shape.holes.push(hole)
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: p.width,
    bevelEnabled: false,
    curveSegments: 24,
  })

  // Centre along the extrusion axis, then rotate so extrusion = world X
  geometry.translate(0, 0, -p.width / 2)
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2))

  return geometry
}

/**
 * Replace a sharp polygon corner with a circular fillet tangent to both edges.
 *
 * Assumes the enclosing shape is traced CCW (material to the LEFT of each
 * directed edge). Appends `lineTo(t1) + absarc(... → t2)`, so after the call
 * the shape's pen sits at `t2` on the outgoing edge — keep using `lineTo` for
 * the rest of that edge.
 *
 * Works for both convex and concave corners; the arc direction flips based on
 * the turn sign, but the centre is always on `corner + bisector × r/sin(θ/2)`
 * because the bisector naturally points into the interior for convex corners
 * and out for concave ones.
 */
function filletCorner(
  shape: THREE.Shape,
  prev: [number, number],
  corner: [number, number],
  next: [number, number],
  radius: number,
): void {
  const [px, py] = prev
  const [cx, cy] = corner
  const [nx, ny] = next

  let v1x = px - cx, v1y = py - cy
  const v1len = Math.hypot(v1x, v1y)
  v1x /= v1len; v1y /= v1len
  let v2x = nx - cx, v2y = ny - cy
  const v2len = Math.hypot(v2x, v2y)
  v2x /= v2len; v2y /= v2len

  const cosT = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y))
  const half = Math.acos(cosT) / 2

  const tanOff = radius / Math.tan(half)
  const t1x = cx + v1x * tanOff, t1y = cy + v1y * tanOff
  const t2x = cx + v2x * tanOff, t2y = cy + v2y * tanOff

  // Turn sign: cross(incoming, outgoing) = cross(-v1, v2). Positive = left
  // turn = convex corner on a CCW polygon.
  const convex = -(v1x * v2y - v1y * v2x) > 0

  let bx = v1x + v2x, by = v1y + v2y
  const blen = Math.hypot(bx, by)
  bx /= blen; by /= blen
  const centerDist = radius / Math.sin(half)
  const acx = cx + bx * centerDist
  const acy = cy + by * centerDist

  const a1 = Math.atan2(t1y - acy, t1x - acx)
  const a2 = Math.atan2(t2y - acy, t2x - acx)

  shape.lineTo(t1x, t1y)
  shape.absarc(acx, acy, radius, a1, a2, !convex)
}
