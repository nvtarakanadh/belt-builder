import { useRef, useEffect, useMemo, Suspense } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { API_BASE } from '@/lib/config';

interface DraggedGhostPreviewProps {
  modelUrl?: string | null;
  position: THREE.Vector3;
}

function DraggedGhostPreviewContent({ modelUrl, position }: { modelUrl: string; position: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null);
  const outlinesRef = useRef<THREE.LineSegments[]>([]);

  const GRID_UNIT_SIZE_MM = 100;
  const GLOBAL_SCALE_FACTOR = 1.0 / GRID_UNIT_SIZE_MM;

  const { scene } = useGLTF(modelUrl, true);

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
    // Cleanup any previous
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
    if (groupRef.current && position) {
      groupRef.current.position.copy(position);
    }
  }, [position]);

  return <group ref={groupRef} />;
}

export function DraggedGhostPreview({ modelUrl, position }: DraggedGhostPreviewProps) {
  const formatUrl = (url: string | null | undefined): string | null => {
    if (!url || url.trim() === '' || url === 'null') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
  };

  const formattedUrl = formatUrl(modelUrl);
  if (!formattedUrl || !position) return null;

  return (
    <Suspense fallback={null}>
      <DraggedGhostPreviewContent modelUrl={formattedUrl} position={position} />
    </Suspense>
  );
}

