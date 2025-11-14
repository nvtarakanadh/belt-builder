import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { ConveyorComponent } from '@/types/conveyor';

interface ComponentPreviewProps {
  component: ConveyorComponent;
}

// GLB Model Loader
function GLBPreview({ url }: { url: string }) {
  try {
    const { scene } = useGLTF(url);
    const clonedScene = scene.clone();

    // Center and scale the model
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    // Center the model
    clonedScene.position.sub(center);
    
    // Scale to fit in preview (max dimension should be around 2 units)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 2 / maxDim;
      clonedScene.scale.set(scale, scale, scale);
    }

    return <primitive object={clonedScene} />;
  } catch (error) {
    console.error('Failed to load GLB preview:', error);
    return <PreviewPlaceholder />;
  }
}

// STL Model Loader
function STLPreview({ url }: { url: string }) {
  try {
    const geometry = useLoader(STLLoader, url);
    
    // Center and scale
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    geometry.translate(-center.x, -center.y, -center.z);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 2 / maxDim : 1;

    return (
      <mesh geometry={geometry} scale={scale}>
        <meshStandardMaterial color="#0ea5e9" />
      </mesh>
    );
  } catch (error) {
    console.error('Failed to load STL preview:', error);
    return <PreviewPlaceholder />;
  }
}

// OBJ Model Loader
function OBJPreview({ url }: { url: string }) {
  try {
    const obj = useLoader(OBJLoader, url);
    
    // Center and scale
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    obj.position.sub(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 2 / maxDim : 1;
    obj.scale.set(scale, scale, scale);

    return <primitive object={obj} />;
  } catch (error) {
    console.error('Failed to load OBJ preview:', error);
    return <PreviewPlaceholder />;
  }
}

// Placeholder for components without models
function PreviewPlaceholder({ category }: { category?: string }) {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

function PreviewContent({ component }: ComponentPreviewProps) {
  const glbUrl = component.glb_url;
  const originalUrl = component.original_url;

  // Prioritize GLB files
  if (glbUrl && glbUrl.trim() !== '' && glbUrl !== 'null') {
    return <GLBPreview url={glbUrl} />;
  }

  // Fallback to original format
  if (originalUrl) {
    const fileExt = originalUrl.toLowerCase().split('.').pop();
    if (fileExt === 'stl') {
      return <STLPreview url={originalUrl} />;
    }
    if (fileExt === 'obj') {
      return <OBJPreview url={originalUrl} />;
    }
  }

  // No model available
  return <PreviewPlaceholder category={component.type} />;
}

export function ComponentPreview({ component }: ComponentPreviewProps) {
  return (
    <div className="w-full h-64 bg-secondary/30 rounded-lg overflow-hidden border border-border">
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading preview...</div>
        </div>
      }>
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={[3, 3, 3]} fov={50} />
          <OrbitControls 
            enableZoom={true}
            enablePan={false}
            enableRotate={true}
            minDistance={2}
            maxDistance={10}
            autoRotate
            autoRotateSpeed={1}
          />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
          <pointLight position={[-5, 5, -5]} intensity={0.3} />
          <Environment preset="warehouse" />
          <PreviewContent component={component} />
        </Canvas>
      </Suspense>
    </div>
  );
}

