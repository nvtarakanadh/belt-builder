import { useRef, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';
import { AttachPoint } from './FixedLegPlacementHelper';
import { API_BASE } from '@/lib/config';

interface FixedLegGhostPreviewProps {
  attachPoint: AttachPoint | null;
  legModelUrl?: string;
  legBoundingBox?: { min: [number, number, number]; max: [number, number, number] } | null;
}

interface FixedLegGhostPreviewContentProps {
  attachPoint: AttachPoint;
  legModelUrl: string;
  legBoundingBox?: { min: [number, number, number]; max: [number, number, number] } | null;
}

/**
 * Blue outline preview at attach point - shows "this component belongs here"
 * Similar to Item24's blue indication highlight
 * Shows only a wireframe outline to indicate the placement position
 */
function FixedLegGhostPreviewContent({ attachPoint, legModelUrl, legBoundingBox }: FixedLegGhostPreviewContentProps) {
  const groupRef = useRef<THREE.Group>(null);
  const outlinesRef = useRef<THREE.LineSegments[]>([]);

  const GRID_UNIT_SIZE_MM = 100;
  const GLOBAL_SCALE_FACTOR = 1.0 / GRID_UNIT_SIZE_MM;

  const { scene } = useGLTF(legModelUrl, true);

  const blueOutlines = useMemo(() => {
    if (!scene) return [] as THREE.LineSegments[];
    const cloned = scene.clone(true);
    cloned.scale.set(1, 1, 1);
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    cloned.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? GLOBAL_SCALE_FACTOR / maxDim : GLOBAL_SCALE_FACTOR;

    const outlines: THREE.LineSegments[] = [];
    const offset = center.clone().multiplyScalar(scale);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        const outline = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: '#00b4d8',
            linewidth: 2,
            transparent: true,
            opacity: 0.9,
          })
        );

        outline.position.copy(mesh.position).sub(offset);
        outline.rotation.copy(mesh.rotation);
        outline.scale.copy(mesh.scale.multiplyScalar(scale));
        outlines.push(outline);
      }
    });
    return outlines;
  }, [scene, GLOBAL_SCALE_FACTOR]);

  useEffect(() => {
    if (!groupRef.current) return;
    outlinesRef.current.forEach((o) => {
      if (o.parent) o.parent.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    });
    outlinesRef.current = [];

    blueOutlines.forEach((o) => {
      groupRef.current?.add(o);
      outlinesRef.current.push(o);
    });
  }, [blueOutlines]);

  useEffect(() => {
    if (groupRef.current && attachPoint) {
      groupRef.current.position.set(...attachPoint.position);
    }
  }, [attachPoint]);

  return <group ref={groupRef} />;
}

export function FixedLegGhostPreview({ attachPoint, legModelUrl, legBoundingBox }: FixedLegGhostPreviewProps) {
  // Format URL early to check if it's valid
  const formatUrl = (url: string | null | undefined): string | null => {
    if (!url || url.trim() === '' || url === 'null') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
  };

  const formattedUrl = formatUrl(legModelUrl);
  
  if (!attachPoint) return null;

  if (!formattedUrl) {
    const width = legBoundingBox ? Math.abs((legBoundingBox.max[0] || 0) - (legBoundingBox.min[0] || 0)) / 100 : 0.3;
    const height = legBoundingBox ? Math.abs((legBoundingBox.max[1] || 0) - (legBoundingBox.min[1] || 0)) / 100 : 1.0;
    const length = legBoundingBox ? Math.abs((legBoundingBox.max[2] || 0) - (legBoundingBox.min[2] || 0)) / 100 : 0.3;

    return (
      <group position={attachPoint.position}>
        <lineSegments position={[0, height / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(width, height, length)] as any} />
          <lineBasicMaterial color="#00b4d8" linewidth={2} transparent opacity={0.9} />
        </lineSegments>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.05, 0.09, 24]} />
          <meshBasicMaterial color="#00b4d8" transparent opacity={0.8} />
        </mesh>
      </group>
    );
  }

  return (
    <Suspense fallback={null}>
      <FixedLegGhostPreviewContent 
        attachPoint={attachPoint} 
        legModelUrl={formattedUrl}
        legBoundingBox={legBoundingBox}
      />
      <mesh position={[attachPoint.position[0], 0.01, attachPoint.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.09, 24]} />
        <meshBasicMaterial color="#00b4d8" transparent opacity={0.8} />
      </mesh>
    </Suspense>
  );
}
