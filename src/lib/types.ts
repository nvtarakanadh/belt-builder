import * as THREE from "three";

export type SlotType = 
  | "ENGINE_MOUNT" 
  | "STOP_BUTTON" 
  | "SENSOR" 
  | "SIDE_GUIDE_BRACKET" 
  | "WHEEL" 
  | "FRAME_LEG";

export type ConveyorModel = "DPS50" | "DPS60" | "DPS96";

export type EngineType = "NORMAL" | "REDACTOR" | "CENTRAL";

export type Side = "MOTOR" | "OPPOSITE" | "CENTER" | "LEFT" | "RIGHT" | "END" | "START";

export interface Slot {
  id: string;
  type: SlotType;
  position: THREE.Vector3;
  normal: THREE.Vector3;  // for orienting the part
  up: THREE.Vector3;      // secondary axis if needed
  occupiedBy?: string;    // component id
  side?: Side;
  meta?: Record<string, any>; // pitch index, etc.
}

export interface ConveyorParams {
  L: number;  // Axis to axis length (user input)
  N: number;  // Belt width (user input)
  D: number;  // Total length (calculated: L + offset)
  R: number;  // Conveyor width (calculated: N + 67)
  model: ConveyorModel;
  engineType?: EngineType;
  sideGuideHeight?: number;  // 15-250 mm
  sideGuideEnabled?: boolean;
  stopButtonSide?: "MOTOR" | "OPPOSITE" | "BOTH";
  stopButtonEnd?: "START" | "END" | "BOTH";
  stopButtonCount?: {
    motor: number;
    opposite: number;
  };
  supportingFrame?: boolean;
  frameHeight?: number;
  frameWheels?: boolean;
}

export interface PlacedComponent {
  id: string;
  type: SlotType;
  slotId: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  modelUrl?: string;
  name: string;
}

