import { useRef, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { API_BASE } from '@/lib/config';

interface DraggedComponentPreviewProps {
  component: any; // Component data from library
  position: THREE.Vector3 | null;
  camera: THREE.Camera | null;
}

/**
 * Red highlight preview of component being dragged from library
 * Similar to Item24's red highlight - shows the actual component shape in red
 */
function DraggedComponentPreviewContent({ component, position, camera, glbUrl }: DraggedComponentPreviewProps & { glbUrl: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const outlineRefs = useRef<THREE.LineSegments[]>([]);
  const modelRef = useRef<THREE.Group>(null);

  // Grid-based scaling: 1 grid unit = 100mm in real life
  const GRID_UNIT_SIZE_MM = 100; // 1 grid unit = 100mm
  const GLOBAL_SCALE_FACTOR = 1.0 / GRID_UNIT_SIZE_MM; // Convert mm to grid units (100mm = 1 grid unit)

  // glbUrl is already formatted and guaranteed to be valid at this point
  // useGLTF must be called unconditionally
  const { scene } = useGLTF(glbUrl, true);
  
  // Clone and apply red material to the model with proper scaling
  const redModel = useMemo(() => {
    if (!scene) {
      console.warn('No scene loaded for dragged preview');
      return null;
    }
    
    const cloned = scene.clone(true);
    
    // Reset transforms before measuring
    cloned.scale.set(1, 1, 1);
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    cloned.updateMatrixWorld(true);
    
    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // Scale model to grid units (same as scene models)
    if (size.x > 0 && size.y > 0 && size.z > 0) {
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = GLOBAL_SCALE_FACTOR / maxDim;
      cloned.scale.set(scale, scale, scale);
    } else {
      // Fallback scaling
      cloned.scale.set(GLOBAL_SCALE_FACTOR, GLOBAL_SCALE_FACTOR, GLOBAL_SCALE_FACTOR);
    }
    
    // Center the model
    cloned.position.sub(center.clone().multiplyScalar(cloned.scale.x));
    
    // Apply red material to all meshes
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        
        // Create red material
        const redMaterial = material.clone();
        redMaterial.color.set('#ff0000');
        redMaterial.transparent = true;
        redMaterial.opacity = 0.5;
        redMaterial.emissive.set('#ff0000');
        redMaterial.emissiveIntensity = 0.3;
        
        mesh.material = redMaterial;
      }
    });
    
    return cloned;
  }, [scene, GLOBAL_SCALE_FACTOR]);

  // Update position
  useEffect(() => {
    if (groupRef.current && position) {
      groupRef.current.position.copy(position);
    }
  }, [position]);

  // Create red outline for the model
  useEffect(() => {
    if (!redModel || !groupRef.current) return;

    // Clear previous outlines
    outlineRefs.current.forEach(ref => {
      if (ref.parent) ref.parent.remove(ref);
      ref.geometry.dispose();
      (ref.material as THREE.Material).dispose();
    });
    outlineRefs.current = [];

    // Create outline for each mesh
    redModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        try {
          const edges = new THREE.EdgesGeometry(mesh.geometry);
          const outline = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
              color: '#ff0000',
              linewidth: 3,
              transparent: true,
              opacity: 0.9
            })
          );
          
          // Match the mesh's world transform
          outline.position.copy(mesh.position);
          outline.rotation.copy(mesh.rotation);
          outline.scale.copy(mesh.scale);
          
          groupRef.current?.add(outline);
          outlineRefs.current.push(outline);
        } catch (error) {
          console.warn('Failed to create outline for mesh:', error);
        }
      }
    });

    return () => {
      outlineRefs.current.forEach(ref => {
        if (ref.parent) ref.parent.remove(ref);
        ref.geometry.dispose();
        (ref.material as THREE.Material).dispose();
      });
      outlineRefs.current = [];
    };
  }, [redModel]);

  // Animate red highlight
  useFrame((state) => {
    outlineRefs.current.forEach(outline => {
      const intensity = 0.8 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      (outline.material as THREE.LineBasicMaterial).opacity = intensity;
    });
  });

  if (!position || !redModel) return null;

  return (
    <group ref={groupRef}>
      <group ref={modelRef}>
        {/* Render the actual component model in red */}
        <primitive object={redModel} />
      </group>
    </group>
  );
}

export function DraggedComponentPreview({ component, position, camera }: DraggedComponentPreviewProps) {
  // Format URL early to check if it's valid
  const formatUrl = (url: string | null | undefined): string | null => {
    if (!url || url.trim() === '' || url === 'null') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
  };

  const formattedUrl = formatUrl(component?.glb_url);
  
  if (!position || !formattedUrl) return null;

  return (
    <Suspense fallback={null}>
      <DraggedComponentPreviewContent component={component} position={position} camera={camera} glbUrl={formattedUrl} />
    </Suspense>
  );
}

