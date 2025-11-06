import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, useGLTF, TransformControls } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
// type-only declarations are provided in src/types/three-extensions.d.ts
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { useState, useCallback, useRef, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

type SceneComponent = {
  id: string;
  componentId: number;
  name: string;
  category: string;
  glb_url?: string | null;
  original_url?: string | null;
  bounding_box?: any;
  center?: any;
  position: [number, number, number];
  rotation?: [number, number, number];
};

interface SceneProps {
  onSelectComponent: (id: string) => void;
  viewMode?: 'focused' | 'shopfloor';
  showGrid?: boolean;
  components?: SceneComponent[];
  onAddComponent?: (component: Omit<SceneComponent, 'id'>) => void;
  onUpdateComponent?: (id: string, update: Partial<SceneComponent>) => void;
  activeTool?: string; // Tool from toolbar: 'select', 'move', 'rotate'
}

// Component to render GLB models
function GLBModelContent({ url, position, rotation, selected, onSelect, targetSize }: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
  targetSize?: [number, number, number];
}) {
  console.log(`GLBModelContent: Loading GLB from ${url}, selected=${selected}`);
  
  // useGLTF throws a promise during loading (handled by Suspense)
  // Don't wrap in try-catch - let Suspense handle the promise
  const { scene } = useGLTF(url);
  
  if (!scene) {
    console.error(`GLBModelContent: Scene is null for ${url}`);
    return null;
  }
  
  console.log(`GLBModelContent: Successfully loaded GLB from ${url}`);
  
  // Clone scene and set up reactive highlighting
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  // Update highlighting based on selection state
  useEffect(() => {
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material) {
          if (selected) {
            material.emissive = new THREE.Color(0x00b4d8);
            material.emissiveIntensity = 0.3;
          } else {
            material.emissive = new THREE.Color(0x000000);
            material.emissiveIntensity = 0;
          }
          material.needsUpdate = true;
        }
      }
    });
  }, [selected, clonedScene]);

  // Scale to match desired bounding-box size if provided
  useEffect(() => {
    if (!targetSize) return;
    try {
      const box = new THREE.Box3().setFromObject(clonedScene);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const safeX = size.x || 1;
      const safeY = size.y || 1;
      const safeZ = size.z || 1;
      const scaleX = targetSize[0] / safeX;
      const scaleY = targetSize[1] / safeY;
      const scaleZ = targetSize[2] / safeZ;

      clonedScene.scale.set(scaleX, scaleY, scaleZ);

      // Recenter at origin after scaling
      const scaledBox = new THREE.Box3().setFromObject(clonedScene);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      clonedScene.position.sub(scaledCenter);
    } catch (e) {
      console.warn('Failed to scale GLB to target size', e);
    }
  }, [clonedScene, targetSize?.[0], targetSize?.[1], targetSize?.[2]]);
  
  return (
    <primitive
      object={clonedScene}
      onClick={(e: any) => {
        e.stopPropagation();
        console.log('🎯 GLB model clicked, calling onSelect');
        onSelect?.();
      }}
      onPointerOver={(e: any) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    />
  );
}

function GLBModel(props: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
  targetSize?: [number, number, number];
}) {
  return (
    <Suspense 
      fallback={
        <mesh position={props.position}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" transparent opacity={0.5} />
        </mesh>
      }
    >
      <GLBModelContent {...props} />
    </Suspense>
  );
}

// Fallback placeholder for components without GLB
function ComponentPlaceholder({ 
  position, 
  bounding_box, 
  category, 
  selected, 
  onSelect 
}: { 
  position: [number, number, number]; 
  bounding_box?: any;
  category: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const size = bounding_box ? [
    (bounding_box.max?.[0] || 1) - (bounding_box.min?.[0] || 0),
    (bounding_box.max?.[1] || 1) - (bounding_box.min?.[1] || 0),
    (bounding_box.max?.[2] || 1) - (bounding_box.min?.[2] || 0),
  ] : [1, 1, 1];

  return (
    <mesh
      position={position}
      onClick={(e: any) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onPointerOver={(e: any) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <boxGeometry args={size as [number, number, number]} />
      <meshStandardMaterial 
        color={selected ? "#00b4d8" : "#666666"} 
        metalness={0.6} 
        roughness={0.4}
        transparent
        opacity={selected ? 0.9 : 0.7}
        emissive={selected ? new THREE.Color(0x00b4d8) : new THREE.Color(0x000000)}
        emissiveIntensity={selected ? 0.3 : 0}
      />
    </mesh>
  );
}

// STL loader mesh with Suspense
function STLModelContent({ url, position, rotation, selected, onSelect }: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
}) {
  try {
    const geometry = (useLoader as any)(STLLoader as any, url) as THREE.BufferGeometry;
    
    useEffect(() => {
      if (geometry) {
        try {
          geometry.computeVertexNormals();
          geometry.center();
        } catch (e) {
          console.error('Error processing STL geometry:', e);
        }
      }
    }, [geometry]);

    if (!geometry) {
      console.error(`Failed to load STL geometry from ${url}`);
      return null;
    }

    return (
      <mesh 
        position={position} 
        rotation={rotation} 
        onClick={(e: any) => {
          e.stopPropagation();
          onSelect?.();
        }}
        geometry={geometry}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial 
          color={selected ? '#00b4d8' : '#888888'} 
          metalness={0.6} 
          roughness={0.4}
          emissive={selected ? new THREE.Color(0x00b4d8) : new THREE.Color(0x000000)}
          emissiveIntensity={selected ? 0.3 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  } catch (error) {
    console.error(`Failed to load STL from ${url}:`, error);
    return null;
  }
}

function STLModel(props: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <STLModelContent {...props} />
    </Suspense>
  );
}

// OBJ loader group with Suspense
function OBJModelContent({ url, position, rotation, selected, onSelect }: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
}) {
  const obj = (useLoader as any)(OBJLoader as any, url) as THREE.Group;
  
  // Apply selection highlighting to OBJ models
  useEffect(() => {
    if (obj) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const material = mesh.material as THREE.MeshStandardMaterial;
          if (material) {
            if (selected) {
              material.emissive = new THREE.Color(0x00b4d8);
              material.emissiveIntensity = 0.3;
            } else {
              material.emissive = new THREE.Color(0x000000);
              material.emissiveIntensity = 0;
            }
            material.needsUpdate = true;
          }
        }
      });
    }
  }, [selected, obj]);
  
  return (
    <group position={position} rotation={rotation}>
      <primitive 
        object={obj} 
        onClick={(e: any) => {
          e.stopPropagation();
          console.log('🎯 OBJ model clicked');
          onSelect?.();
        }}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      />
    </group>
  );
}

function OBJModel(props: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <OBJModelContent {...props} />
    </Suspense>
  );
}

// Wrapper component for TransformControls to properly handle refs
function TransformControlWrapper({ 
  component, 
  transformMode, 
  snap, 
  onUpdate, 
  children 
}: { 
  component: SceneComponent;
  transformMode: 'translate' | 'rotate' | 'scale';
  snap: { translate: number; rotate: number; scale: number };
  onUpdate: (pos: [number, number, number], rot: [number, number, number]) => void;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const { gl, scene, camera } = useThree();
  
  // Update group position/rotation when component changes
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...component.position);
      groupRef.current.rotation.set(...(component.rotation || [0, 0, 0]));
    }
  }, [component.position, component.rotation]);
  
  // drei's TransformControls automatically coordinates with OrbitControls
  // No need for manual coordination
  
  return (
    <TransformControls
      ref={controlsRef}
      mode={transformMode}
      space="world"
      translationSnap={snap.translate}
      rotationSnap={snap.rotate}
      scaleSnap={snap.scale}
      onObjectChange={(e) => {
        const obj = (e as any).target?.object;
        if (!obj || !groupRef.current) return;
        
        // Get position and rotation from the group being controlled
        const pos = [obj.position.x, obj.position.y, obj.position.z] as [number, number, number];
        const rot = [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number];
        
        console.log(`🔄 Transform changed for ${component.name}: pos=[${pos.map(x => x.toFixed(2)).join(', ')}], rot=[${rot.map(x => x.toFixed(2)).join(', ')}]`);
        onUpdate(pos, rot);
      }}
    >
      <group 
        ref={groupRef}
        position={component.position} 
        rotation={component.rotation || [0, 0, 0]}
      >
        {children}
      </group>
    </TransformControls>
  );
}

export const Scene = ({ 
  onSelectComponent, 
  viewMode = 'focused',
  showGrid = true,
  components = [],
  onAddComponent,
  onUpdateComponent,
  activeTool = 'select'
}: SceneProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Debug: Log when components change
  useEffect(() => {
    console.log(`🎬 Scene: Components updated. Count: ${components.length}`);
    components.forEach(comp => {
      console.log(`  📦 ${comp.name} (${comp.id}): GLB=${comp.glb_url ? 'YES' : 'NO'}, Position=[${comp.position.join(', ')}]`);
    });
  }, [components]);
  
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState({ translate: 0.5, rotate: Math.PI / 12, scale: 0.1 });
  
  // Map activeTool to transform mode
  const transformMode: 'translate' | 'rotate' | 'scale' = 
    activeTool === 'move' ? 'translate' :
    activeTool === 'rotate' ? 'rotate' :
    activeTool === 'scale' ? 'scale' : 'translate';
  
  // Log when transform mode changes for debugging
  useEffect(() => {
    console.log(`🔧 Transform mode changed to: ${transformMode} (activeTool: ${activeTool})`);
  }, [transformMode, activeTool]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) {
        console.warn('⚠️ No drag data found');
        return;
      }

      const component = JSON.parse(data);
      console.log('🎯 Component dropped:', component);
      
      // Calculate drop position (screen-to-world approximate mapping to ground plane)
      if (containerRef.current && onAddComponent) {
        const rect = containerRef.current.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        const x = ndcX * 10;
        const z = -ndcY * 10;
        const y = 0;

        const componentToAdd = {
          componentId: component.id || component.componentId,
          name: component.name,
          category: component.category,
          glb_url: component.glb_url || null,
          original_url: component.original_url || null,
          bounding_box: component.bounding_box,
          center: component.center,
          position: [x, y, z] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
        };
        
        console.log('🎯 Calling onAddComponent with:', componentToAdd);
        onAddComponent(componentToAdd);
      } else {
        console.error('❌ Missing containerRef or onAddComponent');
      }
    } catch (err) {
      console.error('❌ Error handling drop:', err);
    }
  }, [onAddComponent]);

  const handleSelect = (id: string) => {
    console.log(`🎯 Selecting component: ${id}, previous: ${selectedId}`);
    setSelectedId(id);
    onSelectComponent(id);
  };

  const cameraPosition: [number, number, number] = viewMode === 'shopfloor' 
    ? [40, 30, 40] 
    : [15, 12, 15];

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full bg-background rounded-lg overflow-hidden border border-border transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas 
        shadows
        onPointerMissed={(e) => {
          // This fires when clicking on empty space (not on any 3D object)
          if (selectedId && activeTool === 'select') {
            console.log('🎯 Clicked on empty space, deselecting');
            setSelectedId(null);
            onSelectComponent('');
          }
        }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
        <OrbitControls 
          enablePan={activeTool === 'select'}
          enableZoom={true}
          enableRotate={activeTool === 'select'}
          minDistance={5}
          maxDistance={50}
        />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 15, 10]} 
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-10, 10, -10]} intensity={0.5} color="#00b4d8" />
        <pointLight position={[10, 5, 10]} intensity={0.3} color="#ff6b35" />

        {/* Environment */}
        <Environment preset="warehouse" />

        {/* Grid floor */}
        {showGrid && (
          <Grid 
            args={viewMode === 'shopfloor' ? [100, 100] : [50, 50]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#2a2a2a"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#00b4d8"
            fadeDistance={viewMode === 'shopfloor' ? 80 : 40}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid
          />
        )}

        {/* Floor plane for shadows */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <shadowMaterial transparent opacity={0.3} />
        </mesh>

        {/* Render dynamic components from backend */}
        {components.length > 0 && (
          <>
            {console.log(`🎬 Starting to render ${components.length} components`)}
            {components.map((comp) => {
              const key = comp.id;
              const originalUrl = comp.original_url;
              const glbUrl = comp.glb_url;

              // Determine which model to render - prioritize GLB, fallback to original format
              const shouldUseGLB = glbUrl && glbUrl.trim() !== '' && glbUrl !== 'null';
              const fileExt = originalUrl ? originalUrl.toLowerCase().split('.').pop() : '';
              const isSTL = fileExt === 'stl';
              const isOBJ = fileExt === 'obj';
              const isSTEP = fileExt === 'step' || fileExt === 'stp';

              console.log(`🎨 Rendering component ${comp.name} (${comp.id}): GLB=${glbUrl}, Original=${originalUrl}, Ext=${fileExt}, Position=${comp.position}`);

          let content;
          if (shouldUseGLB) {
            console.log(`✅ Using GLB for ${comp.name}: ${glbUrl}`);
            // GLBModel will be positioned by the wrapping group, so pass [0,0,0]
            // Compute desired size from bounding_box if available
            const targetSize: [number, number, number] | undefined = comp.bounding_box ? [
              (comp.bounding_box.max?.[0] || 1) - (comp.bounding_box.min?.[0] || 0),
              (comp.bounding_box.max?.[1] || 1) - (comp.bounding_box.min?.[1] || 0),
              (comp.bounding_box.max?.[2] || 1) - (comp.bounding_box.min?.[2] || 0),
            ] : undefined;

            content = (
              <GLBModel
                url={glbUrl!}
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
                targetSize={targetSize}
              />
            );
          } else if (originalUrl && isSTL) {
            content = (
              <STLModel
                url={originalUrl}
                position={comp.position}
                rotation={comp.rotation || [0, 0, 0]}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          } else if (originalUrl && isOBJ) {
            content = (
              <OBJModel
                url={originalUrl}
                position={comp.position}
                rotation={comp.rotation || [0, 0, 0]}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          } else if (originalUrl && isSTEP) {
            // STEP files need conversion - if no GLB, show placeholder with helpful message
            console.warn(`STEP file not converted to GLB yet: ${originalUrl}. GLB URL: ${glbUrl}. Please wait for processing or check backend logs.`);
            content = (
              <ComponentPlaceholder
                position={comp.position}
                bounding_box={comp.bounding_box}
                category={comp.category}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          } else {
            // Fallback placeholder - show info about what's missing
            console.warn(`Component ${comp.name} (${comp.id}): No GLB (${glbUrl}), original: ${originalUrl}, ext: ${fileExt}`);
            content = (
              <ComponentPlaceholder
                position={comp.position}
                bounding_box={comp.bounding_box}
                category={comp.category}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          }

          // Wrap in group with position/rotation for TransformControls
          // If no content, show placeholder
          if (!content) {
            console.warn(`No content to render for component ${comp.name} (${comp.id}), showing placeholder`);
            content = (
              <ComponentPlaceholder
                position={[0, 0, 0]}
                bounding_box={comp.bounding_box}
                category={comp.category}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          }
          
          // Add TransformControls if selected and tool is not 'select'
          // Use a separate component to handle refs properly
          if (selectedId === comp.id && onUpdateComponent && activeTool !== 'select') {
            return (
              <TransformControlWrapper
                key={key}
                component={comp}
                transformMode={transformMode}
                snap={snap}
                onUpdate={(pos, rot) => onUpdateComponent(comp.id, { position: pos, rotation: rot })}
              >
                {content}
              </TransformControlWrapper>
            );
          }

          // Return the component group directly (no transform controls)
          return (
            <group key={key} position={comp.position} rotation={comp.rotation || [0, 0, 0]}>
              {content}
            </group>
          );
            })}
          </>
        )}

        {/* Shop floor elements - only visible in shopfloor mode */}
        {viewMode === 'shopfloor' && (
          <>
            {/* Factory floor marking */}
            <mesh position={[0, 0.01, -15]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[80, 20]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>

            {/* Workstations */}
            <group position={[-20, 0, -10]}>
              <mesh position={[0, 1, 0]}>
                <boxGeometry args={[4, 2, 3]} />
                <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, 2.2, 0]}>
                <boxGeometry args={[3.5, 0.2, 2.5]} />
                <meshStandardMaterial color="#444444" metalness={0.5} roughness={0.5} />
              </mesh>
            </group>

            <group position={[20, 0, -10]}>
              <mesh position={[0, 1, 0]}>
                <boxGeometry args={[4, 2, 3]} />
                <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, 2.2, 0]}>
                <boxGeometry args={[3.5, 0.2, 2.5]} />
                <meshStandardMaterial color="#444444" metalness={0.5} roughness={0.5} />
              </mesh>
            </group>

            {/* Storage racks */}
            <group position={[-25, 0, 15]}>
              {[0, 1, 2, 3].map((level) => (
                <mesh key={level} position={[0, 1 + level * 1.5, 0]}>
                  <boxGeometry args={[8, 0.2, 3]} />
                  <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
                </mesh>
              ))}
              <mesh position={[-3.8, 3, 0]}>
                <boxGeometry args={[0.3, 6, 3]} />
                <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[3.8, 3, 0]}>
                <boxGeometry args={[0.3, 6, 3]} />
                <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.4} />
              </mesh>
            </group>

            {/* Assembly machine */}
            <group position={[15, 0, 12]}>
              <mesh position={[0, 1.5, 0]}>
                <boxGeometry args={[5, 3, 4]} />
                <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
              </mesh>
              <mesh position={[0, 3.2, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
                <meshStandardMaterial color="#00b4d8" metalness={0.9} roughness={0.1} />
              </mesh>
            </group>

            {/* Pallet positions */}
            {[-15, -5, 5, 15].map((x, i) => (
              <mesh key={i} position={[x, 0.05, 8]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[2, 2]} />
                <meshStandardMaterial color="#ff6b35" opacity={0.3} transparent />
              </mesh>
            ))}

            {/* Safety barriers */}
            <group position={[0, 0, 18]}>
              {[-10, -5, 0, 5, 10].map((x, i) => (
                <mesh key={i} position={[x, 0.5, 0]}>
                  <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
                  <meshStandardMaterial color="#ffff00" metalness={0.7} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* Secondary conveyor line */}
            <group position={[0, 0, -12]}>
              <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[15, 0.3, 1.5]} />
                <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.4} />
              </mesh>
            </group>
          </>
        )}
      </Canvas>
    </div>
  );
};
