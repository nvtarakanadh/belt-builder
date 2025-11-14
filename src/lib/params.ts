import { ConveyorParams, ConveyorModel } from "./types";

/**
 * Calculate derived dimensions D and R from user inputs L and N
 */
export function calculateDimensions(
  L: number,
  N: number,
  model: ConveyorModel
): { D: number; R: number } {
  let D = 0;
  
  switch (model) {
    case "DPS50":
      D = L + 55;
      break;
    case "DPS60":
      D = L + 70;
      break;
    case "DPS96":
      D = L + 100;
      break;
  }
  
  // R = N + 67 for all models
  const R = N + 67;
  
  return { D, R };
}

/**
 * Validate side guide height (15-250 mm)
 */
export function validateSideGuideHeight(height: number): {
  valid: boolean;
  error?: string;
} {
  if (height < 15) {
    return {
      valid: false,
      error: "Height must be at least 15 mm",
    };
  }
  if (height > 250) {
    return {
      valid: false,
      error: "Height must not exceed 250 mm",
    };
  }
  return { valid: true };
}

/**
 * Get stop button min/max counts based on model
 */
export function getStopButtonLimits(model: ConveyorModel): {
  min: number;
  max: number;
} {
  switch (model) {
    case "DPS50":
      return { min: 1, max: 6 };
    case "DPS60":
    case "DPS96":
      return { min: 1, max: 12 };
    default:
      return { min: 1, max: 6 };
  }
}

/**
 * Validate stop button count
 */
export function validateStopButtonCount(
  count: number,
  model: ConveyorModel,
  side: "motor" | "opposite"
): { valid: boolean; error?: string } {
  const limits = getStopButtonLimits(model);
  
  if (count < limits.min) {
    return {
      valid: false,
      error: `Min ${limits.min} stop button${limits.min > 1 ? "s" : ""} required for ${model}`,
    };
  }
  
  if (count > limits.max) {
    return {
      valid: false,
      error: `Max ${limits.max} stop button${limits.max > 1 ? "s" : ""} allowed for ${model} (min ${limits.min})`,
    };
  }
  
  return { valid: true };
}

