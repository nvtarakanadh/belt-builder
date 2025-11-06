import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Helper component to coordinate TransformControls and OrbitControls
 * This ensures OrbitControls are disabled when TransformControls are being dragged
 */
export function TransformControlsHelper() {
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    // Find OrbitControls
    const orbitControls = scene.children.find(
      (child) => child.userData.type === 'OrbitControls'
    ) as any;

    // Listen for TransformControls dragging events
    const handleTransformStart = () => {
      if (orbitControls) {
        orbitControls.enabled = false;
      }
    };

    const handleTransformEnd = () => {
      if (orbitControls) {
        orbitControls.enabled = true;
      }
    };

    // Monitor for TransformControls in the scene
    const checkForTransformControls = () => {
      scene.traverse((child) => {
        if (child instanceof ThreeTransformControls) {
          child.addEventListener('dragging-changed', (e: any) => {
            if (e.value) {
              handleTransformStart();
            } else {
              handleTransformEnd();
            }
          });
        }
      });
    };

    checkForTransformControls();
    
    // Also check periodically in case TransformControls are added dynamically
    const interval = setInterval(checkForTransformControls, 100);

    return () => {
      clearInterval(interval);
    };
  }, [scene, camera, gl]);

  return null;
}

