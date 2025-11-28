import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { Lock, Unlock } from 'lucide-react';

interface FloatingLockUIProps {
  component1: { id: string; position: [number, number, number] };
  component2: { id: string; position: [number, number, number] };
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  isLocked: boolean;
  distance: number;
  onLock: () => void;
  onUnlock: () => void;
}

export const FloatingLockUI = ({
  component1,
  component2,
  camera,
  renderer,
  isLocked,
  distance,
  onLock,
  onUnlock,
}: FloatingLockUIProps) => {
  const [screenPosition, setScreenPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!camera || !renderer || !renderer.domElement) {
      setScreenPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!camera || !renderer || !renderer.domElement) return;
      
      try {
        // Calculate midpoint in world space
        const pos1 = new THREE.Vector3(...component1.position);
        const pos2 = new THREE.Vector3(...component2.position);
        const midpoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);

        // Project to screen space
        const vector = midpoint.clone().project(camera);
        
        // Get renderer dimensions from getBoundingClientRect for accurate screen position
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          // Renderer not ready yet
          return;
        }
        
        const widthHalf = rect.width / 2;
        const heightHalf = rect.height / 2;

        const x = (vector.x * widthHalf) + widthHalf;
        const y = -(vector.y * heightHalf) + heightHalf;

        // Clamp to screen edges (with padding)
        const padding = 10;
        const clampedX = Math.max(padding, Math.min(rect.width - padding, x));
        const clampedY = Math.max(padding, Math.min(rect.height - padding, y));

        setScreenPosition({ x: clampedX, y: clampedY });
      } catch (error) {
        console.error('Error updating lock UI position:', error);
        setScreenPosition(null);
      }
    };

    // Initial update
    updatePosition();

    // Update on animation frame
    let frameId: number;
    const animate = () => {
      updatePosition();
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [camera, renderer, component1.position, component2.position]);

  if (!screenPosition) return null;

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-auto z-50"
      style={{
        left: `${screenPosition.x}px`,
        top: `${screenPosition.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="bg-white rounded-full px-3 py-1.5 shadow-md border border-gray-200/50 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700 min-w-[2.5rem] text-center">
          {Math.round(distance)}
        </span>
        
        {/* Single toggle icon that changes based on lock state */}
        <button
          onClick={isLocked ? onUnlock : onLock}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title={isLocked ? 'Unlock' : 'Lock'}
        >
          {isLocked ? (
            <Lock className="h-4 w-4 text-red-500 fill-red-500" />
          ) : (
            <Unlock className="h-4 w-4 text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
};

