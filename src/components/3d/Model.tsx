import { useEffect, useMemo } from 'react';
import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { useGLTF } from '@react-three/drei';

interface ModelProps {
  path?: string;
  fallback?: 'cube' | 'cylinder';
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  transparent?: boolean;
  color?: string;
  onLoaded?: (root: Object3D) => void;
}

// Generic model loader with base-centering and optional transparent preview
export function Model({ path, fallback = 'cube', position = [0,0,0], rotation=[0,0,0], scale = 1, transparent = false, color = '#0ea5e9', onLoaded }: ModelProps) {
  const gltf = path ? useGLTF(path) as any : undefined;

  const root = useMemo(() => {
    if (!path || !gltf || !gltf.scene) return undefined;
    const scene = gltf.scene.clone(true);
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    scene.position.sub(center); // center pivot
    // lift so base sits on y=0
    scene.position.y -= box.min.y;
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh;
        const mat = mesh.material as MeshStandardMaterial;
        if (transparent) {
          mesh.material = mat.clone();
          (mesh.material as MeshStandardMaterial).transparent = true;
          (mesh.material as MeshStandardMaterial).opacity = 0.4;
          (mesh.material as MeshStandardMaterial).color.set(color);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return scene;
  }, [gltf, path, transparent, color]);

  useEffect(() => {
    if (root && onLoaded) onLoaded(root);
  }, [root, onLoaded]);

  if (!root) {
    // Simple fallback geo
    if (fallback === 'cylinder') {
      return (
        <mesh position={position} rotation={rotation} scale={scale}>
          <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
          <meshStandardMaterial color={transparent ? color : '#888'} opacity={transparent ? 0.4 : 1} transparent={transparent} />
        </mesh>
      );
    }
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={transparent ? color : '#0ea5e9'} opacity={transparent ? 0.4 : 1} transparent={transparent} />
      </mesh>
    );
  }

  return (
    <primitive object={root as Group} position={position} rotation={rotation} scale={scale} />
  );
}


