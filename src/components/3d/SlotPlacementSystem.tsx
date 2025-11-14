import { useEffect } from "react";
import { PlacementHighlights } from "./PlacementHighlights";
import { DragController } from "./DragController";
import { usePlacementStore } from "@/state/store";
import * as THREE from "three";

/**
 * Slot-based placement system component
 * Integrates with the placement store to show slots and handle drag/drop
 */
export function SlotPlacementSystem() {
  const { slots, components, regenerateSlots, params } = usePlacementStore();

  // Regenerate slots when params change
  useEffect(() => {
    regenerateSlots();
  }, [params.L, params.N, params.model, params.engineType, params.sideGuideEnabled, params.sideGuideHeight, params.stopButtonSide, params.supportingFrame, regenerateSlots]);

  return (
    <>
      {/* Render slot highlights */}
      <PlacementHighlights slots={slots} />

      {/* Drag controller for placement */}
      <DragController slots={slots} />

      {/* Render placed components */}
      {components.map((component) => (
        <PlacedComponentRenderer key={component.id} component={component} />
      ))}
    </>
  );
}

/**
 * Render a placed component at its slot position
 */
function PlacedComponentRenderer({ component }: { component: any }) {
  const position: [number, number, number] = [
    component.position.x,
    component.position.y,
    component.position.z,
  ];

  const rotation: [number, number, number] = [
    component.rotation.x,
    component.rotation.y,
    component.rotation.z,
  ];

  // For now, render a placeholder box
  // In the future, this could load the actual component model from component.modelUrl
  const colors: Record<string, number> = {
    ENGINE_MOUNT: 0xff6b00,
    STOP_BUTTON: 0xff0000,
    SENSOR: 0x00ff00,
    SIDE_GUIDE_BRACKET: 0x0000ff,
    WHEEL: 0x888888,
    FRAME_LEG: 0x444444,
  };

  const color = colors[component.type] || 0x00b4d8;

  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

