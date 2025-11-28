import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneComponent } from '@/types';

interface FrameHighlightProps {
  frame: SceneComponent;
  isHighlighted: boolean;
}

/**
 * Visual highlight component for frames/beds when dragging Fixed Legs
 */
export function FrameHighlight({ frame, isHighlighted }: FrameHighlightProps) {
  const outlineRef = useRef<THREE.LineSegments>(null);

  // Calculate frame dimensions
  const getFrameDimensions = () => {
    if (!frame.bounding_box) {
      return { width: 1, height: 0.3, length: 1, center: [0, 0, 0] as [number, number, number] };
    }

    const width = Math.abs((frame.bounding_box.max?.[0] || 0) - (frame.bounding_box.min?.[0] || 0)) / 100;
    const height = Math.abs((frame.bounding_box.max?.[1] || 0) - (frame.bounding_box.min?.[1] || 0)) / 100;
    const length = Math.abs((frame.bounding_box.max?.[2] || 0) - (frame.bounding_box.min?.[2] || 0)) / 100;

    return { width, height, length, center: frame.position };
  };

  const { width, height, length, center } = getFrameDimensions();

  // Create outline geometry
  useEffect(() => {
    if (!outlineRef.current) return;

    const geometry = new THREE.BoxGeometry(width, height, length);
    const edges = new THREE.EdgesGeometry(geometry);
    outlineRef.current.geometry.dispose();
    outlineRef.current.geometry = edges;
  }, [width, height, length]);

  useFrame(() => {});

  if (!isHighlighted) return null;

  return (
    <group position={center}>
      <lineSegments ref={outlineRef}>
        <lineBasicMaterial 
          color="#00b4d8" 
          linewidth={3}
          transparent
          opacity={0.8}
        />
      </lineSegments>
    </group>
  );
}

