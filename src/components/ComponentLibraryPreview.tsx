import { Suspense, useEffect, useState } from 'react';
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
  console.log('🎨 GLBPreview loading URL:', url);
  
  try {
    const { scene } = useGLTF(url, true); // Use true for crossOrigin
    
    if (!scene) {
      console.warn('⚠️ GLB scene is null for URL:', url);
      return <PreviewPlaceholder />;
    }
    
    console.log('✅ GLB scene loaded successfully:', url);
    
    const clonedScene = scene.clone();

    // Center and scale the model
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    console.log('📏 Model dimensions:', size.x, size.y, size.z);
    
    // Center the model
    clonedScene.position.sub(center);
    
    // Scale to fit in preview (max dimension should be around 1.5 units)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 1.5 / maxDim;
      clonedScene.scale.set(scale, scale, scale);
      console.log('📐 Scaled model by:', scale);
    } else {
      console.warn('⚠️ Model has zero dimensions, using default scale');
    }

    return <primitive object={clonedScene} />;
  } catch (error) {
    // Errors in useGLTF are handled by Suspense, but catch any other errors
    console.error('❌ GLB preview error:', error, 'URL:', url);
    return <PreviewPlaceholder />;
  }
}

// Placeholder for components without models or failed loads
function PreviewPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#666" metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

function PreviewContent({ glbUrl, originalUrl, apiBase }: ComponentLibraryPreviewProps) {
  console.log('🎨 PreviewContent - glbUrl:', glbUrl, 'apiBase:', apiBase);
  
  // Format URLs to be absolute if needed
  let formattedGlbUrl = glbUrl;
  
  if (apiBase && formattedGlbUrl && !formattedGlbUrl.startsWith('http')) {
    formattedGlbUrl = `${apiBase}${formattedGlbUrl.startsWith('/') ? formattedGlbUrl : '/' + formattedGlbUrl}`;
    console.log('🔗 Formatted GLB URL:', formattedGlbUrl);
  }

  // Only try GLB files for simplicity
  if (formattedGlbUrl && formattedGlbUrl.trim() !== '' && formattedGlbUrl !== 'null') {
    console.log('✅ Attempting to load GLB preview:', formattedGlbUrl);
    try {
      return <GLBPreview url={formattedGlbUrl} />;
    } catch (error) {
      console.error('❌ Failed to load GLB preview:', error);
      return <PreviewPlaceholder />;
    }
  }

  // No model available
  console.warn('⚠️ No GLB URL available, showing placeholder');
  return <PreviewPlaceholder />;
}

export function ComponentLibraryPreview({ glbUrl, originalUrl, category, apiBase }: ComponentLibraryPreviewProps) {
  const [formattedGlbUrl, setFormattedGlbUrl] = useState<string | null>(null);
  const hasModel = (glbUrl && glbUrl.trim() !== '' && glbUrl !== 'null');

  // Format URL when glbUrl or apiBase changes
  useEffect(() => {
    if (glbUrl && glbUrl.trim() !== '' && glbUrl !== 'null') {
      let url = glbUrl;
      if (apiBase && !url.startsWith('http')) {
        url = `${apiBase}${url.startsWith('/') ? url : '/' + url}`;
      }
      console.log('🔄 ComponentLibraryPreview - Setting formatted URL:', url);
      setFormattedGlbUrl(url);
    } else {
      console.log('⚠️ ComponentLibraryPreview - No GLB URL provided');
      setFormattedGlbUrl(null);
    }
  }, [glbUrl, apiBase]);

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
            style={{ 
              width: '100%', 
              height: '100%', 
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'none'
            }}
            gl={{ preserveDrawingBuffer: true, antialias: false }}
            onCreated={(state) => {
              // Ensure canvas doesn't capture pointer events
              if (state.gl && state.gl.domElement) {
                state.gl.domElement.style.pointerEvents = 'none';
                state.gl.domElement.style.userSelect = 'none';
              }
            }}
            key={formattedGlbUrl || 'no-model'} // Force re-render when URL changes
          >
            <PerspectiveCamera makeDefault position={[2, 2, 2]} fov={50} />
            {/* Auto-rotate only, no manual controls */}
            <OrbitControls 
              enableZoom={false}
              enablePan={false}
              enableRotate={true}
              autoRotate
              autoRotateSpeed={0.5}
              enabled={true}
            />
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 3, 3]} intensity={0.7} />
            <pointLight position={[-3, 3, -3]} intensity={0.3} />
            <Environment preset="warehouse" />
            <PreviewContent glbUrl={formattedGlbUrl || glbUrl} originalUrl={originalUrl} apiBase={apiBase} />
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

