import { useState, useCallback, useRef, Suspense, useEffect, useMemo, ErrorInfo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, useGLTF, TransformControls } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
// type-only declarations are provided in src/types/three-extensions.d.ts
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { SlotPlacementSystem } from './SlotPlacementSystem';

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
  processing_status?: string;
  processing_error?: string;
};

// Drop handler component that exposes the camera and gl to the parent via a callback
// This allows the parent to use raycasting for accurate drop positioning
function DropHandler({ 
  onReady 
}: { 
  onReady?: (camera: THREE.Camera, gl: THREE.WebGLRenderer) => void;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    if (onReady && camera && gl) {
      onReady(camera, gl);
    }
  }, [camera, gl, onReady]);
  
  // Also update on every frame to ensure camera ref is always current
  useEffect(() => {
    const updateRefs = () => {
      if (onReady && camera && gl) {
        onReady(camera, gl);
      }
    };
    
    // Update refs periodically to catch camera movements
    const interval = setInterval(updateRefs, 100);
    return () => clearInterval(interval);
  }, [camera, gl, onReady]);

  return null;
}

// Camera controller component to automatically fit camera to scene
function CameraController({ components }: { components: SceneComponent[] }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>();
  
  const fitCameraToScene = useCallback(() => {
    if (components.length === 0) return;
    
    // Calculate the combined bounding box of all components
    const sceneBox = new THREE.Box3();
    
    components.forEach(comp => {
      if (comp.bounding_box) {
        const componentBox = new THREE.Box3(
          new THREE.Vector3(comp.bounding_box.min[0], comp.bounding_box.min[1], comp.bounding_box.min[2]),
          new THREE.Vector3(comp.bounding_box.max[0], comp.bounding_box.max[1], comp.bounding_box.max[2])
        );
        // Transform the box by component position
        componentBox.translate(new THREE.Vector3(comp.position[0], comp.position[1], comp.position[2]));
        sceneBox.union(componentBox);
      } else {
        // Fallback: create a small box at component position
        const fallbackBox = new THREE.Box3(
          new THREE.Vector3(comp.position[0] - 1, comp.position[1] - 1, comp.position[2] - 1),
          new THREE.Vector3(comp.position[0] + 1, comp.position[1] + 1, comp.position[2] + 1)
        );
        sceneBox.union(fallbackBox);
      }
    });
    
    if (sceneBox.isEmpty()) return;
    
    const center = sceneBox.getCenter(new THREE.Vector3());
    const size = sceneBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Calculate camera distance to fit the scene with a reasonable margin
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    // Use a factor to ensure the scene fits comfortably in view
    const fitFactor = 1.5; // Add 50% margin
    const cameraDistance = (maxDim * fitFactor) / (2 * Math.tan(fov / 2));
    
    // Clamp camera distance to reasonable bounds (prevent too far or too close)
    // Ensure minimum distance is reasonable and maximum doesn't go too far
    const minDistance = Math.max(maxDim * 0.5, 10);
    const maxDistance = Math.min(maxDim * 5, 500); // Reduced from 1000 to prevent going too far
    const clampedDistance = Math.max(minDistance, Math.min(maxDistance, cameraDistance));
    
    // Additional safety check: if distance is too large, use a more conservative value
    if (clampedDistance > 200) {
      console.warn('Camera distance too large, using conservative value');
      const conservativeDistance = Math.min(maxDim * 2, 200);
      return; // Don't move camera if it would be too far
    }
    
    // Position camera to look at the center of the scene from a good angle
    // Use a diagonal angle for better 3D view
    const angle = Math.PI / 4; // 45 degrees
    const newPosition = new THREE.Vector3(
      center.x + clampedDistance * Math.cos(angle),
      center.y + clampedDistance * Math.sin(angle) * 0.7, // Slightly lower angle
      center.z + clampedDistance * Math.cos(angle)
    );
    
    // Set camera position and target
    camera.position.copy(newPosition);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    
    // Update orbit controls target
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
    
  }, [components, camera]);
  
  // Track component IDs to detect when components are added/removed (not just updated)
  const componentIdsRef = useRef<string>('');
  
  // Track if this is the initial load
  const isInitialLoadRef = useRef(true);
  
  // Track if user has manually interacted with camera (to prevent auto-zoom after interaction)
  const hasUserInteractedRef = useRef(false);
  const lastCameraPositionRef = useRef<THREE.Vector3 | null>(null);
  
  // Monitor camera position to detect user interaction
  useEffect(() => {
    const checkCameraMovement = () => {
      if (lastCameraPositionRef.current) {
        const distance = camera.position.distanceTo(lastCameraPositionRef.current);
        // If camera moved more than a small threshold, user likely interacted
        if (distance > 1) {
          hasUserInteractedRef.current = true;
        }
      }
      lastCameraPositionRef.current = camera.position.clone();
    };
    
    const interval = setInterval(checkCameraMovement, 200);
    return () => clearInterval(interval);
  }, [camera]);
  
  // Auto-fit camera only when components are added/removed, not when dimensions change
  useEffect(() => {
    // Create a string of component IDs to detect actual additions/removals
    const currentIds = components.map(c => c.id).sort().join(',');
    
    // Only auto-fit if the component IDs have changed (additions/removals)
    // Not if only bounding boxes or other properties changed
    if (currentIds !== componentIdsRef.current) {
      componentIdsRef.current = currentIds;
      
      if (components.length > 0 && !hasUserInteractedRef.current) {
        // Skip auto-fit on initial load to prevent blank screen
        // Only auto-fit when new components are added (not on initial page load)
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          return; // Don't auto-fit on initial load
        }
        
        // For subsequent additions, fit after a short delay
        const delay = 300;
        
        const timeoutId = setTimeout(() => {
          // Only auto-fit if user hasn't manually moved the camera
          // Double-check that components still exist and user hasn't interacted
          if (!hasUserInteractedRef.current && components.length > 0) {
            try {
              fitCameraToScene();
              // Update last position after auto-fit
              lastCameraPositionRef.current = camera.position.clone();
            } catch (error) {
              console.error('Error fitting camera to scene:', error);
            }
          }
        }, delay);
        
        return () => {
          clearTimeout(timeoutId);
        };
      }
    }
  }, [components, fitCameraToScene, camera]);
  
  // Expose fit function globally for manual triggering
  useEffect(() => {
    (window as any).fitCameraToScene = fitCameraToScene;
    return () => {
      delete (window as any).fitCameraToScene;
    };
  }, [fitCameraToScene]);
  
  return null;
}

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
function GLBModelContent({ url, position, rotation, selected, onSelect, targetSize, onLoadError }: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
  targetSize?: [number, number, number];
  onLoadError?: () => void;
}) {
  // useGLTF throws a promise during loading (handled by Suspense)
  // Don't wrap in try-catch - let Suspense handle the promise
  const { scene } = useGLTF(url);
  
  if (!scene) {
    onLoadError?.();
    return null;
  }
  
  // Clone scene and set up reactive highlighting
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  // Store original size to prevent cumulative scaling
  const originalSizeRef = useRef<THREE.Vector3 | null>(null);
  const hasInitializedRef = useRef(false);
  const lastTargetSizeRef = useRef<string>('');
  
  // Global scale factor: converts mm to scene units (for relative sizing)
  // This ensures all components maintain their relative sizes
  // 1mm = 0.01 scene units, so 1000mm = 10 scene units, 100mm = 1 scene unit
  // This maintains the 10:1 ratio while keeping everything visible
  const GLOBAL_SCALE_FACTOR = 0.01; // Convert mm to scene units (1mm = 0.01 scene units)
  
  // Initialize original size ONCE on first load
  useEffect(() => {
    if (hasInitializedRef.current || !clonedScene) return;
    
    try {
      // Reset scale to 1,1,1 before measuring to ensure we get the true original size
      clonedScene.scale.set(1, 1, 1);
      const box = new THREE.Box3().setFromObject(clonedScene);
      const size = new THREE.Vector3();
      box.getSize(size);
      originalSizeRef.current = size.clone();
      
      hasInitializedRef.current = true;
    } catch (e) {
      // Silently handle initialization errors
    }
  }, [clonedScene]);
  
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

  // Track if model has been centered (only center once)
  const hasCenteredRef = useRef(false);
  
  // Scale to match desired bounding-box size (maintains relative sizing)
  useEffect(() => {
    if (!hasInitializedRef.current || !originalSizeRef.current) return;
    
    // Create a string key for targetSize to detect actual changes
    const targetSizeKey = targetSize ? `${targetSize[0]},${targetSize[1]},${targetSize[2]}` : 'none';
    
    // Skip if targetSize hasn't actually changed and model is already centered
    if (targetSizeKey === lastTargetSizeRef.current && hasCenteredRef.current) {
      return;
    }
    
    lastTargetSizeRef.current = targetSizeKey;
    
    try {
      const originalSize = originalSizeRef.current;
      
      let scaleX = GLOBAL_SCALE_FACTOR;
      let scaleY = GLOBAL_SCALE_FACTOR;
      let scaleZ = GLOBAL_SCALE_FACTOR;
      
      if (targetSize) {
        // Target dimensions are in mm
        const [targetX, targetY, targetZ] = targetSize;
        
        // Validate target sizes
        if (targetX > 0 && targetY > 0 && targetZ > 0 &&
            targetX < 10000 && targetY < 10000 && targetZ < 10000 &&
            isFinite(targetX) && isFinite(targetY) && isFinite(targetZ)) {
          
          // Calculate scale factors to match target dimensions
          // Scale = (target dimension in mm * global scale) / original size
          // This maintains relative sizing: a 1000mm component will be 10x larger than a 100mm component
          scaleX = (targetX * GLOBAL_SCALE_FACTOR) / originalSize.x;
          scaleY = (targetY * GLOBAL_SCALE_FACTOR) / originalSize.y;
          scaleZ = (targetZ * GLOBAL_SCALE_FACTOR) / originalSize.z;
          
          // Clamp scales to reasonable bounds
          scaleX = Math.max(0.0001, Math.min(10, scaleX));
          scaleY = Math.max(0.0001, Math.min(10, scaleY));
          scaleZ = Math.max(0.0001, Math.min(10, scaleZ));
        }
      } else {
        // No target size: use global scale factor to maintain relative sizing
        // This ensures components without bounding boxes still scale consistently
        scaleX = scaleY = scaleZ = GLOBAL_SCALE_FACTOR;
      }
      
      // Apply scaling
      clonedScene.scale.set(scaleX, scaleY, scaleZ);
      
      // Recenter at origin only once after initial scaling
      if (!hasCenteredRef.current) {
        const scaledBox = new THREE.Box3().setFromObject(clonedScene);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);
        clonedScene.position.sub(scaledCenter);
        hasCenteredRef.current = true;
      }
    } catch (e) {
      // Silently handle scaling errors
    }
  }, [clonedScene, targetSize?.[0], targetSize?.[1], targetSize?.[2]]);
  
  return (
    <primitive
      object={clonedScene}
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
  const [loadError, setLoadError] = useState(false);
  
  // Reset error state when URL changes
  useEffect(() => {
    setLoadError(false);
  }, [props.url]);
  
  if (loadError) {
    // If GLB fails to load, show placeholder instead of nothing
    return (
      <ComponentPlaceholder
        position={props.position}
        bounding_box={undefined}
        category=""
        selected={props.selected}
        onSelect={props.onSelect}
      />
    );
  }
  
  return (
    <Suspense 
      fallback={
        <mesh position={props.position}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" transparent opacity={0.5} />
        </mesh>
      }
    >
      <GLBModelContent {...props} onLoadError={() => setLoadError(true)} />
    </Suspense>
  );
}


// Fallback placeholder for components without GLB
function ComponentPlaceholder({ 
  position, 
  bounding_box, 
  category, 
  selected, 
  onSelect,
  processing_status,
  processing_error
}: { 
  position: [number, number, number]; 
  bounding_box?: any;
  category: string;
  selected?: boolean;
  onSelect?: () => void;
  processing_status?: string;
  processing_error?: string;
}) {
  const size = bounding_box ? [
    (bounding_box.max?.[0] || 1) - (bounding_box.min?.[0] || 0),
    (bounding_box.max?.[1] || 1) - (bounding_box.min?.[1] || 0),
    (bounding_box.max?.[2] || 1) - (bounding_box.min?.[2] || 0),
  ] : [1, 1, 1];

  // Use red color if processing failed
  // Check both processing_status and processing_error (some components might have error but status not set to 'failed')
  const isFailed = processing_status === 'failed' || (processing_error && processing_error.length > 0);
  const defaultColor = isFailed ? "#ef4444" : "#666666"; // Red for failed, gray for normal
  const selectedColor = isFailed ? "#dc2626" : "#00b4d8"; // Darker red if failed and selected

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
        color={selected ? selectedColor : defaultColor} 
        metalness={0.6} 
        roughness={0.4}
        transparent
        opacity={selected ? 0.9 : 0.7}
        emissive={selected ? new THREE.Color(isFailed ? 0xdc2626 : 0x00b4d8) : new THREE.Color(0x000000)}
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
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState({ translate: 0.5, rotate: Math.PI / 12, scale: 0.1 });
  
  // Map activeTool to transform mode
  const transformMode: 'translate' | 'rotate' | 'scale' = 
    activeTool === 'move' ? 'translate' :
    activeTool === 'rotate' ? 'rotate' :
    activeTool === 'scale' ? 'scale' : 'translate';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) {
      console.log('Drag over detected, setting dragOver to true');
      setDragOver(true);
    }
    // Set drop effect to show it's a valid drop target
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [dragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  // Store camera and gl references for raycasting
  const cameraRef = useRef<THREE.Camera | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  const handleDrop = useCallback((e: React.DragEvent) => {
    console.log('🎯 Drop event received in handleDrop!');
    console.log('🎯 Event target:', e.target);
    console.log('🎯 Event currentTarget:', e.currentTarget);
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    try {
      // Try application/json first
      let data = e.dataTransfer.getData('application/json');
      
      // Fallback to text/plain if application/json is empty
      if (!data) {
        console.log('No application/json data, trying text/plain...');
        data = e.dataTransfer.getData('text/plain');
      }
      
      if (!data) {
        console.warn('No drag data found in either format');
        console.log('Available types:', e.dataTransfer.types);
        return;
      }

      const component = JSON.parse(data);
      console.log('Dropped component:', component);
      
      // Validate required fields
      if (!component.id && !component.componentId) {
        console.error('Component missing ID:', component);
        return;
      }

      // Calculate drop position using raycasting if camera is available
      if (containerRef.current && onAddComponent) {
        const rect = containerRef.current.getBoundingClientRect();
        
        let position: [number, number, number];
        
        // Use raycasting if camera is available
        if (cameraRef.current && glRef.current) {
          // Ensure camera projection matrix is up to date
          if (cameraRef.current instanceof THREE.PerspectiveCamera) {
            cameraRef.current.updateProjectionMatrix();
          }
          
          // Convert screen coordinates to normalized device coordinates
          const mouse = new THREE.Vector2();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

          console.log('Raycasting with mouse:', mouse, 'camera position:', cameraRef.current.position, 'camera FOV:', (cameraRef.current as THREE.PerspectiveCamera).fov);

          // Raycast against ground plane (y = 0)
          raycasterRef.current.setFromCamera(mouse, cameraRef.current);
          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const intersectionPoint = new THREE.Vector3();
          
          const intersects = raycasterRef.current.ray.intersectPlane(groundPlane, intersectionPoint);

          if (intersects && intersectionPoint && !isNaN(intersectionPoint.x) && !isNaN(intersectionPoint.y) && !isNaN(intersectionPoint.z)) {
            // Ensure Y is exactly 0 (ground plane)
            position = [intersectionPoint.x, 0, intersectionPoint.z];
            console.log('Using raycast position:', position);
          } else {
            // Fallback to simple calculation
            const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            position = [ndcX * 10, 0, -ndcY * 10];
            console.log('Using fallback position (raycast failed):', position, 'intersects:', intersects);
          }
        } else {
          // Fallback to simple calculation if camera not available
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          position = [ndcX * 10, 0, -ndcY * 10];
          console.log('Using simple position (camera not ready):', position, {
            hasCamera: !!cameraRef.current,
            hasGL: !!glRef.current
          });
        }

        const componentToAdd = {
          componentId: component.id || component.componentId,
          name: component.name || 'Unnamed Component',
          category: component.category || 'unknown',
          glb_url: component.glb_url || null,
          original_url: component.original_url || null,
          bounding_box: component.bounding_box || null,
          center: component.center || [0, 0, 0],
          position,
          rotation: [0, 0, 0] as [number, number, number],
        };
        
        console.log('Adding component to scene:', componentToAdd);
        onAddComponent(componentToAdd);
      } else {
        console.warn('Container ref or onAddComponent not available', {
          hasContainerRef: !!containerRef.current,
          hasOnAddComponent: !!onAddComponent
        });
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  }, [onAddComponent]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelectComponent(id);
  };

  const cameraPosition: [number, number, number] = viewMode === 'shopfloor' 
    ? [40, 30, 40] 
    : [15, 12, 15];
    
  const controlsRef = useRef<any>();

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full bg-background rounded-lg overflow-hidden border border-border transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {/* Camera fit button */}
      <button
        onClick={() => {
          if ((window as any).fitCameraToScene) {
            (window as any).fitCameraToScene();
          }
        }}
        className="absolute top-4 right-4 z-10 bg-primary/80 hover:bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium backdrop-blur-sm transition-colors"
        title="Fit camera to all components"
      >
        Fit View
      </button>
      <Canvas 
        shadows
        style={{ display: 'block', width: '100%', height: '100%', pointerEvents: dragOver ? 'none' : 'auto' }}
        onCreated={({ camera, gl }) => {
          // Update camera and gl refs when Canvas is created/updated
          cameraRef.current = camera;
          glRef.current = gl;
        }}
        onPointerMissed={(e) => {
          // This fires when clicking on empty space (not on any 3D object)
          if (selectedId && activeTool === 'select') {
            setSelectedId(null);
            onSelectComponent('');
          }
        }}
        onDragOver={(e) => {
          // Allow drag over on canvas - let it bubble to container
          e.preventDefault();
        }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
        <OrbitControls 
          ref={controlsRef}
          enablePan={activeTool === 'select'}
          enableZoom={true}
          enableRotate={activeTool === 'select'}
          minDistance={5}
          maxDistance={200}  // Increased max distance for better overview
        />
        
        {/* Drop handler for accurate 3D positioning using raycasting */}
        <DropHandler 
          onReady={(camera, gl) => {
            cameraRef.current = camera;
            glRef.current = gl;
          }}
        />
        
        {/* Auto-fit camera to all components */}
        <CameraController components={components} />

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

        {/* Slot-based placement system */}
        <SlotPlacementSystem />

        {/* Render dynamic components from backend */}
        {components.length > 0 && (
          <>
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

          let content;
          if (shouldUseGLB) {
            // GLBModel will be positioned by the wrapping group, so pass [0,0,0]
            // Compute desired size from bounding_box if available
            // Convert from mm to scene units (1 scene unit = 1mm, so no conversion needed)
            // But ensure we're using absolute values and reasonable sizes
            const targetSize: [number, number, number] | undefined = comp.bounding_box ? (() => {
              const width = Math.abs((comp.bounding_box.max?.[0] || 0) - (comp.bounding_box.min?.[0] || 0));
              const height = Math.abs((comp.bounding_box.max?.[1] || 0) - (comp.bounding_box.min?.[1] || 0));
              const length = Math.abs((comp.bounding_box.max?.[2] || 0) - (comp.bounding_box.min?.[2] || 0));
              
              // Validate dimensions are reasonable (in mm)
              // For STEP files, dimensions can be large but should be reasonable
              // Allow up to 5000mm (5 meters) for large components
              
              // Ensure minimum size of 1mm
              return [
                Math.max(width, 1),
                Math.max(height, 1),
                Math.max(length, 1)
              ];
            })() : undefined;

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
            content = (
              <ComponentPlaceholder
                position={comp.position}
                bounding_box={comp.bounding_box}
                category={comp.category}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
                processing_status={comp.processing_status}
                processing_error={comp.processing_error}
              />
            );
          } else {
            // Fallback placeholder - show info about what's missing
            // This includes components without GLB (failed processing, missing files, etc.)
            content = (
              <ComponentPlaceholder
                position={comp.position}
                bounding_box={comp.bounding_box}
                category={comp.category}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
                processing_status={comp.processing_status}
                processing_error={comp.processing_error}
              />
            );
          }

          // Wrap in group with position/rotation for TransformControls
          // If no content, show placeholder
          if (!content) {
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
