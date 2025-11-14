import * as THREE from "three";
import { Slot, SlotType, ConveyorParams, PlacedComponent } from "./types";
import { validateStopButtonCount, getStopButtonLimits } from "./params";

/**
 * Get valid slots for a component type based on current rules and state
 */
export function getValidSlots(
  type: SlotType,
  slots: Slot[],
  params: ConveyorParams,
  placedComponents: PlacedComponent[]
): Slot[] {
  let validSlots = slots.filter((slot) => slot.type === type && !slot.occupiedBy);

  // Apply type-specific filters
  switch (type) {
    case "ENGINE_MOUNT":
      validSlots = filterEngineMountSlots(validSlots, params.engineType);
      break;

    case "STOP_BUTTON":
      validSlots = filterStopButtonSlots(
        validSlots,
        params.stopButtonSide,
        params.stopButtonEnd,
        params.stopButtonCount || { motor: 0, opposite: 0 },
        params.model,
        placedComponents
      );
      break;

    case "SENSOR":
      validSlots = filterSensorSlots(validSlots, params);
      break;

    case "SIDE_GUIDE_BRACKET":
      validSlots = filterSideGuideSlots(validSlots, params);
      break;

    case "WHEEL":
    case "FRAME_LEG":
      // No additional filtering needed
      break;
  }

  return validSlots;
}

/**
 * Filter engine mount slots based on engine type
 */
function filterEngineMountSlots(
  slots: Slot[],
  engineType?: "NORMAL" | "REDACTOR" | "CENTRAL"
): Slot[] {
  if (!engineType) return [];

  if (engineType === "CENTRAL") {
    return slots.filter((slot) => slot.side === "CENTER");
  } else {
    return slots.filter((slot) => slot.side !== "CENTER");
  }
}

/**
 * Filter stop button slots based on side and end preferences
 */
function filterStopButtonSlots(
  slots: Slot[],
  side?: "MOTOR" | "OPPOSITE" | "BOTH",
  end?: "START" | "END" | "BOTH",
  counts: { motor: number; opposite: number },
  model: "DPS50" | "DPS60" | "DPS96",
  placedComponents: PlacedComponent[]
): Slot[] {
  if (!side) return [];

  // Count existing placements
  const existingCounts = {
    motor: placedComponents.filter(
      (c) => c.type === "STOP_BUTTON" && c.slotId.includes("motor")
    ).length,
    opposite: placedComponents.filter(
      (c) => c.type === "STOP_BUTTON" && c.slotId.includes("opposite")
    ).length,
  };

  const limits = getStopButtonLimits(model);

  // Filter by side
  let filtered = slots;
  if (side === "MOTOR") {
    filtered = filtered.filter((slot) => slot.side === "MOTOR" || slot.meta?.railSide === "LEFT");
    // Check if max reached
    if (existingCounts.motor >= limits.max) {
      return [];
    }
  } else if (side === "OPPOSITE") {
    filtered = filtered.filter((slot) => slot.side === "OPPOSITE" || slot.meta?.railSide === "RIGHT");
    // Check if max reached
    if (existingCounts.opposite >= limits.max) {
      return [];
    }
  }
  // BOTH: no side filtering, but check both counts
  else {
    if (existingCounts.motor >= limits.max && existingCounts.opposite >= limits.max) {
      return [];
    }
  }

  // Filter by end preference
  if (end && end !== "BOTH") {
    filtered = filtered.filter((slot) => slot.side === end || slot.meta?.zone === end);
  }

  return filtered;
}

/**
 * Filter sensor slots based on configuration
 */
function filterSensorSlots(slots: Slot[], params: ConveyorParams): Slot[] {
  // Sensors can be placed at start or end zones
  // For now, allow all sensor slots
  return slots;
}

/**
 * Filter side guide slots - only valid if side guide is enabled and height is valid
 */
function filterSideGuideSlots(slots: Slot[], params: ConveyorParams): Slot[] {
  if (!params.sideGuideEnabled) return [];
  if (!params.sideGuideHeight) return [];
  if (params.sideGuideHeight < 15 || params.sideGuideHeight > 250) return [];
  return slots;
}

/**
 * Find the nearest free slot to a point within snap radius
 */
export function nearestFreeSlot(
  point: THREE.Vector3,
  slots: Slot[],
  snapRadius: number = 0.04 // 40mm in scene units
): Slot | null {
  let nearest: Slot | null = null;
  let minDistance = snapRadius;

  for (const slot of slots) {
    if (slot.occupiedBy) continue; // Skip occupied slots

    const distance = point.distanceTo(slot.position);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = slot;
    }
  }

  return nearest;
}

/**
 * Reserve a slot for a component
 */
export function reserveSlot(slots: Slot[], slotId: string, componentId: string): Slot[] {
  return slots.map((slot) =>
    slot.id === slotId ? { ...slot, occupiedBy: componentId } : slot
  );
}

/**
 * Release a slot (remove component assignment)
 */
export function releaseSlot(slots: Slot[], slotId: string): Slot[] {
  return slots.map((slot) =>
    slot.id === slotId ? { ...slot, occupiedBy: undefined } : slot
  );
}

/**
 * Calculate component orientation from slot normal and up vectors
 */
export function calculateOrientation(slot: Slot): THREE.Euler {
  const normal = slot.normal.clone().normalize();
  const up = slot.up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const correctedUp = new THREE.Vector3().crossVectors(normal, right).normalize();
  const matrix = new THREE.Matrix4();
  matrix.makeBasis(right, correctedUp, normal);
  return new THREE.Euler().setFromRotationMatrix(matrix);
}


