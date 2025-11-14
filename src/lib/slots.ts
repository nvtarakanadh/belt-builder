import * as THREE from "three";
import { Slot, SlotType, ConveyorParams, Side } from "./types";
import { calculateDimensions } from "./params";

const GLOBAL_SCALE_FACTOR = 0.01; // Convert mm to scene units

/**
 * Generate all slots for a conveyor based on parameters
 */
export function generateSlots(params: ConveyorParams): Slot[] {
  const slots: Slot[] = [];
  const { L, N, D, R, model, engineType, sideGuideEnabled, sideGuideHeight, stopButtonSide, stopButtonCount, supportingFrame } = params;

  // Convert dimensions from mm to scene units
  const L_scene = L * GLOBAL_SCALE_FACTOR;
  const N_scene = N * GLOBAL_SCALE_FACTOR;
  const D_scene = D * GLOBAL_SCALE_FACTOR;
  const R_scene = R * GLOBAL_SCALE_FACTOR;

  // Conveyor frame dimensions (approximate)
  const frameHeight = 0.3 * GLOBAL_SCALE_FACTOR; // 300mm frame height
  const railHeight = 0.1 * GLOBAL_SCALE_FACTOR; // 100mm rail height
  const motorSideOffset = 0.2 * GLOBAL_SCALE_FACTOR; // Motor side offset

  // Generate ENGINE_MOUNT slots
  if (engineType) {
    slots.push(...generateEngineMountSlots(D_scene, R_scene, frameHeight, engineType));
  }

  // Generate STOP_BUTTON slots
  if (stopButtonSide) {
    slots.push(...generateStopButtonSlots(
      L_scene,
      R_scene,
      railHeight,
      stopButtonSide,
      stopButtonCount || { motor: 0, opposite: 0 },
      model
    ));
  }

  // Generate SENSOR slots
  slots.push(...generateSensorSlots(D_scene, R_scene, railHeight));

  // Generate SIDE_GUIDE_BRACKET slots
  if (sideGuideEnabled && sideGuideHeight && sideGuideHeight >= 15 && sideGuideHeight <= 250) {
    slots.push(...generateSideGuideBracketSlots(L_scene, R_scene, railHeight));
  }

  // Generate WHEEL slots (if supporting frame)
  if (supportingFrame) {
    slots.push(...generateWheelSlots(D_scene, R_scene));
  }

  // Generate FRAME_LEG slots (if supporting frame)
  if (supportingFrame) {
    slots.push(...generateFrameLegSlots(D_scene, R_scene, frameHeight));
  }

  return slots;
}

/**
 * Generate engine mount slots based on engine type
 */
function generateEngineMountSlots(
  D: number,
  R: number,
  frameHeight: number,
  engineType: "NORMAL" | "REDACTOR" | "CENTRAL"
): Slot[] {
  const slots: Slot[] = [];
  const motorY = frameHeight + 0.05; // Slightly above frame
  const motorZ = -R / 2 + 0.1; // Motor side

  if (engineType === "CENTRAL") {
    // Center mount slot
    slots.push({
      id: `engine_center_1`,
      type: "ENGINE_MOUNT",
      position: new THREE.Vector3(0, motorY, 0),
      normal: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(0, 0, 1),
      side: "CENTER",
      meta: { engineType: "CENTRAL" },
    });
  } else {
    // Side mount slots (motor side and opposite)
    slots.push({
      id: `engine_motor_1`,
      type: "ENGINE_MOUNT",
      position: new THREE.Vector3(0, motorY, motorZ),
      normal: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(0, 0, 1),
      side: "MOTOR",
      meta: { engineType },
    });

    slots.push({
      id: `engine_opposite_1`,
      type: "ENGINE_MOUNT",
      position: new THREE.Vector3(0, motorY, -motorZ),
      normal: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(0, 0, 1),
      side: "OPPOSITE",
      meta: { engineType },
    });
  }

  return slots;
}

/**
 * Generate stop button slots along rails
 */
function generateStopButtonSlots(
  L: number,
  R: number,
  railHeight: number,
  side: "MOTOR" | "OPPOSITE" | "BOTH",
  counts: { motor: number; opposite: number },
  model: "DPS50" | "DPS60" | "DPS96"
): Slot[] {
  const slots: Slot[] = [];
  const railY = railHeight + 0.02;
  const motorZ = -R / 2 + 0.05;
  const oppositeZ = R / 2 - 0.05;

  // Generate slots for motor side
  if (side === "MOTOR" || side === "BOTH") {
    const count = counts.motor;
    if (count > 0) {
      slots.push(...generateLinearSlots(
        L,
        railY,
        motorZ,
        count,
        "STOP_BUTTON",
        "MOTOR",
        "LEFT"
      ));
    }
  }

  // Generate slots for opposite side
  if (side === "OPPOSITE" || side === "BOTH") {
    const count = counts.opposite;
    if (count > 0) {
      slots.push(...generateLinearSlots(
        L,
        railY,
        oppositeZ,
        count,
        "STOP_BUTTON",
        "OPPOSITE",
        "RIGHT"
      ));
    }
  }

  return slots;
}

/**
 * Generate evenly spaced slots along a line
 */
function generateLinearSlots(
  length: number,
  y: number,
  z: number,
  count: number,
  type: SlotType,
  side: Side,
  railSide: "LEFT" | "RIGHT"
): Slot[] {
  const slots: Slot[] = [];
  const startX = -length / 2;
  const endX = length / 2;
  const spacing = count > 1 ? (endX - startX) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : startX + i * spacing;
    const endType: Side = i === 0 ? "START" : i === count - 1 ? "END" : "CENTER";
    
    slots.push({
      id: `${type.toLowerCase()}_${side.toLowerCase()}_${railSide.toLowerCase()}_${i}`,
      type,
      position: new THREE.Vector3(x, y, z),
      normal: new THREE.Vector3(0, 0, z > 0 ? -1 : 1),
      up: new THREE.Vector3(0, 1, 0),
      side: endType,
      meta: { index: i, total: count, railSide },
    });
  }

  return slots;
}

/**
 * Generate sensor slots (4 total: start/end on motor and opposite sides)
 */
function generateSensorSlots(
  D: number,
  R: number,
  railHeight: number
): Slot[] {
  const slots: Slot[] = [];
  const sensorY = railHeight + 0.03;
  const motorZ = -R / 2 + 0.05;
  const oppositeZ = R / 2 - 0.05;
  const startX = -D / 2 + 0.2;
  const endX = D / 2 - 0.2;

  // Motor side - start
  slots.push({
    id: "sensor_motor_start",
    type: "SENSOR",
    position: new THREE.Vector3(startX, sensorY, motorZ),
    normal: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    side: "MOTOR",
    meta: { zone: "START" },
  });

  // Motor side - end
  slots.push({
    id: "sensor_motor_end",
    type: "SENSOR",
    position: new THREE.Vector3(endX, sensorY, motorZ),
    normal: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    side: "MOTOR",
    meta: { zone: "END" },
  });

  // Opposite side - start
  slots.push({
    id: "sensor_opposite_start",
    type: "SENSOR",
    position: new THREE.Vector3(startX, sensorY, oppositeZ),
    normal: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    side: "OPPOSITE",
    meta: { zone: "START" },
  });

  // Opposite side - end
  slots.push({
    id: "sensor_opposite_end",
    type: "SENSOR",
    position: new THREE.Vector3(endX, sensorY, oppositeZ),
    normal: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    side: "OPPOSITE",
    meta: { zone: "END" },
  });

  return slots;
}

/**
 * Generate side guide bracket slots along both sides
 */
function generateSideGuideBracketSlots(
  L: number,
  R: number,
  railHeight: number
): Slot[] {
  const slots: Slot[] = [];
  const bracketY = railHeight;
  const leftZ = -R / 2;
  const rightZ = R / 2;
  const spacing = 0.3; // 300mm spacing between brackets
  const count = Math.floor(L / spacing);

  // Left side brackets
  for (let i = 0; i < count; i++) {
    const x = -L / 2 + (i + 0.5) * spacing;
    slots.push({
      id: `sideguide_left_${i}`,
      type: "SIDE_GUIDE_BRACKET",
      position: new THREE.Vector3(x, bracketY, leftZ),
      normal: new THREE.Vector3(0, 0, 1),
      up: new THREE.Vector3(0, 1, 0),
      side: "LEFT",
      meta: { index: i },
    });
  }

  // Right side brackets
  for (let i = 0; i < count; i++) {
    const x = -L / 2 + (i + 0.5) * spacing;
    slots.push({
      id: `sideguide_right_${i}`,
      type: "SIDE_GUIDE_BRACKET",
      position: new THREE.Vector3(x, bracketY, rightZ),
      normal: new THREE.Vector3(0, 0, -1),
      up: new THREE.Vector3(0, 1, 0),
      side: "RIGHT",
      meta: { index: i },
    });
  }

  return slots;
}

/**
 * Generate wheel slots (4 corners)
 */
function generateWheelSlots(D: number, R: number): Slot[] {
  const slots: Slot[] = [];
  const wheelY = 0.05;
  const halfD = D / 2;
  const halfR = R / 2;

  const corners = [
    { x: -halfD, z: -halfR, id: "wheel_front_left" },
    { x: halfD, z: -halfR, id: "wheel_back_left" },
    { x: -halfD, z: halfR, id: "wheel_front_right" },
    { x: halfD, z: halfR, id: "wheel_back_right" },
  ];

  corners.forEach(({ x, z, id }) => {
    slots.push({
      id,
      type: "WHEEL",
      position: new THREE.Vector3(x, wheelY, z),
      normal: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(1, 0, 0),
      meta: { corner: id },
    });
  });

  return slots;
}

/**
 * Generate frame leg slots (4 corners, possibly more based on length)
 */
function generateFrameLegSlots(
  D: number,
  R: number,
  frameHeight: number
): Slot[] {
  const slots: Slot[] = [];
  const legY = -frameHeight / 2;
  const halfD = D / 2;
  const halfR = R / 2;

  // Always 4 corner legs
  const corners = [
    { x: -halfD, z: -halfR, id: "leg_front_left" },
    { x: halfD, z: -halfR, id: "leg_back_left" },
    { x: -halfD, z: halfR, id: "leg_front_right" },
    { x: halfD, z: halfR, id: "leg_back_right" },
  ];

  corners.forEach(({ x, z, id }) => {
    slots.push({
      id,
      type: "FRAME_LEG",
      position: new THREE.Vector3(x, legY, z),
      normal: new THREE.Vector3(0, -1, 0),
      up: new THREE.Vector3(1, 0, 0),
      meta: { corner: id },
    });
  });

  // Add intermediate legs if length is large (> 2m)
  if (D > 2.0) {
    const intermediateCount = Math.floor(D / 1.0) - 1;
    for (let i = 1; i <= intermediateCount; i++) {
      const x = -halfD + (i * D) / (intermediateCount + 1);
      slots.push(
        {
          id: `leg_intermediate_left_${i}`,
          type: "FRAME_LEG",
          position: new THREE.Vector3(x, legY, -halfR),
          normal: new THREE.Vector3(0, -1, 0),
          up: new THREE.Vector3(1, 0, 0),
          meta: { intermediate: true, index: i },
        },
        {
          id: `leg_intermediate_right_${i}`,
          type: "FRAME_LEG",
          position: new THREE.Vector3(x, legY, halfR),
          normal: new THREE.Vector3(0, -1, 0),
          up: new THREE.Vector3(1, 0, 0),
          meta: { intermediate: true, index: i },
        }
      );
    }
  }

  return slots;
}

