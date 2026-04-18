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
  wallThickness: 6,
  clipWallThickness: 6,
  clipCapHeight: 9,
  clipOpeningDepth: 11,
  bodyLength: 95,
  armLength: 100,
  armTopOffset: 41,
  stopperEnabled: true,
  stopperHeight: 10,
  stopperThickness: 6,
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

  const shape = new THREE.Shape()

  // Clip cap + outer-U wall
  shape.moveTo(zClipOut, yCapTop)          // A: top-left of clip cap
  shape.lineTo(zClipOut, yClipBot)         // B: outer-U wall, bottom
  shape.lineTo(zSlotOut, yClipBot)         // C: underside of clip, inner edge
  shape.lineTo(zSlotOut, 0)                // D: slot-left at wire-center height

  // Slot ceiling — CW half-arc OVER the wire (interior material above arc)
  shape.absarc(0, 0, wg, Math.PI, 0, true) // D → E via top

  // Back-wall outer face down to body bottom
  shape.lineTo(zBackOut, yBodyBot)         // F

  // Diagonal underside of brace up to arm tip
  shape.lineTo(zArmTip, yArmTop)           // G

  // Arm tip: optional stopper
  if (p.stopperEnabled) {
    shape.lineTo(zArmTip, yStopTop)        // H
    shape.lineTo(zStopIn, yStopTop)        // I
    shape.lineTo(zStopIn, yArmTop)         // J
  }

  // Arm top horizontal back to back-wall inner
  shape.lineTo(zBackIn, yArmTop)           // K

  // Back-wall inner face up to clip cap top
  shape.lineTo(zBackIn, yCapTop)           // L

  shape.closePath()                        // L → A along horizontal top

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
