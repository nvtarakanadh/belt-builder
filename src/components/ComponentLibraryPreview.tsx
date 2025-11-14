import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface ComponentLibraryPreviewProps {
  glbUrl?: string | null;
  originalUrl?: string | null;
  category?: string;
  apiBase?: string;
}

// Error catcher component to handle errors gracefully
function ErrorCatcher({ children }: { children: React.ReactNode }) {
  try {
    return <>{children}</>;
  } catch (error) {
    console.warn('Preview error caught:', error);
    return (
      <div className="w-full h-full flex items-center justify-center">
        <PreviewPlaceholder />
      </div>
    );
  }
}

// Simple GLB Model Loader with error handling
function GLBPreview({ url }: { url: string }) {
  try {
    const { scene } = useGLTF(url);
    
    if (!scene) {
      return <PreviewPlaceholder />;
    }
    
    const clonedScene = scene.clone();

    // Center and scale the model
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    // Center the model
    clonedScene.position.sub(center);
    
    // Scale to fit in preview (max dimension should be around 1.5 units)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 1.5 / maxDim;
      clonedScene.scale.set(scale, scale, scale);
    }

    return <primitive object={clonedScene} />;
  } catch (error) {
    // Errors in useGLTF are handled by Suspense, but catch any other errors
    console.warn('GLB preview error:', error);
    return <PreviewPlaceholder />;
  }
}

// Placeholder for components without models or failed loads
function PreviewPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

function PreviewContent({ glbUrl, originalUrl, apiBase }: ComponentLibraryPreviewProps) {
  // Format URLs to be absolute if needed
  let formattedGlbUrl = glbUrl;
  
  if (apiBase && formattedGlbUrl && !formattedGlbUrl.startsWith('http')) {
    formattedGlbUrl = `${apiBase}${formattedGlbUrl.startsWith('/') ? formattedGlbUrl : '/' + formattedGlbUrl}`;
  }

  // Only try GLB files for simplicity
  if (formattedGlbUrl && formattedGlbUrl.trim() !== '' && formattedGlbUrl !== 'null') {
    return <GLBPreview url={formattedGlbUrl} />;
  }

  // No model available
  return <PreviewPlaceholder />;
}

export function ComponentLibraryPreview({ glbUrl, originalUrl, category, apiBase }: ComponentLibraryPreviewProps) {
  const hasModel = (glbUrl && glbUrl.trim() !== '' && glbUrl !== 'null');

  return (
    <div 
      className="w-full h-32 bg-secondary/30 rounded-md border border-border/50 relative"
      style={{ pointerEvents: 'none', overflow: 'hidden' }}
    >
      <Suspense 
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-[10px] text-muted-foreground">Loading...</div>
          </div>
        }
      >
        <ErrorCatcher>
          <Canvas 
            shadows
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
            gl={{ preserveDrawingBuffer: true, antialias: false }}
          >
            <PerspectiveCamera makeDefault position={[2, 2, 2]} fov={50} />
            {/* Auto-rotate only, no manual controls */}
            <OrbitControls 
              enableZoom={false}
              enablePan={false}
              enableRotate={false}
              autoRotate
              autoRotateSpeed={1}
              enabled={false}
            />
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 3, 3]} intensity={0.7} />
            <pointLight position={[-3, 3, -3]} intensity={0.3} />
            <Environment preset="warehouse" />
            <PreviewContent glbUrl={glbUrl} originalUrl={originalUrl} apiBase={apiBase} />
          </Canvas>
        </ErrorCatcher>
      </Suspense>
      
      {/* Status Indicator Overlay */}
      {hasModel && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-muted-foreground font-medium">3D Ready</span>
        </div>
      )}
      
      {/* Category Badge */}
      {category && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-medium bg-background/80 backdrop-blur-sm border border-border/50 text-muted-foreground">
          {category}
        </div>
      )}
    </div>
  );
}

