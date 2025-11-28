import { useEffect, useState, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneComponent } from '@/types';

export interface AttachPoint {
  position: [number, number, number];
  frameId: string;
  frame: SceneComponent;
}

interface FixedLegPlacementHelperProps {
  components: SceneComponent[];
  isDraggingFixedLeg: boolean;
  dragPosition: THREE.Vector3 | null;
  onAttachPointFound: (attachPoint: AttachPoint | null) => void;
}

/**
 * Helper component that detects valid attach points for Fixed Legs on frames/beds
 * and provides visual feedback during drag
 */
export function FixedLegPlacementHelper({
  components,
  isDraggingFixedLeg,
  dragPosition,
  onAttachPointFound,
}: FixedLegPlacementHelperProps) {
  const { camera, raycaster, gl } = useThree();
  const [hoveredFrame, setHoveredFrame] = useState<SceneComponent | null>(null);
  const [attachPoint, setAttachPoint] = useState<AttachPoint | null>(null);
  const mouseRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());

  // Calculate attach points on a frame/bed
  const calculateAttachPoints = (frame: SceneComponent): AttachPoint[] => {
    const attachPoints: AttachPoint[] = [];
    
    if (!frame.bounding_box) {
      const lengthGrid = 2.0;
      const widthGrid = 0.6;
      const LEG_OFFSET_GRID = 0.1;
      const LEG_Y = 0.75;

      const frameX = frame.position[0];
      const frameZ = frame.position[2];

      const leftEdge = frameX - (lengthGrid / 2);
      const rightEdge = frameX + (lengthGrid / 2);
      const frontEdge = frameZ - (widthGrid / 2);
      const backEdge = frameZ + (widthGrid / 2);

      // Default assume longer in X
      attachPoints.push({ position: [leftEdge + LEG_OFFSET_GRID, LEG_Y, frontEdge + LEG_OFFSET_GRID], frameId: frame.id, frame });
      attachPoints.push({ position: [leftEdge + LEG_OFFSET_GRID, LEG_Y, backEdge - LEG_OFFSET_GRID], frameId: frame.id, frame });
      attachPoints.push({ position: [rightEdge - LEG_OFFSET_GRID, LEG_Y, frontEdge + LEG_OFFSET_GRID], frameId: frame.id, frame });
      attachPoints.push({ position: [rightEdge - LEG_OFFSET_GRID, LEG_Y, backEdge - LEG_OFFSET_GRID], frameId: frame.id, frame });
      return attachPoints;
    }

    const frameName = (frame.name || '').toLowerCase();
    const frameCategory = (frame.category || '').toLowerCase();
    const isBed = frameName.includes('bed') || frameCategory.includes('bed');
    const isConveyor = frameName.includes('conveyor') || frameCategory.includes('conveyor') || frameName.includes('belt') || frameCategory.includes('belt');
    const isBase = frameName.includes('base') || frameCategory.includes('base');
    const isFrame = isBed || isConveyor || isBase || frameName.includes('frame') || frameCategory.includes('frame');

    if (!isFrame) return attachPoints;

    // Get frame dimensions
    const lengthMm = Math.abs((frame.bounding_box.max?.[0] || 0) - (frame.bounding_box.min?.[0] || 0));
    const widthMm = Math.abs((frame.bounding_box.max?.[2] || 0) - (frame.bounding_box.min?.[2] || 0));
    const heightMm = Math.abs((frame.bounding_box.max?.[1] || 0) - (frame.bounding_box.min?.[1] || 0));

    const lengthGrid = lengthMm / 100;
    const widthGrid = widthMm / 100;
    const heightGrid = heightMm / 100;

    const frameX = frame.position[0];
    const frameY = frame.position[1];
    const frameZ = frame.position[2];
    const rotY = (frame.rotation?.[1] || 0);

    // Determine which axis is the length (longer dimension)
    const isLongerInX = lengthGrid > widthGrid;

    // Fixed Leg offset from edge (10mm = 0.1 grid units)
    const LEG_OFFSET_MM = 10.0;
    const LEG_OFFSET_GRID = LEG_OFFSET_MM / 100;
    const LEG_Y = 0.75; // Fixed Legs are always at Y: 0.75

    // Calculate edges
    const halfL = lengthGrid / 2;
    const halfW = widthGrid / 2;

    const rotateOffset = (dx: number, dz: number): [number, number] => {
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [rx, rz];
    };

    if (isLongerInX) {
      // Frame extends in X direction - attach points on left and right sides
      // Left side attach points (front and back)
      // Left side
      let [ox, oz] = rotateOffset(-halfL + LEG_OFFSET_GRID, -halfW + LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
      [ox, oz] = rotateOffset(-halfL + LEG_OFFSET_GRID, halfW - LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });

      // Right side
      [ox, oz] = rotateOffset(halfL - LEG_OFFSET_GRID, -halfW + LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
      [ox, oz] = rotateOffset(halfL - LEG_OFFSET_GRID, halfW - LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
    } else {
      // Front side
      let [ox, oz] = rotateOffset(-halfL + LEG_OFFSET_GRID, -halfW + LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
      [ox, oz] = rotateOffset(halfL - LEG_OFFSET_GRID, -halfW + LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });

      // Back side
      [ox, oz] = rotateOffset(-halfL + LEG_OFFSET_GRID, halfW - LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
      [ox, oz] = rotateOffset(halfL - LEG_OFFSET_GRID, halfW - LEG_OFFSET_GRID);
      attachPoints.push({ position: [frameX + ox, LEG_Y, frameZ + oz], frameId: frame.id, frame });
    }

    return attachPoints;
  };

  // Find the nearest attach point to a given position
  const findNearestAttachPoint = (
    position: THREE.Vector3,
    maxDistance: number = Infinity
  ): AttachPoint | null => {
    if (!isDraggingFixedLeg || !dragPosition) return null;

    const frames = components.filter(comp => {
      const compName = (comp.name || '').toLowerCase();
      const compCategory = (comp.category || '').toLowerCase();
      return [compName, compCategory].some((s) =>
        s.includes('bed') || s.includes('frame') || s.includes('base') || s.includes('conveyor') || s.includes('belt')
      );
    });

    let nearestPoint: AttachPoint | null = null;
    let minDistance = Infinity;

    for (const frame of frames) {
      const attachPoints = calculateAttachPoints(frame);
      
      for (const point of attachPoints) {
        const dx = position.x - point.position[0];
        const dz = position.z - point.position[2];
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < minDistance && distance <= maxDistance) {
          minDistance = distance;
          nearestPoint = point;
        }
      }
    }

    return nearestPoint;
  };

  // Update attach point detection when dragging
  useEffect(() => {
    if (!isDraggingFixedLeg || !dragPosition) {
      setAttachPoint(null);
      setHoveredFrame(null);
      onAttachPointFound(null);
      return;
    }

    const nearest = findNearestAttachPoint(dragPosition);
    setAttachPoint(nearest);
    setHoveredFrame(nearest?.frame || null);
    onAttachPointFound(nearest);
  }, [isDraggingFixedLeg, dragPosition, components]);

  return null; // This component doesn't render anything itself
}

