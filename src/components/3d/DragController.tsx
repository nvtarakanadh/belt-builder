import { useRef, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SlotType, Slot } from "@/lib/types";
import { nearestFreeSlot, calculateOrientation, getValidSlots } from "@/lib/placement";
import { usePlacementStore } from "@/state/store";
import { toast } from "sonner";

interface DragControllerProps {
  slots: Slot[];
}

export function DragController({ slots }: DragControllerProps) {
  const { camera, raycaster, gl } = useThree();
  const {
    draggingType,
    setDraggingType,
    placeComponent,
    params,
    components,
    setHoveredSlot,
  } = usePlacementStore();

  const [ghostPosition, setGhostPosition] = useState<THREE.Vector3 | null>(null);
  const [targetSlot, setTargetSlot] = useState<Slot | null>(null);
  const mouseRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());

  // Handle mouse move for raycasting
  useEffect(() => {
    if (!draggingType) {
      setGhostPosition(null);
      setTargetSlot(null);
      setHoveredSlot(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast against a ground plane
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectionPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(groundPlane, intersectionPoint);

      if (intersectionPoint) {
        setGhostPosition(intersectionPoint);

        // Find nearest valid slot
        const validSlots = getValidSlots(draggingType, slots, params, components);
        const nearest = nearestFreeSlot(intersectionPoint, validSlots, 0.04);

        if (nearest) {
          setTargetSlot(nearest);
          setHoveredSlot(nearest.id);
          setGhostPosition(nearest.position);
        } else {
          setTargetSlot(null);
          setHoveredSlot(null);
        }
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (draggingType && targetSlot) {
        // Place component
        const componentName = getComponentName(draggingType);
        placeComponent(draggingType, targetSlot.id, componentName);
        
        const sideLabel = targetSlot.side || "";
        const zoneLabel = targetSlot.meta?.zone || "";
        toast.success(`Placed ${componentName}${sideLabel ? ` on ${sideLabel}` : ""}${zoneLabel ? ` • ${zoneLabel}` : ""}`);
      } else if (draggingType) {
        toast.error("No valid slot found. Release over a highlighted slot.");
      }

      setDraggingType(null);
      setGhostPosition(null);
      setTargetSlot(null);
      setHoveredSlot(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && draggingType) {
        setDraggingType(null);
        setGhostPosition(null);
        setTargetSlot(null);
        setHoveredSlot(null);
        toast.info("Placement cancelled");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [draggingType, slots, params, components, camera, gl, targetSlot, setDraggingType, placeComponent, setHoveredSlot]);

  // Render ghost preview
  if (!draggingType || !ghostPosition || !targetSlot) {
    return null;
  }

  const rotation = calculateOrientation(targetSlot);

  return (
    <mesh position={ghostPosition} rotation={rotation}>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial
        color={0x00ff00}
        transparent
        opacity={0.5}
        emissive={0x00ff00}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

function getComponentName(type: SlotType): string {
  const names: Record<SlotType, string> = {
    ENGINE_MOUNT: "Engine",
    STOP_BUTTON: "Stop Button",
    SENSOR: "Sensor",
    SIDE_GUIDE_BRACKET: "Side Guide",
    WHEEL: "Wheel",
    FRAME_LEG: "Frame Leg",
  };
  return names[type] || "Component";
}

