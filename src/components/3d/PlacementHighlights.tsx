import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Slot, SlotType } from "@/lib/types";
import { getValidSlots } from "@/lib/placement";
import { usePlacementStore } from "@/state/store";

interface PlacementHighlightsProps {
  slots: Slot[];
}

export function PlacementHighlights({ slots }: PlacementHighlightsProps) {
  const { draggingType, hoveredSlotId, params, components } = usePlacementStore();
  const markerRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  // Get valid slots for the current drag type
  const validSlots = useMemo(() => {
    if (!draggingType) return [];
    return getValidSlots(draggingType, slots, params, components);
  }, [draggingType, slots, params, components]);

  // Create marker geometries and materials
  const { ringGeometry, capGeometry, validMaterial, invalidMaterial, occupiedMaterial, hoverMaterial } = useMemo(() => {
    const ring = new THREE.RingGeometry(0.015, 0.025, 16);
    const cap = new THREE.ConeGeometry(0.01, 0.02, 8);
    
    const valid = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });
    
    const invalid = new THREE.MeshStandardMaterial({
      color: 0x666666,
      emissive: 0x333333,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.4,
    });
    
    const occupied = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
    });
    
    const hover = new THREE.MeshStandardMaterial({
      color: 0x00b4d8,
      emissive: 0x00b4d8,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 1.0,
    });

    return { ringGeometry: ring, capGeometry: cap, validMaterial: valid, invalidMaterial: invalid, occupiedMaterial: occupied, hoverMaterial: hover };
  }, []);

  // Update marker visibility and materials
  useFrame(() => {
    slots.forEach((slot) => {
      const marker = markerRefs.current.get(slot.id);
      if (!marker) return;

      const isValid = validSlots.some((s) => s.id === slot.id);
      const isHovered = hoveredSlotId === slot.id;
      const isOccupied = !!slot.occupiedBy;

      if (draggingType) {
        marker.visible = true;
        if (isHovered && isValid && !isOccupied) {
          marker.material = hoverMaterial;
        } else if (isOccupied) {
          marker.material = occupiedMaterial;
        } else if (isValid) {
          marker.material = validMaterial;
        } else {
          marker.material = invalidMaterial;
        }
      } else {
        marker.visible = false;
      }
    });
  });

  return (
    <group>
      {slots.map((slot) => (
        <group key={slot.id} position={slot.position}>
          {/* Ring marker */}
          <mesh
            ref={(ref) => {
              if (ref) markerRefs.current.set(slot.id, ref);
            }}
            geometry={ringGeometry}
            material={validMaterial}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          />
          {/* Cap marker */}
          <mesh
            geometry={capGeometry}
            material={validMaterial}
            position={[0, 0.01, 0]}
            visible={draggingType !== null}
          />
          {/* Lock icon for occupied slots */}
          {slot.occupiedBy && (
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.005, 0.01, 8]} />
              <meshStandardMaterial color={0xff0000} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

