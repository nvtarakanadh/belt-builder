import React, { useState, useCallback, useRef, Suspense, useEffect, useMemo, ErrorInfo, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, useGLTF, TransformControls, Html } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
// type-only declarations are provided in src/types/three-extensions.d.ts
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { useTheme } from 'next-themes';
import { Lock } from 'lucide-react';
import { SlotPlacementSystem } from './SlotPlacementSystem';
import { FPSCounter } from './FPSCounter';
import { CameraPreviewCube } from './CameraPreviewCube';
import { FloatingLockUI } from './FloatingLockUI';
import { FixedLegPlacementHelper, AttachPoint } from './FixedLegPlacementHelper';
import { FrameHighlight } from './FrameHighlight';
import { FixedLegGhostPreview } from './FixedLegGhostPreview';
import { DraggedGhostPreview } from './DraggedGhostPreview';
import { DraggedComponentPreview } from './DraggedComponentPreview';
import { API_BASE } from '@/lib/config';

// Smooth camera animation helper using lerp
function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

// Error Boundary for Environment component
class EnvironmentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('Environment failed to load, continuing without it:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// Environment wrapper that handles loading errors gracefully
function EnvironmentWrapper() {
  return (
    <EnvironmentErrorBoundary>
      <Environment preset="warehouse" />
    </EnvironmentErrorBoundary>
  );
}

// Theme-aware Grid component
function ThemeAwareGrid({ viewMode, theme }: { viewMode: 'focused' | 'shopfloor'; theme?: string }) {
  const isDark = theme === 'dark';
  return (
    <Grid 
      args={viewMode === 'shopfloor' ? [100, 100] : [50, 50]}
      cellSize={1}
      cellThickness={0.5}
      cellColor={isDark ? "#666666" : "#666666"}
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#00b4d8"
      fadeDistance={viewMode === 'shopfloor' ? 80 : 40}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid
    />
  );
}

// Component to update camera state for preview cube
function CameraStateUpdater({ 
  cameraRef, 
  controlsRef, 
  onUpdate 
}: { 
  cameraRef: React.MutableRefObject<THREE.Camera | null>; 
  controlsRef: React.RefObject<any>; 
  onUpdate: (camera: THREE.Camera | null, controls: any) => void;
}) {
  useFrame(() => {
    if (cameraRef.current && controlsRef.current) {
      onUpdate(cameraRef.current, controlsRef.current);
    }
  });
  return null;
}

function lerpVector3(start: THREE.Vector3, end: THREE.Vector3, factor: number, out: THREE.Vector3): void {
  out.x = lerp(start.x, end.x, factor);
  out.y = lerp(start.y, end.y, factor);
  out.z = lerp(start.z, end.z, factor);
}

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
  scale?: [number, number, number];
  processing_status?: string;
  processing_error?: string;
  linkedTo?: string; // ID of the component this is linked/merged with
  isLocked?: boolean; // Whether this link is locked (merged)
  groupId?: string | null; // ID of the group this component belongs to
};

// Drop handler component that exposes the camera and gl to the parent via a callback
// This allows the parent to use raycasting for accurate drop positioning
function DropHandler({ 
  onReady 
}: { 
  onReady?: (camera: THREE.Camera, gl: THREE.WebGLRenderer) => void;
}) {
  const { camera, gl } = useThree();

  // Update refs immediately when component mounts
  useEffect(() => {
    if (onReady && camera && gl) {
      onReady(camera, gl);
    }
  }, [camera, gl, onReady]);
  
  // Update refs on every frame to ensure camera ref is always current (catches OrbitControls movements)
  useFrame(() => {
    if (onReady && camera && gl) {
      onReady(camera, gl);
    }
  });

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
    const minDistance = Math.max(maxDim * 0.3, 1); // Allow closer zoom
    const maxDistance = Math.min(maxDim * 10, 1000); // Increased max distance for more zoom out
    const clampedDistance = Math.max(minDistance, Math.min(maxDistance, cameraDistance));
    
    // Additional safety check: if distance is too large, use a more conservative value
    if (clampedDistance > 1000) {
      console.warn('Camera distance too large, using conservative value');
      const conservativeDistance = Math.min(maxDim * 5, 1000);
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
  // DISABLED: Auto-fit camera when components are added - this was causing components to appear to move
  // Users can manually use the Center View button if they want to fit the camera
  // useEffect(() => {
  //   // Create a string of component IDs to detect actual additions/removals
  //   const currentIds = components.map(c => c.id).sort().join(',');
  //   
  //   // Only auto-fit if the component IDs have changed (additions/removals)
  //   // Not if only bounding boxes or other properties changed
  //   if (currentIds !== componentIdsRef.current) {
  //     componentIdsRef.current = currentIds;
  //     
  //     if (components.length > 0 && !hasUserInteractedRef.current) {
  //       // Skip auto-fit on initial load to prevent blank screen
  //       // Only auto-fit when new components are added (not on initial page load)
  //       if (isInitialLoadRef.current) {
  //         isInitialLoadRef.current = false;
  //         return; // Don't auto-fit on initial load
  //       }
  //       
  //       // For subsequent additions, fit after a short delay
  //       const delay = 300;
  //       
  //       const timeoutId = setTimeout(() => {
  //         // Only auto-fit if user hasn't manually moved the camera
  //         // Double-check that components still exist and user hasn't interacted
  //         if (!hasUserInteractedRef.current && components.length > 0) {
  //           try {
  //             fitCameraToScene();
  //             // Update last position after auto-fit
  //             lastCameraPositionRef.current = camera.position.clone();
  //           } catch (error) {
  //             console.error('Error fitting camera to scene:', error);
  //           }
  //         }
  //       }, delay);
  //       
  //       return () => {
  //         clearTimeout(timeoutId);
  //       };
  //     }
  //   }
  // }, [components, fitCameraToScene, camera]);
  
  // Expose fit function globally for manual triggering
  useEffect(() => {
    (window as any).fitCameraToScene = fitCameraToScene;
    return () => {
      delete (window as any).fitCameraToScene;
    };
  }, [fitCameraToScene]);
  
  return null;
}

export interface SceneControls {
  resetCamera: () => void;
  zoomIn: (factor?: number) => void;
  zoomOut: (factor?: number) => void;
  enablePanMode: () => void;
  disablePanMode: () => void;
  clearSelection: () => void;
  clearHighlights: () => void;
}

type ComponentGroup = {
  id: string;
  componentIds: string[];
};

interface SceneProps {
  onSelectComponent: (id: string) => void;
  viewMode?: 'focused' | 'shopfloor';
  showGrid?: boolean;
  components?: SceneComponent[];
  groups?: ComponentGroup[];
  onAddComponent?: (component: Omit<SceneComponent, 'id'>) => void;
  onUpdateComponent?: (id: string, update: Partial<SceneComponent>) => void;
  onLockComponents?: (id1: string, id2: string) => void;
  onUnlockComponents?: (id1: string, id2: string) => void;
  onFindPairedComponent?: (id: string) => SceneComponent | null;
  activeTool?: string; // Tool from toolbar: 'select', 'move', 'rotate', 'pan'
  controlsRef?: React.MutableRefObject<SceneControls | null>; // Ref to expose camera controls
  sceneSettings?: {
    viewMode?: 'realistic' | 'orthographic' | 'wireframe';
    levelOfDetail?: 'high' | 'medium' | 'low';
    zoomTarget?: 'center' | 'mouse';
    invertZoom?: boolean;
    shadows?: boolean;
    placementPreview?: boolean;
    coordinateSystem?: boolean;
    cameraCube?: boolean;
    grid?: boolean;
    fpsCounter?: boolean;
  };
}

// Component to render GLB models
function GLBModelContent({ url, position, rotation, selected, onSelect, targetSize, onLoadError, wireframe, category, castShadow, receiveShadow }: { 
  url: string; 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
  targetSize?: [number, number, number];
  onLoadError?: () => void;
  wireframe?: boolean;
  category?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
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
  const lastUrlRef = useRef<string>('');
  
  // Grid-based scaling: 1 grid unit = 100mm in real life
  // This makes sizing intuitive - components are sized relative to grid units
  // Example: A 1000mm component = 10 grid units, a 100mm component = 1 grid unit
  const GRID_UNIT_SIZE_MM = 100; // 1 grid unit = 100mm
  const GLOBAL_SCALE_FACTOR = 1.0 / GRID_UNIT_SIZE_MM; // Convert mm to grid units (100mm = 1 grid unit)
  const GRID_OFFSET = 0; // Components sit exactly on grid lines (Y = 0)
  
  // Reset initialization state when URL changes (new component instance)
  useEffect(() => {
    if (url !== lastUrlRef.current) {
      hasInitializedRef.current = false;
      originalSizeRef.current = null;
      lastTargetSizeRef.current = '';
      lastUrlRef.current = url;
      // Force re-initialization when URL changes
    }
  }, [url]);
  
  // Reset initialization only on URL change (new component), not on dimension changes
  // Dimension changes are handled by the scaling effect, not by re-initialization
  useEffect(() => {
    if (url !== lastUrlRef.current) {
          hasInitializedRef.current = false;
      originalSizeRef.current = null;
          lastTargetSizeRef.current = '';
      lastUrlRef.current = url;
        }
  }, [url]);
  
  // Store axis mapping to determine which model axis corresponds to which dimension
  const axisMappingRef = useRef<{ width: 'x' | 'y' | 'z', height: 'x' | 'y' | 'z', length: 'x' | 'y' | 'z' } | null>(null);
  
  // Initialize original size ONCE on first load
  useEffect(() => {
    if (hasInitializedRef.current || !clonedScene) return;
    
    try {
      // CRITICAL: Reset root transforms before measuring to ensure we get the true original size
      // Only reset the root scene, not children (children may have their own transforms that are part of the model)
      clonedScene.scale.set(1, 1, 1);
      clonedScene.position.set(0, 0, 0);
      clonedScene.rotation.set(0, 0, 0);
      
      // Force update matrix to ensure transforms are applied
      clonedScene.updateMatrixWorld(true);
      
      const box = new THREE.Box3().setFromObject(clonedScene);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      // Store original size, but ensure it's never zero
      if (size.x > 0 && size.y > 0 && size.z > 0) {
        originalSizeRef.current = size.clone();
        
        // Determine axis mapping based on component category
        const isConveyor = category?.toLowerCase().includes('belt') || category?.toLowerCase().includes('conveyor');
        
        if (isConveyor) {
          // For conveyor belts, use fixed mapping: X=length, Y=height, Z=width
          // This is the standard CAD orientation for conveyor belts
          axisMappingRef.current = {
            width: 'z',   // width maps to Z axis
            height: 'y',  // height maps to Y axis
            length: 'x'   // length maps to X axis
          };
        } else {
          // Standard orientation: width along X, height along Y, length along Z
          axisMappingRef.current = {
            width: 'x',
            height: 'y',
            length: 'z'
          };
        }
        
        hasInitializedRef.current = true;
        // Force scaling to run after initialization by clearing lastTargetSizeRef
        // This ensures scaling applies on first load even if targetSize was set before initialization
        lastTargetSizeRef.current = '';
      } else {
        // Fallback to a default size if mesh has invalid dimensions
        originalSizeRef.current = new THREE.Vector3(1, 1, 1);
        const isConveyor = category?.toLowerCase().includes('belt') || category?.toLowerCase().includes('conveyor');
        axisMappingRef.current = isConveyor 
          ? { width: 'z', height: 'y', length: 'x' }
          : { width: 'x', height: 'y', length: 'z' };
        hasInitializedRef.current = true;
        // Force scaling to run after initialization
        lastTargetSizeRef.current = '';
      }
    } catch (e) {
      // Silently handle initialization errors
      originalSizeRef.current = new THREE.Vector3(1, 1, 1);
      const isConveyor = category?.toLowerCase().includes('belt') || category?.toLowerCase().includes('conveyor');
      axisMappingRef.current = isConveyor 
        ? { width: 'z', height: 'y', length: 'x' }
        : { width: 'x', height: 'y', length: 'z' };
      hasInitializedRef.current = true;
      // Force scaling to run after initialization
      lastTargetSizeRef.current = '';
    }
  }, [clonedScene, category]);
  
  // Update highlighting and wireframe based on selection state (optimized)
  useEffect(() => {
    if (!clonedScene) return;
    
    // Batch material updates for better performance
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material) {
          // Only update if changed
          const newEmissive = selected ? 0x00b4d8 : 0x000000;
          const newIntensity = selected ? 0.3 : 0;
          
          if (material.emissive.getHex() !== newEmissive || material.emissiveIntensity !== newIntensity) {
            material.emissive.setHex(newEmissive);
            material.emissiveIntensity = newIntensity;
            material.needsUpdate = true;
          }
          
          // Update wireframe mode
          if (material.wireframe !== wireframe) {
            material.wireframe = wireframe ?? false;
            material.needsUpdate = true;
          }
        }
      }
    });
  }, [selected, clonedScene, wireframe]);
  
  // Update axis mapping when category changes (in case it wasn't available on initial load)
  useEffect(() => {
    if (!originalSizeRef.current) return;
    
    const isConveyor = category?.toLowerCase().includes('belt') || category?.toLowerCase().includes('conveyor');
    
      if (isConveyor) {
        axisMappingRef.current = {
          width: 'z',   // width maps to Z axis
          height: 'y',  // height maps to Y axis
          length: 'x'   // length maps to X axis
        };
      } else if (axisMappingRef.current && axisMappingRef.current.width === 'z') {
        // Only update if it was previously set to conveyor mapping
        axisMappingRef.current = {
          width: 'x',
          height: 'y',
          length: 'z'
        };
      }
  }, [category]);
  
  // Scale to match desired bounding-box size (maintains relative sizing)
  // This effect should run whenever targetSize changes OR when initialization completes
  useEffect(() => {
    // Wait for initialization to complete before scaling
    if (!hasInitializedRef.current || !originalSizeRef.current || !clonedScene) {
      return;
    }
    
    // Ensure we have a targetSize - if not, we can't scale
    if (!targetSize || targetSize.length !== 3) {
      return;
    }
    
    // If URL changed, we need to reset and wait for re-initialization
    if (url !== lastUrlRef.current) {
      return;
    }
    
    // CRITICAL: Reset scale to 1,1,1 before applying new scaling
    // This prevents cumulative scaling and ensures we always scale from the original size
    clonedScene.scale.set(1, 1, 1);
    
    // Create a normalized string key for targetSize to detect actual changes
    // Use high precision (0.01mm) to catch all changes accurately
    const normalizeValue = (val: number) => Math.round(val * 100) / 100;
    const targetSizeKey = `${normalizeValue(targetSize[0])},${normalizeValue(targetSize[1])},${normalizeValue(targetSize[2])}`;
    
    // Skip if targetSize hasn't actually changed (even if array reference changed)
    // BUT always apply on first load (when lastTargetSizeRef is empty)
    if (targetSizeKey === lastTargetSizeRef.current && lastTargetSizeRef.current !== '') {
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
            isFinite(targetX) && isFinite(targetY) && isFinite(targetZ) &&
            originalSize.x > 0 && originalSize.y > 0 && originalSize.z > 0) {
          
          // Calculate scale factors to match target dimensions
          // Scale = (target dimension in mm * global scale) / original mesh size
          // This maintains relative sizing: a 1000mm component will be 10x larger than a 100mm component
          // The key is that all components use the same GLOBAL_SCALE_FACTOR, so relative sizes are preserved
          
          // Grid-based scaling: Scale components relative to grid units
          // 1 grid unit = 100mm, so a 1000mm component = 10 grid units
          // This ensures relative sizing: a 1000mm component is 10x larger than a 100mm component
          
          // Target dimensions are in mm, convert to grid units (scene units)
          // Example: 1000mm = 10 grid units, 100mm = 1 grid unit
          // The grid is 1 unit apart, so 1 grid unit = 1 scene unit
          
          // targetSize is [width, height, length] from bounding_box
          // targetX = width, targetY = height, targetZ = length
          // We need to map these to the correct model axes based on component type
          const mapping = axisMappingRef.current || { width: 'x', height: 'y', length: 'z' };
          
          // Get target dimensions: [width, height, length] from bounding_box
          // These are the desired dimensions in mm that the model should have
          const targetWidth = targetX;   // width from bounding_box[0] (X axis in world space)
          const targetHeight = targetY;  // height from bounding_box[1] (Y axis in world space)
          const targetLength = targetZ;  // length from bounding_box[2] (Z axis in world space)
          
          // Calculate scale factors for each model axis based on the mapping
          // The mapping tells us which model axis corresponds to which dimension
          // IMPORTANT: We need to scale each axis independently based on its target dimension
          const getScaleForAxis = (axis: 'x' | 'y' | 'z', targetDim: number) => {
            const originalDim = axis === 'x' ? originalSize.x : axis === 'y' ? originalSize.y : originalSize.z;
            // Convert target dimension from mm to scene units (divide by GRID_UNIT_SIZE_MM)
            // Then divide by original dimension to get scale factor
            // This gives us the scale needed to make the model's axis match the target dimension
            if (originalDim <= 0 || targetDim <= 0) return 1;
            
            // Target dimension in scene units (mm / 100 = grid units = scene units)
            const targetInSceneUnits = targetDim / GRID_UNIT_SIZE_MM;
            
            // Calculate scale: how much to scale the original dimension to reach target
            const scale = targetInSceneUnits / originalDim;
            
            // Clamp scale to reasonable bounds to prevent huge or tiny models
            return isFinite(scale) ? Math.max(0.001, Math.min(100, scale)) : 1;
          };
          
          // Apply mapping: map width/height/length to the correct model axes
          // The mapping tells us which model axis (x, y, z) corresponds to which dimension (width, height, length)
          // For conveyors: width->Z, height->Y, length->X
          // For others: width->X, height->Y, length->Z
          
          // Get the target dimension for each model axis based on the mapping
          // The mapping tells us: for a given model axis, which dimension (width/height/length) should be used
          // For conveyors: model X axis uses length, model Y axis uses height, model Z axis uses width
          // For others: model X axis uses width, model Y axis uses height, model Z axis uses length
          const targetForX = mapping.length === 'x' ? targetLength : mapping.width === 'x' ? targetWidth : targetHeight;
          const targetForY = mapping.height === 'y' ? targetHeight : mapping.length === 'y' ? targetLength : targetWidth;
          const targetForZ = mapping.width === 'z' ? targetWidth : mapping.length === 'z' ? targetLength : targetHeight;
          
          // Calculate scale for each axis INDEPENDENTLY
          // Each axis scales based ONLY on its own target dimension
          scaleX = getScaleForAxis('x', targetForX);
          scaleY = getScaleForAxis('y', targetForY);
          scaleZ = getScaleForAxis('z', targetForZ);
          
          // Clamp each scale factor to reasonable bounds
          scaleX = Math.max(0.001, Math.min(50, scaleX));
          scaleY = Math.max(0.001, Math.min(50, scaleY));
          scaleZ = Math.max(0.001, Math.min(50, scaleZ));
          
        }
      } else {
        // No target size: use default scale based on grid units
        // Assume 1 grid unit size for components without bounding boxes
        if (originalSize.x > 0 && originalSize.y > 0 && originalSize.z > 0) {
          const originalMax = Math.max(originalSize.x, originalSize.y, originalSize.z);
          // Scale to 1 grid unit (100mm)
          const defaultScale = (1.0 / GRID_UNIT_SIZE_MM) / originalMax;
          scaleX = scaleY = scaleZ = Math.max(0.0001, Math.min(20, defaultScale));
        } else {
          scaleX = scaleY = scaleZ = GLOBAL_SCALE_FACTOR;
        }
      }
      
      // Always apply scaling - the check above ensures we only do this when targetSize actually changes
      // Apply scaling directly - each axis scales independently
      clonedScene.scale.set(scaleX, scaleY, scaleZ);
      
      // Reset position to origin (0,0,0) for accurate bounding box calculation
      // The model is passed position=[0,0,0] from parent, so X and Z should be 0 anyway
      clonedScene.position.set(0, 0, 0);
      clonedScene.updateMatrixWorld(true);
      
      // Calculate bounding box by manually traversing all vertices
      // This ensures we get the accurate bottom position after scaling
      let minY = Infinity;
      let maxY = -Infinity;
      let hasVertices = false;
      
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) {
            const geometry = mesh.geometry;
            const positionAttribute = geometry.attributes.position;
            
            if (positionAttribute) {
              const vertex = new THREE.Vector3();
              // Get the mesh's local-to-parent transform matrix
              // Since clonedScene is at (0,0,0), this gives us position relative to parent group
              mesh.updateMatrix();
              const matrix = mesh.matrix.clone();
              
              // Traverse all vertices
              for (let i = 0; i < positionAttribute.count; i++) {
                vertex.fromBufferAttribute(positionAttribute, i);
                // Transform vertex to parent group space (which is world space since parent is at origin)
                vertex.applyMatrix4(matrix);
                
                if (vertex.y < minY) minY = vertex.y;
                if (vertex.y > maxY) maxY = vertex.y;
                hasVertices = true;
              }
            }
          }
        }
      });
      
      // Fallback to setFromObject if manual calculation didn't work
      if (!hasVertices || !isFinite(minY)) {
        const box = new THREE.Box3().setFromObject(clonedScene);
        if (!box.isEmpty()) {
          minY = box.min.y;
        }
      }
      
      // Keep model at Y=0 in local space
      // Y position adjustment is handled by the parent group based on bounding_box
      clonedScene.position.y = 0;
        clonedScene.updateMatrixWorld(true);
      
      // DO NOT recenter the model horizontally - this causes the component to move after placement
      // The model should maintain its original pivot point for X and Z
      // Only adjust Y to align bottom with grid
      // The parent group position handles the world-space positioning
    } catch (e) {
      // Silently handle scaling errors
    }
  }, [clonedScene, targetSize, category, url]); // Include url and category to detect component changes
  
  // Force update when targetSize changes - use a separate effect to ensure scaling happens
  useEffect(() => {
    if (!hasInitializedRef.current || !originalSizeRef.current || !clonedScene) {
      return;
    }
    
    if (!targetSize || targetSize.length !== 3) {
      return;
    }
    
    // Create normalized key to detect changes (same precision as scaling effect)
    const normalizeValue = (val: number) => Math.round(val * 10) / 10;
    const targetSizeKey = `${normalizeValue(targetSize[0])},${normalizeValue(targetSize[1])},${normalizeValue(targetSize[2])}`;
    
    // Only trigger if targetSize actually changed
    if (targetSizeKey !== lastTargetSizeRef.current) {
      console.log('🔄 TargetSize prop changed, forcing re-scale:', {
        old: lastTargetSizeRef.current,
        new: targetSizeKey,
        targetSize
      });
      // Force a re-scale by resetting the lastTargetSizeRef
      // This will cause the scaling effect above to run
      lastTargetSizeRef.current = '';
    }
  }, [targetSize, clonedScene, hasInitializedRef, originalSizeRef]);
  
  // Optimize mesh rendering and apply shadow settings
  useEffect(() => {
    if (!clonedScene) return;
    
    const enableShadows = castShadow !== false && receiveShadow !== false; // Default to true if not specified
    
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Enable frustum culling
        mesh.frustumCulled = true;
        // Set shadow properties
        mesh.castShadow = castShadow ?? enableShadows;
        mesh.receiveShadow = receiveShadow ?? enableShadows;
        // Optimize geometry
        if (mesh.geometry) {
          mesh.geometry.computeBoundingSphere();
        }
        // Optimize material
        if (mesh.material) {
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.shadowSide = THREE.FrontSide;
        }
      }
    });
  }, [clonedScene, castShadow, receiveShadow]);
  
  return (
    <primitive
      object={clonedScene}
      frustumCulled={true}
      onClick={(e: any) => {
        // Only stop propagation and select if this is a click (not a drag)
        // Allow dragging to work by not stopping propagation during drag
        if (!e.delta || (Math.abs(e.delta) < 0.01)) {
        e.stopPropagation();
        onSelect?.();
        }
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
  wireframe?: boolean;
  category?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
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
      <GLBModelContent {...props} category={props.category} onLoadError={() => setLoadError(true)} castShadow={props.castShadow} receiveShadow={props.receiveShadow} />
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

  // Calculate Y offset to align bottom to Y=0 relative to parent
  // The box geometry is centered, so we need to shift it up by half its height
  // The parent group's Y position will be set to GRID_OFFSET to place it on grid
  const height = size[1];
  const yOffset = height / 2;

  // Use red color if processing failed
  // Check both processing_status and processing_error (some components might have error but status not set to 'failed')
  const isFailed = processing_status === 'failed' || (processing_error && processing_error.length > 0);
  const defaultColor = isFailed ? "#ef4444" : "#666666"; // Red for failed, gray for normal
  const selectedColor = isFailed ? "#dc2626" : "#00b4d8"; // Darker red if failed and selected

  return (
    <mesh
      position={[position[0], position[1] + yOffset, position[2]]}
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
  const meshRef = useRef<THREE.Mesh>(null);
  
  try {
    const geometry = (useLoader as any)(STLLoader as any, url) as THREE.BufferGeometry;
    
    useEffect(() => {
      if (geometry) {
        try {
          geometry.computeVertexNormals();
          // Don't center - we'll align bottom to Y=0 relative to parent
          // Calculate bounding box to find bottom
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          if (box) {
            const minY = box.min.y;
            // Offset geometry so bottom is exactly at Y=0 relative to parent group
            // The parent group's Y position will be set to GRID_OFFSET to place it on grid
            geometry.translate(0, -minY, 0);
          }
        } catch (e) {
          // Silently handle STL processing errors
        }
      }
    }, [geometry]);

    if (!geometry) {
      return null;
    }

    return (
      <mesh 
        ref={meshRef}
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
  const groupRef = useRef<THREE.Group>(null);
  
  // Align OBJ model bottom to Y=0 relative to parent
  useEffect(() => {
    if (obj && groupRef.current) {
      try {
        // Preserve X and Z positions, only reset Y for accurate bounding box calculation
        const currentX = obj.position.x;
        const currentZ = obj.position.z;
        obj.position.set(currentX, 0, currentZ);
        obj.updateMatrixWorld(true);
        
        // Calculate bounding box of the OBJ group
        const box = new THREE.Box3().setFromObject(obj);
        const minY = box.min.y;
        
        // Offset the group so bottom is exactly at Y=0 relative to parent group
        // The parent group's Y position will be set to GRID_OFFSET to place it on grid
        // Formula: position.y = -minY brings the bottom (at minY) to Y=0
        if (isFinite(minY)) {
          obj.position.y = -minY;
          obj.updateMatrixWorld(true);
        }
      } catch (e) {
        // Silently handle OBJ alignment errors
      }
    }
  }, [obj]);
  
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
    <group 
      ref={groupRef}
      position={position} 
      rotation={rotation}
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
      <primitive object={obj} />
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

// Helper function to check if two components are close enough to link
function areComponentsLinkable(comp1: SceneComponent, comp2: SceneComponent, threshold: number = 0.5): boolean {
  const name1 = (comp1.name || '').toLowerCase();
  const name2 = (comp2.name || '').toLowerCase();
  
  // Check if one is a rod and the other is a wheel with break
  const isRod1 = name1.includes('rod') || (comp1.category || '').toLowerCase().includes('rod');
  const isWheel1 = name1.includes('wheel') && name1.includes('break');
  const isRod2 = name2.includes('rod') || (comp2.category || '').toLowerCase().includes('rod');
  const isWheel2 = name2.includes('wheel') && name2.includes('break');
  
  // Must be one rod and one wheel with break
  if (!((isRod1 && isWheel2) || (isRod2 && isWheel1))) {
    return false;
  }
  
  // Calculate distance between component centers
  const dx = comp1.position[0] - comp2.position[0];
  const dy = comp1.position[1] - comp2.position[1];
  const dz = comp1.position[2] - comp2.position[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Check if they're close enough (threshold in grid units)
  return distance <= threshold;
}

// Lock UI component that appears when components are close enough to link
function LockUI({ 
  position, 
  onLock, 
  isLocked 
}: { 
  position: [number, number, number]; 
  onLock: () => void;
  isLocked: boolean;
}) {
  return (
    <Html
      position={position}
      center
      style={{
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      distanceFactor={8}
      transform
      occlude
    >
      <div
        className="relative group"
        onClick={(e) => {
          e.stopPropagation();
          onLock();
        }}
        title={isLocked ? 'Unlock components' : 'Lock components together'}
      >
        {/* Glow effect */}
        <div
          className={`absolute inset-0 rounded-full blur-md transition-all ${
            isLocked 
              ? 'bg-green-400/50 group-hover:bg-green-400/70' 
              : 'bg-blue-400/50 group-hover:bg-blue-400/70'
          }`}
          style={{
            transform: 'scale(1.3)',
          }}
        />
        
        {/* Main button */}
        <div
          className={`relative flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all shadow-lg border-2 ${
            isLocked 
              ? 'bg-green-500 hover:bg-green-600 border-green-400' 
              : 'bg-blue-500 hover:bg-blue-600 border-blue-400'
          }`}
          style={{
            boxShadow: isLocked 
              ? '0 0 20px rgba(34, 197, 94, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.2)'
              : '0 0 20px rgba(59, 130, 246, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.2)'
          }}
        >
          <Lock 
            size={22} 
            className={`text-white transition-transform group-hover:scale-110 ${isLocked ? 'fill-white' : ''}`}
            strokeWidth={2.5}
          />
        </div>
        
        {/* Pulse animation for unlocked state */}
        {!isLocked && (
          <div
            className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping"
            style={{
              animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        )}
      </div>
    </Html>
  );
}

// Wrapper component for TransformControls to properly handle refs
function TransformControlWrapper({ 
  component, 
  transformMode, 
  snap, 
  onUpdate, 
  children,
  showCoordinateSystem,
  orbitControlsRef,
  allComponents,
  onUpdateComponent
}: { 
  component: SceneComponent;
  transformMode: 'translate' | 'rotate' | 'scale';
  snap: { translate: number; rotate: number; scale: number };
  onUpdate: (pos: [number, number, number], rot: [number, number, number], scale?: [number, number, number]) => void;
  children: React.ReactNode;
  showCoordinateSystem?: boolean;
  orbitControlsRef?: React.RefObject<any>;
  allComponents?: SceneComponent[];
  onUpdateComponent?: (id: string, update: Partial<SceneComponent>) => void;
}) {
  const GRID_OFFSET = 0; // Components sit exactly on grid lines (Y = 0)
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const { gl, scene, camera } = useThree();
  const isDraggingRef = useRef(false);
  const [groupObject, setGroupObject] = useState<THREE.Group | null>(null);
  
  // Set group object when ref is available
  useEffect(() => {
    if (groupRef.current) {
      setGroupObject(groupRef.current);
    }
  }, []);
  
  // Update group position/rotation when component changes (but not while dragging)
  useEffect(() => {
    if (groupRef.current && !isDraggingRef.current) {
      // Check component type for Y position constraints
      const componentName = (component.name || '').toLowerCase();
      const componentCategory = (component.category || '').toLowerCase();
      const isCM = componentName === 'cm';
      const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
      const isFixedWheel = (componentName.includes('fixed') && componentName.includes('wheel')) ||
                          (componentCategory.includes('fixed') && componentCategory.includes('wheel'));
      const isFixedLeg = componentName.includes('fixed') && 
                        (componentName.includes('leg') || componentCategory.includes('leg'));
      let constrainedY = component.position[1];
      
      if (isCM) {
        // CM must always be at Y: 1.00
        constrainedY = 1.00;
      } else if (isFixedWheel) {
        // Fixed Wheel must always be at Y: 0.05
        constrainedY = 0.05;
      } else if (isWheelWithBreak) {
        // Wheel with Break must always be at Y: 0.10
        constrainedY = 0.10;
        } else if (isFixedLeg) {
          // Fixed Legs must always be at Y: 0.75
          constrainedY = 0.75;
      } else {
        // Ensure Y position is at least GRID_OFFSET (on grid) for other components
        constrainedY = Math.max(component.position[1], GRID_OFFSET);
      }
      
      // Update group position, rotation, and scale to match component
      groupRef.current.position.set(component.position[0], constrainedY, component.position[2]);
      
      // Apply scale if component has scale property
      if (component.scale) {
        groupRef.current.scale.set(component.scale[0], component.scale[1], component.scale[2]);
      } else {
        // Reset to default scale if no scale is set
        groupRef.current.scale.set(1, 1, 1);
      }
      
      // Lock rotation for Wheel with Break and Fixed Wheel (Fixed Legs can be rotated freely)
      // isFixedWheel is already declared above, reuse it
      let rotation: [number, number, number];
      if (isWheelWithBreak) {
        // Wheel with Break must always be locked at X: -90.0 degrees
        rotation = [-Math.PI / 2, 0, 0];
      } else if (isFixedWheel) {
        // Fixed Wheel must always be locked at X: -90.0 degrees
        rotation = [-Math.PI / 2, 0, 0];
      } else {
        rotation = component.rotation || [0, 0, 0];
      }
      
      groupRef.current.rotation.set(...rotation);
      groupRef.current.updateMatrixWorld();
      
      // Update controls if they exist
      if (controlsRef.current) {
        controlsRef.current.updateMatrixWorld();
      }
    }
  }, [component.position, component.rotation, component.name, component.category]);
  
  // Make all meshes in the component interactive for dragging when transform controls are active
  useEffect(() => {
    if (!groupRef.current) return;
    
    // Traverse all meshes and ensure they can be raycasted for dragging
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Ensure mesh is raycastable (this is the default, but making it explicit)
        mesh.raycast = THREE.Mesh.prototype.raycast;
        // Make sure geometry is set up for raycasting
        if (mesh.geometry) {
          mesh.geometry.computeBoundingSphere();
        }
      }
    });
  }, [groupRef.current, component.id]);
  
  // Track dragging state and enforce Y position constraint during drag
  useEffect(() => {
    if (!controlsRef.current || !groupRef.current) return;
    
    const controls = controlsRef.current;
    const group = groupRef.current;
    const componentName = (component.name || '').toLowerCase();
    const componentCategory = (component.category || '').toLowerCase();
    const isCM = componentName === 'cm';
    const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
    const isFixedWheel = (componentName.includes('fixed') && componentName.includes('wheel')) ||
                        (componentCategory.includes('fixed') && componentCategory.includes('wheel'));
    
    // Disable Y-axis movement for CM and Wheel with Break components by hiding the Y handle
    if (controls && (isCM || isWheelWithBreak)) {
      // The showY prop will be set in the JSX, but we can also disable it here
      // This ensures the Y-axis handle is hidden
    }
    
    // Listen to transform controls events
    const handleDraggingChanged = (e: any) => {
      isDraggingRef.current = e.value;
      
      // When dragging ends, enforce position constraints
      if (!e.value && group) {
        const componentCategory = (component.category || '').toLowerCase();
        const isRod = componentName.includes('rod') || componentCategory.includes('rod');
        const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
        const isHorizontalRod = (componentName.includes('horizontal') && isRod) || (componentCategory.includes('horizontal') && isRod);
        const isFixedLeg = componentName.includes('fixed') && 
                          (componentName.includes('leg') || componentCategory.includes('leg'));
        
        // isFixedWheel is already declared in the parent scope (useEffect), reuse it
        // const isFixedWheel = (componentName.includes('fixed') && componentName.includes('wheel')) ||
        //                     (componentCategory.includes('fixed') && componentCategory.includes('wheel'));
        if (isCM) {
          // CM must always be at Y: 1.00
          group.position.y = 1.00;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        } else if (isFixedWheel) {
          // Fixed Wheel must always be at Y: 0.05
          group.position.y = 0.05;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        } else if (isWheelWithBreak) {
          // Wheel with Break must always be at Y: 0.10
          group.position.y = 0.10;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
          } else if (isFixedLeg) {
            // Fixed Legs must always be at Y: 0.75
            group.position.y = 0.75;
            
            // Check if this Fixed Leg is being dragged near a Bed
            // If so, auto-position it so Bed extends 27.5mm on each side
            if (allComponents) {
              const beds = allComponents.filter(bedComp => {
                const bedName = (bedComp.name || '').toLowerCase();
                const bedCategory = (bedComp.category || '').toLowerCase();
                return bedName.includes('bed') || bedCategory.includes('bed');
              });
              
              if (beds.length > 0) {
                // Find the closest Bed
                let nearbyBed: SceneComponent | null = null;
                let minDistance = Infinity;
                
                beds.forEach(bedComp => {
                  const dx = group.position.x - bedComp.position[0];
                  const dz = group.position.z - bedComp.position[2];
                  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
                  
                  if (horizontalDistance < minDistance) {
                    minDistance = horizontalDistance;
                    nearbyBed = bedComp;
                  }
                });
                
                // If Bed is within reasonable distance, auto-position Fixed Leg at marked points
                // Reduce snap radius so manual placements aren't overridden aggressively
                if (nearbyBed && minDistance < 2.0) {
                  // Get Bed dimensions and calculate marked attachment points (at the ends/sides)
                  const bedLengthMm = nearbyBed.bounding_box 
                    ? Math.abs((nearbyBed.bounding_box.max[0] || 0) - (nearbyBed.bounding_box.min[0] || 0))
                    : 0;
                  const bedWidthMm = nearbyBed.bounding_box 
                    ? Math.abs((nearbyBed.bounding_box.max[2] || 0) - (nearbyBed.bounding_box.min[2] || 0))
                    : 0;
                  
                  const bedLengthGrid = bedLengthMm / 100;
                  const bedWidthGrid = bedWidthMm / 100;
                  
                  const bedX = nearbyBed.position[0];
                  const bedZ = nearbyBed.position[2];
                  
                  // Determine which axis is the length (longer dimension)
                  const isBedLongerInX = bedLengthGrid > bedWidthGrid;
                  
                  // Calculate marked points at the ends of the bed (left and right, or front and back)
                  // Add a small offset to move legs slightly towards the center (away from the exact edge)
                  const LEG_OFFSET_MM = 10.0; // 10mm offset towards center
                  const LEG_OFFSET_GRID = LEG_OFFSET_MM / 100;
                  
                  let markedPoints: Array<[number, number]>;
                  
                  if (isBedLongerInX) {
                    // Bed extends in X direction - marked points are at left and right ends
                    // Move left leg slightly right (towards center), right leg slightly left (towards center)
                    const bedLeftEdge = bedX - (bedLengthGrid / 2);
                    const bedRightEdge = bedX + (bedLengthGrid / 2);
                    markedPoints = [
                      [bedLeftEdge + LEG_OFFSET_GRID, bedZ],   // Left side (offset towards center)
                      [bedRightEdge - LEG_OFFSET_GRID, bedZ]   // Right side (offset towards center)
                    ];
                  } else {
                    // Bed extends in Z direction - marked points are at front and back ends
                    // Move front leg slightly back (towards center), back leg slightly forward (towards center)
                    const bedFrontEdge = bedZ - (bedWidthGrid / 2);
                    const bedBackEdge = bedZ + (bedWidthGrid / 2);
                    markedPoints = [
                      [bedX, bedFrontEdge + LEG_OFFSET_GRID],   // Front side (offset towards center)
                      [bedX, bedBackEdge - LEG_OFFSET_GRID]    // Back side (offset towards center)
                    ];
                  }
                  
                  // Find other Fixed Legs linked to this Bed
                  const otherLegs = allComponents.filter(leg => {
                    if (leg.id === component.id) return false;
                    const legName = (leg.name || '').toLowerCase();
                    const legCategory = (leg.category || '').toLowerCase();
                    return legName.includes('fixed') && 
                           (legName.includes('leg') || legCategory.includes('leg'));
                  });
                  
                  // Calculate bed edges
                  const bedLeftEdge = bedX - (bedLengthGrid / 2);
                  const bedRightEdge = bedX + (bedLengthGrid / 2);
                  const bedFrontEdge = bedZ - (bedWidthGrid / 2);
                  const bedBackEdge = bedZ + (bedWidthGrid / 2);
                  
                  // Determine which SIDE of the bed the current position is on
                  let targetEndIndex = 0;
                  let legX: number;
                  let legZ: number;
                    
                    if (isBedLongerInX) {
                    // Bed extends in X direction
                    if (group.position.x < bedX) {
                      targetEndIndex = 0; // Left side
                    } else {
                      targetEndIndex = 1; // Right side
                    }
                    
                    // Use a fixed small offset from bed edge (consistent placement)
                    // This ensures legs are always placed close to the bed edges at marked points
                    const FIXED_OFFSET_FROM_EDGE_MM = 10.0; // 10mm from edge
                    const FIXED_OFFSET_GRID = FIXED_OFFSET_FROM_EDGE_MM / 100;
                    
                    // Place leg at fixed distance from the target edge
                    if (targetEndIndex === 0) {
                      // Left side - place at left edge + offset
                      legX = bedLeftEdge + FIXED_OFFSET_GRID;
                    } else {
                      // Right side - place at right edge - offset
                      legX = bedRightEdge - FIXED_OFFSET_GRID;
                    }
                    
                    // Check if there are legs at the same side for side-by-side placement
                    const legsAtSameSide = otherLegs.filter(leg => {
                      const legOnLeft = leg.position[0] < bedX;
                      return (targetEndIndex === 0 && legOnLeft) || (targetEndIndex === 1 && !legOnLeft);
                    });
                    
                    // Check if there are legs on the opposite side (to use as reference for both X and Z)
                    const legsAtOppositeSide = otherLegs.filter(leg => {
                      const legOnLeft = leg.position[0] < bedX;
                      return (targetEndIndex === 0 && !legOnLeft) || (targetEndIndex === 1 && legOnLeft);
                    });
                    
                    // If there are opposite side legs, place 1.89 units away from their Z position
                    if (legsAtOppositeSide.length > 0) {
                      // Find the closest opposite leg and add 1.89 to its Z position
                      let closestLeg = legsAtOppositeSide[0];
                      let minDistance = Math.abs(group.position.z - closestLeg.position[2]);
                      legsAtOppositeSide.forEach(leg => {
                        const distance = Math.abs(group.position.z - leg.position[2]);
                        if (distance < minDistance) {
                          minDistance = distance;
                          closestLeg = leg;
                        }
                      });
                      legZ = closestLeg.position[2] + 1.89;
                    } else if (otherLegs.length > 0) {
                      // If there are other legs on same side, only align Z if very close (within 0.2 units)
                      let closest = otherLegs[0];
                      let best = Math.abs(group.position.z - closest.position[2]);
                      otherLegs.forEach(leg => {
                        const d = Math.abs(group.position.z - leg.position[2]);
                        if (d < best) { best = d; closest = leg; }
                      });
                      // Only snap if very close to existing leg, otherwise allow free placement
                      const SNAP_THRESHOLD = 0.2; // Only snap if within 0.2 units
                      if (best < SNAP_THRESHOLD) {
                        legZ = closest.position[2];
                      } else {
                        // Allow free placement - use current Z position or bed center
                        legZ = group.position.z !== undefined ? group.position.z : bedZ;
                      }
                    } else if (legsAtSameSide.length > 0) {
                      // Place side by side in Z direction (only if no other legs exist)
                      const LEG_SPACING_MM = 50.0;
                      const LEG_SPACING_GRID = LEG_SPACING_MM / 100;
                      let maxZ = -Infinity;
                      let minZ = Infinity;
                      legsAtSameSide.forEach(leg => {
                        if (leg.position[2] > maxZ) maxZ = leg.position[2];
                        if (leg.position[2] < minZ) minZ = leg.position[2];
                      });
                      
                      const legWidthGrid = component.bounding_box 
                        ? Math.abs((component.bounding_box.max[2] || 0) - (component.bounding_box.min[2] || 0)) / 100
                        : 0.5;
                      
                      const spaceAbove = Math.abs(bedZ - maxZ);
                      const spaceBelow = Math.abs(bedZ - minZ);
                      
                      if (spaceAbove > spaceBelow) {
                        legZ = maxZ + LEG_SPACING_GRID + (legWidthGrid / 2);
                      } else {
                        legZ = minZ - LEG_SPACING_GRID - (legWidthGrid / 2);
                      }
                    } else {
                      // No legs at all - use bed center Z
                      legZ = bedZ;
                    }
                  } else {
                    // Bed extends in Z direction
                    if (group.position.z < bedZ) {
                      targetEndIndex = 0; // Front side
                    } else {
                      targetEndIndex = 1; // Back side
                    }
                    
                    // Use a fixed small offset from bed edge (consistent placement)
                    const FIXED_OFFSET_FROM_EDGE_MM = 10.0; // 10mm from edge
                    const FIXED_OFFSET_GRID = FIXED_OFFSET_FROM_EDGE_MM / 100;
                    
                    // Place leg at fixed distance from the target edge
                    if (targetEndIndex === 0) {
                      // Front side - place at front edge + offset
                      legZ = bedFrontEdge + FIXED_OFFSET_GRID;
                    } else {
                      // Back side - place at back edge - offset
                      legZ = bedBackEdge - FIXED_OFFSET_GRID;
                    }
                    
                    // Check if there are legs at the same side for side-by-side placement
                    const legsAtSameSide = otherLegs.filter(leg => {
                      const legOnFront = leg.position[2] < bedZ;
                      return (targetEndIndex === 0 && legOnFront) || (targetEndIndex === 1 && !legOnFront);
                    });
                    
                    // Check if there are legs on the opposite side (to use as reference for both X and Z)
                    const legsAtOppositeSide = otherLegs.filter(leg => {
                      const legOnFront = leg.position[2] < bedZ;
                      return (targetEndIndex === 0 && !legOnFront) || (targetEndIndex === 1 && legOnFront);
                    });
                    
                    // Only align X to nearest existing leg if very close (within 0.2 units)
                    if (otherLegs.length > 0) {
                      let closest = otherLegs[0];
                      let best = Math.abs(group.position.x - closest.position[0]);
                      otherLegs.forEach(leg => {
                        const d = Math.abs(group.position.x - leg.position[0]);
                        if (d < best) { best = d; closest = leg; }
                      });
                      // Only snap if very close to existing leg, otherwise allow free placement
                      const SNAP_THRESHOLD = 0.2; // Only snap if within 0.2 units
                      if (best < SNAP_THRESHOLD) {
                        legX = closest.position[0];
                      } else {
                        // Allow free placement - use current X position or bed center
                        legX = group.position.x !== undefined ? group.position.x : bedX;
                      }
                    } else if (legsAtSameSide.length > 0) {
                      // Place side by side in X direction (only if no other legs exist)
                      const LEG_SPACING_MM = 50.0;
                      const LEG_SPACING_GRID = LEG_SPACING_MM / 100;
                      let maxX = -Infinity;
                      let minX = Infinity;
                      legsAtSameSide.forEach(leg => {
                        if (leg.position[0] > maxX) maxX = leg.position[0];
                        if (leg.position[0] < minX) minX = leg.position[0];
                      });
                      
                      const legLengthGrid = component.bounding_box 
                        ? Math.abs((component.bounding_box.max[0] || 0) - (component.bounding_box.min[0] || 0)) / 100
                        : 0.5;
                      
                      const spaceRight = Math.abs(bedX - maxX);
                      const spaceLeft = Math.abs(bedX - minX);
                      
                      if (spaceRight > spaceLeft) {
                        legX = maxX + LEG_SPACING_GRID + (legLengthGrid / 2);
                      } else {
                        legX = minX - LEG_SPACING_GRID - (legLengthGrid / 2);
                      }
                    } else {
                      // No legs at all - use bed center X
                      legX = bedX;
                    }
                  }
                  
                  group.position.x = legX;
                  group.position.z = legZ;
                  
                  group.updateMatrixWorld();
                  controls.updateMatrixWorld();
                  
                  // Update component position via onUpdateComponent
                  if (onUpdateComponent) {
                    onUpdateComponent(component.id, {
                      position: [group.position.x, group.position.y, group.position.z]
                    });
                  }
                }
              }
            }
            
            group.updateMatrixWorld();
            controls.updateMatrixWorld();
        } else if (isVerticalRod && component.isLocked && component.linkedTo && allComponents) {
          // Check if vertical rod is locked to a wheel
          const linkedComp = allComponents.find(c => c.id === component.linkedTo);
          const linkedName = (linkedComp?.name || '').toLowerCase();
          const isLinkedToWheel = linkedName.includes('wheel') && linkedName.includes('break');
          if (isLinkedToWheel) {
            // Vertical Rod locked to Wheel should be at Y: 1.46
            group.position.y = 1.46;
            group.updateMatrixWorld();
            controls.updateMatrixWorld();
          } else if (group.position.y < GRID_OFFSET) {
            group.position.y = GRID_OFFSET;
            group.updateMatrixWorld();
            controls.updateMatrixWorld();
          }
        } else if (isHorizontalRod && allComponents && onUpdateComponent) {
          // Horizontal Rod: Auto-extend length to touch the other side when moved
          // Horizontal rods extend in Z direction (length is in Z axis)
          const currentPos = group.position;
          
          // Find all potential target components (other horizontal rods, fixed legs, beds)
          const potentialTargets: Array<{ comp: SceneComponent; distance: number; direction: 'positive' | 'negative' }> = [];
          
          allComponents.forEach(comp => {
            if (comp.id === component.id) return;
            
            const compName = (comp.name || '').toLowerCase();
            const compCategory = (comp.category || '').toLowerCase();
            
            // Check if it's a relevant component (horizontal rod, fixed leg, bed, or frame)
            const isRelevant = 
              (compName.includes('horizontal') && (compName.includes('rod') || compCategory.includes('rod'))) ||
              (compName.includes('fixed') && (compName.includes('leg') || compCategory.includes('leg'))) ||
              compName.includes('bed') || compCategory.includes('bed') ||
              compName.includes('frame') || compCategory.includes('frame');
            
            if (isRelevant) {
              // Calculate distance in Z direction (horizontal rods extend in Z)
              const dz = comp.position[2] - currentPos.z;
              const dx = Math.abs(comp.position[0] - currentPos.x);
              const dy = Math.abs(comp.position[1] - currentPos.y);
              
              // Only consider components that are roughly aligned in X and Y
              if (dx < 2.0 && dy < 1.0 && Math.abs(dz) > 0.1) {
                potentialTargets.push({
                  comp,
                  distance: Math.abs(dz),
                  direction: dz > 0 ? 'positive' : 'negative'
                });
              }
            }
          });
          
          // Find the furthest target in each direction
          let furthestPositive: { comp: SceneComponent; distance: number } | null = null;
          let furthestNegative: { comp: SceneComponent; distance: number } | null = null;
          
          potentialTargets.forEach(target => {
            if (target.direction === 'positive') {
              if (!furthestPositive || target.distance > furthestPositive.distance) {
                furthestPositive = { comp: target.comp, distance: target.distance };
              }
            } else {
              if (!furthestNegative || target.distance > furthestNegative.distance) {
                furthestNegative = { comp: target.comp, distance: target.distance };
              }
            }
          });
          
          // Determine which side to extend to (use the furthest target)
          let targetZ: number | null = null;
          if (furthestPositive && furthestNegative) {
            // Use the furthest one
            targetZ = furthestPositive.distance > furthestNegative.distance 
              ? furthestPositive.comp.position[2]
              : furthestNegative.comp.position[2];
          } else if (furthestPositive) {
            targetZ = furthestPositive.comp.position[2];
          } else if (furthestNegative) {
            targetZ = furthestNegative.comp.position[2];
          }
          
          // If we found a target, calculate the required length
          if (targetZ !== null && component.bounding_box) {
            // Calculate distance from current position to target in Z direction
            const dz = targetZ - currentPos.z;
            const distance = Math.abs(dz);
            
            // The rod's center is at currentPos.z, and we want it to reach targetZ
            // So the rod needs to extend from center to target, which means:
            // length = 2 * distance (to reach from center to target in the target direction)
            // But we also need to account for the rod's current length
            const currentLengthGrid = component.bounding_box 
              ? Math.abs((component.bounding_box.max[2] || 0) - (component.bounding_box.min[2] || 0)) / 100
              : 0;
            
            // Calculate required length: rod should extend from its center to the target
            // If target is in positive Z: rod extends from center to target, so end = center + length/2 = target
            // Therefore: length = 2 * (targetZ - centerZ)
            // If target is in negative Z: rod extends from center to target, so end = center - length/2 = target
            // Therefore: length = 2 * (centerZ - targetZ)
            const requiredLengthGrid = 2 * distance;
            
            // Convert to mm (grid units to mm)
            const requiredLengthMm = Math.max(350, Math.round(requiredLengthGrid * 100));
            
            // Get current rod dimensions
            const currentLength = component.dimensions?.length || 
                                 (component.bounding_box ? Math.abs((component.bounding_box.max[2] || 0) - (component.bounding_box.min[2] || 0)) : 350);
            
            // Always update to ensure it reaches the target
            if (Math.abs(requiredLengthMm - currentLength) > 5) {
              // Update the rod's length dimension
              // For horizontal rods, length is in Z axis (max[2] - min[2])
              const newBoundingBox = component.bounding_box ? {
                ...component.bounding_box,
                max: [
                  component.bounding_box.max[0] || 0,
                  component.bounding_box.max[1] || 0,
                  (component.bounding_box.min[2] || 0) + requiredLengthMm
                ] as [number, number, number]
              } : component.bounding_box;
              
              onUpdateComponent(component.id, {
                bounding_box: newBoundingBox,
                dimensions: {
                  ...component.dimensions,
                  length: requiredLengthMm,
                  width: component.dimensions?.width || 50,
                  height: component.dimensions?.height || 50
                }
              });
            }
          }
          
          // Rods can move freely in Y, but must stay above or at grid level (Y >= 0)
          if (group.position.y < GRID_OFFSET) {
            group.position.y = GRID_OFFSET;
            group.updateMatrixWorld();
            controls.updateMatrixWorld();
          }
        } else if (isRod) {
          // Rods can move freely in Y, but must stay above or at grid level (Y >= 0)
          if (group.position.y < GRID_OFFSET) {
            group.position.y = GRID_OFFSET;
            group.updateMatrixWorld();
            controls.updateMatrixWorld();
          }
        } else if (group.position.y < GRID_OFFSET) {
          // Constrain other components to not go below grid
          group.position.y = GRID_OFFSET;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        }
      }
    };
    
    // Also enforce constraint during dragging (on every frame)
    const handleObjectChange = () => {
      if (isDraggingRef.current && groupRef.current) {
        const group = groupRef.current;
        const componentName = (component.name || '').toLowerCase();
        const componentCategory = (component.category || '').toLowerCase();
        const isCM = componentName === 'cm';
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
        const isRod = componentName.includes('rod') || componentCategory.includes('rod');
        const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
        const isBed = componentName.includes('bed') || componentCategory.includes('bed');
        
        if (isCM) {
          // CM must always be at Y: 1.00, even while dragging
          // Prevent both above and below Y: 1.00
          if (group.position.y !== 1.00) {
            group.position.y = 1.00;
            group.updateMatrixWorld();
            // Force update controls to reflect the locked position
            if (controlsRef.current) {
              controlsRef.current.updateMatrixWorld();
            }
          }
        } else if (isWheelWithBreak) {
          // Wheel with Break must always be at Y: 0.10, even while dragging
          // Prevent both above and below Y: 0.10
          if (group.position.y !== 0.10) {
            group.position.y = 0.10;
            group.updateMatrixWorld();
            // Force update controls to reflect the locked position
            if (controlsRef.current) {
              controlsRef.current.updateMatrixWorld();
            }
          }
          // Also lock rotation to X: -90.0 degrees
          if (group.rotation.x !== -Math.PI / 2 || group.rotation.y !== 0 || group.rotation.z !== 0) {
            group.rotation.x = -Math.PI / 2;
            group.rotation.y = 0;
            group.rotation.z = 0;
            group.updateMatrixWorld();
            if (controlsRef.current) {
              controlsRef.current.updateMatrixWorld();
            }
          }
        } else {
          const isFixedLeg = componentName.includes('fixed') && 
                            (componentName.includes('leg') || componentCategory.includes('leg'));
          if (isFixedLeg) {
            // Fixed Legs must always be at Y: 0.75, even while dragging
            // Prevent both above and below Y: 0.75
            if (group.position.y !== 0.75) {
              group.position.y = 0.75;
              group.updateMatrixWorld();
              // Force update controls to reflect the locked position
              if (controlsRef.current) {
                controlsRef.current.updateMatrixWorld();
              }
            }
          } else if (isVerticalRod && component.isLocked && component.linkedTo && allComponents) {
            // Check if vertical rod is locked to a wheel
            const linkedComp = allComponents.find(c => c.id === component.linkedTo);
            const linkedName = (linkedComp?.name || '').toLowerCase();
            const isLinkedToWheel = linkedName.includes('wheel') && linkedName.includes('break');
            if (isLinkedToWheel) {
              // Vertical Rod locked to Wheel should be at Y: 1.46, even while dragging
              if (group.position.y !== 1.46) {
                group.position.y = 1.46;
                group.updateMatrixWorld();
                // Force update controls to reflect the locked position
                if (controlsRef.current) {
                  controlsRef.current.updateMatrixWorld();
                }
              }
            } else if (group.position.y < GRID_OFFSET) {
              group.position.y = GRID_OFFSET;
              group.updateMatrixWorld();
              if (controlsRef.current) {
                controlsRef.current.updateMatrixWorld();
              }
            }
          } else if (isRod) {
            // Rods can move freely in Y, but must stay above or at grid level (Y >= 0)
            if (group.position.y < GRID_OFFSET) {
              group.position.y = GRID_OFFSET;
              group.updateMatrixWorld();
              if (controlsRef.current) {
                controlsRef.current.updateMatrixWorld();
              }
            }
          } else if (isBed) {
            // Bed can move freely in Y (no constraints)
            // Allow Bed to move up and down without restrictions
          } else if (group.position.y < GRID_OFFSET) {
            // Constrain other components to not go below grid
            group.position.y = GRID_OFFSET;
            group.updateMatrixWorld();
          }
        }
      }
    };
    
    if (controlsRef.current) {
      controlsRef.current.addEventListener('dragging-changed', handleDraggingChanged);
      controlsRef.current.addEventListener('objectChange', handleObjectChange);
      
      return () => {
        if (controlsRef.current) {
          controlsRef.current.removeEventListener('dragging-changed', handleDraggingChanged);
          controlsRef.current.removeEventListener('objectChange', handleObjectChange);
        }
      };
    }
  }, [component.name, component.category, component.isLocked, component.linkedTo, allComponents]);
  
  // Custom drag handling for move tool - allows dragging by clicking anywhere on component
  const isDraggingComponentRef = useRef(false);
  const dragStartPosRef = useRef<THREE.Vector3 | null>(null);
  const dragStartIntersectionRef = useRef<THREE.Vector3 | null>(null);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Add pointer event handlers for dragging when in translate mode
  useEffect(() => {
    if (!groupRef.current || transformMode !== 'translate') return;
    
    const group = groupRef.current;
    const canvas = gl.domElement;
    
    const handlePointerDown = (e: PointerEvent) => {
      // Only handle if clicking on the component itself (not controls)
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      // Check if we clicked on any mesh in the component
      const meshes: THREE.Mesh[] = [];
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes.push(child as THREE.Mesh);
        }
      });
      
      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      
      if (intersects.length > 0) {
        // Check if we clicked on TransformControls handles (they have specific names)
        const intersectObject = intersects[0].object;
        const isControlHandle = intersectObject.parent?.name?.includes('TransformControls') || 
                               intersectObject.name?.includes('TransformControls');
        
        if (!isControlHandle) {
          isDraggingComponentRef.current = true;
          dragStartPosRef.current = group.position.clone();
          
          // Store the initial intersection point on the component
          dragStartIntersectionRef.current = intersects[0].point.clone();
          
          // Create a horizontal plane at the component's Y position for dragging
          const planeNormal = new THREE.Vector3(0, 1, 0); // Drag on horizontal plane
          dragPlaneRef.current = new THREE.Plane(planeNormal, -group.position.y);
          
          // Disable OrbitControls while dragging
          if (orbitControlsRef?.current) {
            orbitControlsRef.current.enabled = false;
          }
          
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingComponentRef.current || !groupRef.current || !dragPlaneRef.current || !dragStartPosRef.current || !dragStartIntersectionRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      const intersectionPoint = new THREE.Vector3();
      const distance = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectionPoint);
      
      if (distance !== null) {
        // Calculate the delta from the initial intersection point
        const delta = new THREE.Vector3().subVectors(intersectionPoint, dragStartIntersectionRef.current);
        const newPos = dragStartPosRef.current.clone().add(delta);
        
        // Apply constraints
        const componentName = (component.name || '').toLowerCase();
        const isCM = componentName === 'cm';
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
        const isRod = componentName.includes('rod') || (component.category || '').toLowerCase().includes('rod');
        const isBed = componentName.includes('bed') || (component.category || '').toLowerCase().includes('bed');
        
        let constrainedY = newPos.y;
        if (isCM) {
          constrainedY = 1.00;
        } else if (isWheelWithBreak) {
          constrainedY = 0.10;
        } else if (isRod) {
          // Rods can move freely in Y, but must stay above or at grid level (Y >= 0)
          constrainedY = Math.max(newPos.y, GRID_OFFSET);
        } else if (isBed) {
          // Bed can move freely in Y (no constraints)
          constrainedY = newPos.y;
        } else {
          // Constrain other components to not go below grid
          constrainedY = Math.max(newPos.y, GRID_OFFSET);
        }
        
        // Apply snapping
        const snappedX = Math.round(newPos.x / snap.translate) * snap.translate;
        const snappedZ = Math.round(newPos.z / snap.translate) * snap.translate;
        
        groupRef.current.position.set(snappedX, constrainedY, snappedZ);
        groupRef.current.updateMatrixWorld();
        
        // Update TransformControls if they exist
        if (controlsRef.current) {
          controlsRef.current.updateMatrixWorld();
        }
        
        // Update component position
        const pos: [number, number, number] = [snappedX, constrainedY, snappedZ];
        const rot: [number, number, number] = [
          groupRef.current.rotation.x,
          groupRef.current.rotation.y,
          groupRef.current.rotation.z
        ];
        // In translate mode, preserve existing scale
        const currentScale = component.scale || [1, 1, 1];
        onUpdate(pos, rot, currentScale);
      }
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingComponentRef.current) {
        isDraggingComponentRef.current = false;
        dragStartPosRef.current = null;
        dragStartIntersectionRef.current = null;
        dragPlaneRef.current = null;
        
        // Re-enable OrbitControls after dragging
        if (orbitControlsRef?.current) {
          orbitControlsRef.current.enabled = true;
        }
        
        canvas.style.cursor = 'default';
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [transformMode, component, snap, onUpdate, gl, camera]);
  
  // drei's TransformControls automatically coordinates with OrbitControls
  // Use object prop to directly attach to the group
  
  return (
    <>
      <group 
        ref={groupRef}
        position={[
          component.position[0],
          (() => {
            // CM must always be locked at Y: 1.00
            const isCM = (component.name || '').toLowerCase() === 'cm';
            if (isCM) {
              return 1.00;
            }
            // Fixed Wheel must always be locked at Y: 0.05
            const isFixedWheel = ((component.name || '').toLowerCase().includes('fixed') && 
                                 (component.name || '').toLowerCase().includes('wheel')) ||
                                ((component.category || '').toLowerCase().includes('fixed') && 
                                 (component.category || '').toLowerCase().includes('wheel'));
            if (isFixedWheel) {
              return 0.05;
            }
            // Wheel with Break must always be locked at Y: 0.10
            const isWheelWithBreak = (component.name || '').toLowerCase().includes('wheel') && 
                                    (component.name || '').toLowerCase().includes('break');
            if (isWheelWithBreak) {
              return 0.10;
            }
            // Fixed Legs must always be locked at Y: 0.75
            const componentName = (component.name || '').toLowerCase();
            const componentCategory = (component.category || '').toLowerCase();
            const isFixedLeg = componentName.includes('fixed') && 
                              (componentName.includes('leg') || componentCategory.includes('leg'));
            if (isFixedLeg) {
              return 0.75;
            }
            // Rod can be above grid, but must stay at or above grid level (Y >= 0)
            const isRod = componentName.includes('rod') || componentCategory.includes('rod');
            return isRod ? Math.max(component.position[1], GRID_OFFSET) : Math.max(component.position[1], GRID_OFFSET);
          })(),
          component.position[2]
        ]} 
        rotation={component.rotation || [0, 0, 0]}
      >
        {children}
        {/* Show coordinate system for selected component if setting is enabled */}
        {showCoordinateSystem && (
          <axesHelper args={[2]} />
        )}
        {/* Length increase arrows are rendered in the main Scene component where onUpdateComponent is available */}
      </group>
      {groupObject && (() => {
        const componentName = (component.name || '').toLowerCase();
        const componentCategory = (component.category || '').toLowerCase();
        const isCM = componentName === 'cm';
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
        const isFixedWheel = (componentName.includes('fixed') && componentName.includes('wheel')) ||
                            (componentCategory.includes('fixed') && componentCategory.includes('wheel'));
        const isFixedLeg = componentName.includes('fixed') && 
                          (componentName.includes('leg') || componentCategory.includes('leg'));
        // Show Y-axis handle for all components except CM, Wheel with Break, and Fixed Legs
        // Bed and other components should have Y-axis handle visible for vertical movement
        const showYAxis = !(isCM || isWheelWithBreak || isFixedLeg);
        return (
    <TransformControls
      ref={controlsRef}
          object={groupObject}
      mode={transformMode}
      space="world"
      translationSnap={snap.translate}
      rotationSnap={snap.rotate}
      scaleSnap={snap.scale}
      showX={true}
            showY={showYAxis} // Hide Y-axis handle for CM, Wheel with Break, and Fixed Legs components to prevent vertical movement
      showZ={true}
            // Enable dragging by clicking anywhere on the object (not just handles)
            // This allows users to drag components by touching/clicking anywhere on the mesh
            enabled={true}
      onObjectChange={(e) => {
            const obj = groupRef.current;
            if (!obj) return;
        
        // Get position and rotation from the group being controlled
        const GRID_OFFSET = 0; // Ensure components stay on grid
        // isCM and isWheelWithBreak are already declared in the outer scope
        const componentCategory = (component.category || '').toLowerCase();
        const isFixedLeg = componentName.includes('fixed') && 
                          (componentName.includes('leg') || componentCategory.includes('leg'));
        
        // Constrain Y position based on component type
        let yPos = obj.position.y;
        if (isCM) {
          // CM must always be locked at Y: 1.00 - prevent both above and below
          // Force position to exactly 1.00 regardless of user input
          yPos = 1.00;
          obj.position.y = 1.00;
          obj.updateMatrixWorld();
          // Force update controls to prevent visual glitches
          if (controlsRef.current) {
            controlsRef.current.updateMatrixWorld();
          }
        } else if (isWheelWithBreak) {
          // Wheel with Break must always be locked at Y: 0.10 - prevent both above and below
          // Force position to exactly 0.10 regardless of user input
          yPos = 0.10;
          obj.position.y = 0.10;
          obj.updateMatrixWorld();
          // Force update controls to prevent visual glitches
          if (controlsRef.current) {
            controlsRef.current.updateMatrixWorld();
          }
        } else if (isFixedLeg) {
          // Fixed Legs must always be locked at Y: 0.75 - prevent both above and below
          // Force position to exactly 0.75 regardless of user input
          yPos = 0.75;
          obj.position.y = 0.75;
          obj.updateMatrixWorld();
          // Force update controls to prevent visual glitches
          if (controlsRef.current) {
            controlsRef.current.updateMatrixWorld();
          }
        } else {
          const isBed = componentName.includes('bed') || componentCategory.includes('bed');
          if (isBed) {
            // Bed can move freely in Y (no constraints)
            // Apply snapping only
            yPos = Math.round(yPos / snap.translate) * snap.translate;
          } else {
            // Constrain Y position to be at least GRID_OFFSET (on grid) for all components including rods
            // Rods can move freely above the grid, but must stay at or above Y = 0
            // This prevents components from going below the grid during move/rotate
            if (yPos < GRID_OFFSET) {
              yPos = GRID_OFFSET;
              // Immediately update the object's position to enforce constraint
              obj.position.y = GRID_OFFSET;
              obj.updateMatrixWorld();
            }
            
            // Apply snapping after constraint (but not for CM - it's locked)
            yPos = Math.round(yPos / snap.translate) * snap.translate;
            // Ensure snapped position is still on grid
            if (yPos < GRID_OFFSET) {
              yPos = GRID_OFFSET;
            }
          }
        }
        
        const pos = [
          Math.round(obj.position.x / snap.translate) * snap.translate,
          yPos,
          Math.round(obj.position.z / snap.translate) * snap.translate
        ] as [number, number, number];
        
        // Constrain rotation based on component type
        // isFixedWheel is already declared in the IIFE scope above, reuse it
        let rot: [number, number, number];
        if (isWheelWithBreak) {
          // Wheel with Break must always be locked at X: -90.0 degrees (-Math.PI / 2)
          rot = [-Math.PI / 2, 0, 0] as [number, number, number];
          // Force rotation to match locked value
          obj.rotation.x = -Math.PI / 2;
          obj.rotation.y = 0;
          obj.rotation.z = 0;
          obj.updateMatrixWorld();
          // Force update controls to prevent visual glitches
          if (controlsRef.current) {
            controlsRef.current.updateMatrixWorld();
          }
        } else if (isFixedWheel) {
          // Fixed Wheel must always be locked at X: -90.0 degrees (-Math.PI / 2)
          rot = [-Math.PI / 2, 0, 0] as [number, number, number];
          // Force rotation to match locked value
          obj.rotation.x = -Math.PI / 2;
          obj.rotation.y = 0;
          obj.rotation.z = 0;
          obj.updateMatrixWorld();
          // Force update controls to prevent visual glitches
          if (controlsRef.current) {
            controlsRef.current.updateMatrixWorld();
          }
        } else {
          // Apply normal rotation snapping for other components
          rot = [
          Math.round(obj.rotation.x / snap.rotate) * snap.rotate,
          Math.round(obj.rotation.y / snap.rotate) * snap.rotate,
          Math.round(obj.rotation.z / snap.rotate) * snap.rotate
        ] as [number, number, number];
        }
        
        // Extract and snap scale if in scale mode
        let scale: [number, number, number] | undefined;
        if (transformMode === 'scale') {
          scale = [
            Math.round(obj.scale.x / snap.scale) * snap.scale,
            Math.round(obj.scale.y / snap.scale) * snap.scale,
            Math.round(obj.scale.z / snap.scale) * snap.scale
          ] as [number, number, number];
          // Ensure scale is never zero or negative
          scale[0] = Math.max(0.01, scale[0]);
          scale[1] = Math.max(0.01, scale[1]);
          scale[2] = Math.max(0.01, scale[2]);
          // Apply the snapped scale back to the object
          obj.scale.set(scale[0], scale[1], scale[2]);
          obj.updateMatrixWorld();
        }
        
        onUpdate(pos, rot, scale);
      }}
        />
        );
      })()}
    </>
  );
}

// Component to expose camera controls via ref
function CameraControlsExposer({ 
  controlsRef, 
  cameraRef, 
  onControlsReady,
  components,
  viewMode,
  selectedId,
  onClearSelection,
  zoomTarget,
  mousePosition,
  sceneRef
}: { 
  controlsRef: React.RefObject<any>; 
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  onControlsReady: (controls: SceneControls) => void;
  components: SceneComponent[];
  viewMode: 'focused' | 'shopfloor';
  selectedId: string | null;
  onClearSelection: () => void;
  zoomTarget?: 'center' | 'mouse';
  mousePosition: THREE.Vector2 | null;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
}) {
  const { camera, scene } = useThree();
  
  // Animation state for smooth camera movement
  const isAnimatingRef = useRef(false);
  const animationStartPos = useRef(new THREE.Vector3());
  const animationEndPos = useRef(new THREE.Vector3());
  const animationStartTarget = useRef(new THREE.Vector3());
  const animationEndTarget = useRef(new THREE.Vector3());
  const animationProgress = useRef(0);
  
  // Update camera ref when camera changes
  useEffect(() => {
    if (camera && cameraRef) {
      cameraRef.current = camera;
    }
  }, [camera, cameraRef]);

  // Smooth camera animation loop
  useFrame((state, delta) => {
    if (isAnimatingRef.current && controlsRef.current) {
      animationProgress.current += delta * 2; // Animation speed (2 = ~0.5 seconds)
      
      if (animationProgress.current >= 1) {
        // Animation complete
        animationProgress.current = 1;
        isAnimatingRef.current = false;
      }
      
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - animationProgress.current, 3);
      
      // Lerp camera position
      const currentPos = new THREE.Vector3();
      lerpVector3(animationStartPos.current, animationEndPos.current, eased, currentPos);
      camera.position.copy(currentPos);
      
      // Lerp controls target
      const currentTarget = new THREE.Vector3();
      lerpVector3(animationStartTarget.current, animationEndTarget.current, eased, currentTarget);
      controlsRef.current.target.copy(currentTarget);
      
      // Update controls and camera
      controlsRef.current.update();
      camera.updateProjectionMatrix();
    }
  });

  // Helper function to get the zoom target point (mouse cursor or controls target)
  const getZoomTarget = useCallback((): THREE.Vector3 => {
    if (zoomTarget === 'mouse' && mousePosition && cameraRef.current && sceneRef.current) {
      // Use raycasting to find the 3D point under the mouse cursor
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mousePosition, cameraRef.current);
      
      // Try to intersect with objects in the scene
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      
      if (intersects.length > 0) {
        // Use the first intersection point
        return intersects[0].point;
      } else {
        // If no intersection, project mouse to a plane at the controls target distance
        // This creates a smooth zoom experience even when not hovering over objects
        const distance = cameraRef.current.position.distanceTo(controlsRef.current?.target || new THREE.Vector3(0, 0, 0));
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
        const intersectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectionPoint);
        
        // Project to a plane at the target distance
        const direction = raycaster.ray.direction.normalize();
        const targetPoint = cameraRef.current.position.clone().add(direction.multiplyScalar(distance));
        return targetPoint;
      }
    }
    // Default to controls target (center of screen)
    return controlsRef.current?.target || new THREE.Vector3(0, 0, 0);
  }, [zoomTarget, mousePosition, cameraRef, sceneRef, controlsRef]);

  const controls = useMemo<SceneControls>(() => ({
    resetCamera: () => {
      console.log('🎯 resetCamera called, components:', components.length);
      
      if (!controlsRef.current || !camera) {
        console.warn('⚠️ Camera or controls not ready');
        return;
      }
      
      // Compute bounding box from actual scene objects (like proper CAD viewer)
      const box = new THREE.Box3();
      let hasObjects = false;
      
      // Traverse scene to find all visible meshes
      scene.traverse((object) => {
        // Skip helpers, lights, cameras, and the grid
        if (object instanceof THREE.Mesh) {
          const mesh = object as THREE.Mesh;
          if (mesh.visible && 
              !mesh.userData.isHelper &&
              !mesh.userData.isGroundPlane &&
              mesh.geometry) {
            // Update world matrix to get correct world position
            mesh.updateMatrixWorld(true);
            
            // Get bounding box in world space
            const objectBox = new THREE.Box3().setFromObject(mesh);
            if (!objectBox.isEmpty()) {
              box.union(objectBox);
              hasObjects = true;
            }
          }
        }
      });
      
      // If no objects found, use component positions as fallback
      if (!hasObjects || box.isEmpty()) {
        console.log('⚠️ No visible objects found, using component positions');
        components.forEach(comp => {
          const compPos = new THREE.Vector3(comp.position[0], comp.position[1], comp.position[2]);
          box.expandByPoint(compPos);
        });
        
        // If still empty, reset to default
        if (box.isEmpty()) {
          const defaultPos: [number, number, number] = viewMode === 'shopfloor' 
            ? [40, 30, 40] 
            : [15, 12, 15];
          animationStartPos.current.copy(camera.position);
          animationEndPos.current.set(...defaultPos);
          animationStartTarget.current.copy(controlsRef.current.target);
          animationEndTarget.current.set(0, 0, 0);
          animationProgress.current = 0;
          isAnimatingRef.current = true;
          return;
        }
        
        // Add padding for component positions
        box.expandByScalar(2);
      }
      
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      console.log('📦 Scene bounding box center:', center, 'size:', size);
      
      // Calculate camera position to frame the scene (CAD viewer style)
      // Position camera at an angle to show the scene nicely
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const margin = 1.2; // Reduced margin (20% instead of 50%) to prevent excessive zoom out
      
      // Calculate camera distance based on FOV to fit the scene
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const distance = (maxDim * margin) / (2 * Math.tan(fov / 2));
      
      // Clamp distance to reasonable bounds - tighter bounds to prevent zooming out too much
      const clampedDistance = Math.max(maxDim * 0.5, Math.min(distance, maxDim * 1.5, 100));
      
      // Position camera at an isometric-like angle
      const angle = Math.PI / 4; // 45 degrees
      const heightRatio = 0.6; // Slightly elevated view
      
      const newPosition = new THREE.Vector3(
        center.x + clampedDistance * Math.cos(angle),
        center.y + size.y * heightRatio + clampedDistance * 0.2,
        center.z + clampedDistance * Math.cos(angle)
      );
      
      console.log('📷 Target camera position:', newPosition);
      console.log('📷 Target center:', center);
      
      // Start smooth animation
      animationStartPos.current.copy(camera.position);
      animationEndPos.current.copy(newPosition);
      animationStartTarget.current.copy(controlsRef.current.target);
      animationEndTarget.current.copy(center);
      animationProgress.current = 0;
      isAnimatingRef.current = true;
      
      // Also set immediately for instant feedback (animation will smooth it)
      camera.lookAt(center);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    },
    zoomIn: (factor = 1.2) => {
      if (controlsRef.current && camera instanceof THREE.PerspectiveCamera) {
        // Get the zoom target (selection center or controls target)
        const zoomTargetPoint = getZoomTarget();
        
        // Calculate distance from camera to zoom target
        const distance = camera.position.distanceTo(zoomTargetPoint);
        const newDistance = distance / factor;
        
        // Calculate direction from zoom target to camera
        const direction = new THREE.Vector3()
          .subVectors(camera.position, zoomTargetPoint)
          .normalize();
        
        // Move camera towards zoom target
        camera.position.copy(zoomTargetPoint.clone().add(direction.multiplyScalar(newDistance)));
        camera.updateProjectionMatrix();
        
        // Update controls target if zooming to mouse cursor
        if (zoomTarget === 'mouse') {
          controlsRef.current.target.copy(zoomTargetPoint);
        }
        controlsRef.current.update();
      }
    },
    zoomOut: (factor = 1.2) => {
      if (controlsRef.current && camera instanceof THREE.PerspectiveCamera) {
        // Get the zoom target (selection center or controls target)
        const zoomTargetPoint = getZoomTarget();
        
        // Calculate distance from camera to zoom target
        const distance = camera.position.distanceTo(zoomTargetPoint);
        const newDistance = distance * factor;
        const clampedDistance = Math.min(newDistance, 500); // Increased max zoom out distance
        
        // Calculate direction from zoom target to camera
        const direction = new THREE.Vector3()
          .subVectors(camera.position, zoomTargetPoint)
          .normalize();
        
        // Move camera away from zoom target
        camera.position.copy(zoomTargetPoint.clone().add(direction.multiplyScalar(clampedDistance)));
        camera.updateProjectionMatrix();
        
        // Update controls target if zooming to mouse cursor
        if (zoomTarget === 'mouse') {
          controlsRef.current.target.copy(zoomTargetPoint);
        }
        controlsRef.current.update();
      }
    },
    enablePanMode: () => {
      if (controlsRef.current) {
        controlsRef.current.enablePan = true;
        controlsRef.current.enableRotate = false;
        controlsRef.current.update();
      }
    },
    disablePanMode: () => {
      if (controlsRef.current) {
        controlsRef.current.enablePan = true;
        controlsRef.current.enableRotate = true;
        controlsRef.current.update();
      }
    },
    clearSelection: () => {
      onClearSelection();
    },
    clearHighlights: () => {
      // This can be extended to clear any visual highlights
      onClearSelection();
    }
  }), [controlsRef, camera, components, viewMode, onClearSelection, getZoomTarget, zoomTarget]);

  useEffect(() => {
    onControlsReady(controls);
  }, [controls, onControlsReady]);

  return null;
}

export const Scene = ({ 
  onSelectComponent, 
  viewMode = 'focused',
  showGrid = true,
  components = [],
  groups = [],
  onAddComponent,
  onUpdateComponent,
  onLockComponents,
  onUnlockComponents,
  onFindPairedComponent,
  activeTool = 'select',
  controlsRef: externalControlsRef,
  sceneSettings
}: SceneProps) => {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mousePosition, setMousePosition] = useState<THREE.Vector2 | null>(null);
  const isZoomingRef = useRef(false);
  
  // Fixed Leg drag tracking
  const [isDraggingFixedLeg, setIsDraggingFixedLeg] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const [currentAttachPoint, setCurrentAttachPoint] = useState<AttachPoint | null>(null);
  const [draggedFixedLegData, setDraggedFixedLegData] = useState<any>(null);
  const [isDraggingComponent, setIsDraggingComponent] = useState(false);
  const [draggedComponentData, setDraggedComponentData] = useState<any>(null);
  
  // Store camera, gl, and scene references for raycasting (declare early so they can be used in useEffects)
  const cameraRef = useRef<THREE.Camera | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<any>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for drag start events to detect Fixed Leg dragging
  useEffect(() => {
    const handleComponentDragStart = (e: CustomEvent) => {
      const detail: any = e.detail || {};
      if (detail.component) {
        setIsDraggingComponent(true);
        setDraggedComponentData(detail.component);
      }
      if (detail.isFixedLeg) {
        setIsDraggingFixedLeg(true);
        setDraggedFixedLegData(detail.component);
      }
    };

    const handleDragEnd = () => {
      setIsDraggingFixedLeg(false);
      setIsDraggingComponent(false);
      setDragPosition(null);
      setCurrentAttachPoint(null);
      setDraggedFixedLegData(null);
      setDraggedComponentData(null);
    };

    // Listen to custom component drag start event (dispatched from ComponentLibrary)
    window.addEventListener('componentDragStart', handleComponentDragStart as EventListener);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      window.removeEventListener('componentDragStart', handleComponentDragStart as EventListener);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  // Update Canvas background when theme changes
  useEffect(() => {
    if (mounted && glRef.current) {
      const isDark = theme === 'dark';
      glRef.current.setClearColor(isDark ? 0x0f1115 : 0xffffff, 1);
    }
  }, [theme, mounted]);
  
  // Track mouse position for mouse cursor zoom
  useEffect(() => {
    if (sceneSettings?.zoomTarget !== 'mouse') {
      setMousePosition(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (glRef.current?.domElement) {
        const rect = glRef.current.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        setMousePosition(mouse);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Access refs directly - they're stable refs
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      
      if (!controls || !camera || !scene || !mousePosition) {
        return;
      }

      // Mark that we're zooming
      isZoomingRef.current = true;
      
      // Calculate the 3D point under the mouse cursor
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mousePosition, camera);
      
      const intersects = raycaster.intersectObjects(scene.children, true);
      let zoomTargetPoint: THREE.Vector3;
      
      if (intersects.length > 0) {
        zoomTargetPoint = intersects[0].point;
      } else {
        // Project to a plane at the current target distance
        const currentTarget = controls.target;
        const distance = camera.position.distanceTo(currentTarget);
        const direction = raycaster.ray.direction.normalize();
        zoomTargetPoint = camera.position.clone().add(direction.multiplyScalar(distance));
      }

      // Update controls target to mouse cursor position
      controls.target.copy(zoomTargetPoint);
      controls.update();
      
      // Reset zooming flag after a short delay
      setTimeout(() => {
        isZoomingRef.current = false;
      }, 100);
    };

    const canvas = glRef.current?.domElement;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('wheel', handleWheel);
      };
    }
  }, [sceneSettings?.zoomTarget, mousePosition]);
  
  // Update render quality when level of detail changes
  useEffect(() => {
    if (!mounted || !glRef.current) return;
    
    const gl = glRef.current;
    const lod = sceneSettings?.levelOfDetail || 'medium';
    
    // Update pixel ratio - increased for better quality
    let pixelRatio: number;
    switch (lod) {
      case 'high':
        pixelRatio = Math.min(window.devicePixelRatio, 3.0); // Much higher for ultra-crisp rendering
        break;
      case 'medium':
        pixelRatio = Math.min(window.devicePixelRatio, 2.0); // Increased
        break;
      case 'low':
        pixelRatio = Math.min(window.devicePixelRatio, 1.5); // Increased
        break;
      default:
        pixelRatio = Math.min(window.devicePixelRatio, 2.0);
    }
    gl.setPixelRatio(pixelRatio);
    
    // Update shadow map settings
    if (gl.shadowMap) {
      switch (lod) {
        case 'high':
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.shadowMap.autoUpdate = true;
          break;
        case 'medium':
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.shadowMap.autoUpdate = true;
          break;
        case 'low':
          gl.shadowMap.type = THREE.BasicShadowMap;
          gl.shadowMap.autoUpdate = false;
          break;
      }
    }
    
    // Force a render update
    gl.render(gl.domElement, gl.domElement);
  }, [sceneSettings?.levelOfDetail, mounted]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Reduced snap values for easier, more precise movement
  const [snap, setSnap] = useState({ translate: 0.01, rotate: Math.PI / 180, scale: 0.05 });
  
  // Map activeTool to transform mode
  const transformMode: 'translate' | 'rotate' | 'scale' = 
    activeTool === 'move' ? 'translate' :
    activeTool === 'rotate' ? 'rotate' :
    activeTool === 'scale' ? 'scale' : 'translate';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Don't prevent default or stop propagation here - let it bubble
    if (!dragOver) {
      console.log('🎯 Drag over detected, setting dragOver to true');
      setDragOver(true);
    }
    
    // Check if dragging a Fixed Leg
    // Note: getData() doesn't work during dragOver (browser security)
    // So we check if we're already dragging a Fixed Leg, or try to detect from types
    try {
      // Try to get data (may be empty during dragOver)
      const data = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      
      // If we have data, parse it
      if (data) {
        const component = JSON.parse(data);
        const componentName = (component.name || '').toLowerCase();
        const componentCategory = (component.category || '').toLowerCase();
        const isFixedLeg = [componentName, componentCategory].some((s) =>
          s.includes('leg') || s.includes('support') || s.includes('stand')
        );
        setIsDraggingComponent(true);
        setDraggedComponentData(component);
        if (isFixedLeg) {
          setIsDraggingFixedLeg(true);
          setDraggedFixedLegData(component);
        }
      }
      
      // If we're already dragging a Fixed Leg, update position
      if (isDraggingComponent || draggedComponentData || isDraggingFixedLeg || draggedFixedLegData) {
        // Calculate drag position from mouse
        if (containerRef.current && cameraRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const mouse = new THREE.Vector2();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, cameraRef.current);
          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const intersectionPoint = new THREE.Vector3();
          const distance = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
          
          if (distance !== null && distance > 0) {
            setDragPosition(intersectionPoint);
          }
        }
      }
    } catch (err) {
      // Ignore parse errors, but keep dragging state if already set
      console.log('⚠️ Error parsing drag data:', err);
    }
    
    
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [dragOver, isDraggingFixedLeg, draggedFixedLegData]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving the container
    // Check if we're leaving to a child element
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        console.log('🎯 Drag left container, setting dragOver to false');
        setDragOver(false);
        setIsDraggingFixedLeg(false);
        setDragPosition(null);
        setCurrentAttachPoint(null);
      }
    } else {
      setDragOver(false);
      setIsDraggingFixedLeg(false);
      setDragPosition(null);
      setCurrentAttachPoint(null);
    }
  }, []);

  // Camera, gl, and scene references already declared earlier
  const raycasterRef = useRef(new THREE.Raycaster());
  const [cameraState, setCameraState] = useState<{ camera: THREE.Camera | null; controls: any }>({ 
    camera: null, 
    controls: null 
  });
  

  const handleDrop = useCallback((e: React.DragEvent) => {
    
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    try {
      // Try application/json first
      let data = e.dataTransfer.getData('application/json');
      
      // Fallback to text/plain if application/json is empty
      if (!data) {
        data = e.dataTransfer.getData('text/plain');
      }
      
      if (!data) {
        return;
      }

      const component = JSON.parse(data);
      
      // Detect if this is a Fixed Leg and set drag state
      const componentName = (component.name || '').toLowerCase();
      const componentCategory = (component.category || '').toLowerCase();
      const isFixedLeg = componentName.includes('fixed') && 
                        (componentName.includes('leg') || componentCategory.includes('leg'));
      
      if (isFixedLeg) {
        setIsDraggingFixedLeg(true);
        setDraggedFixedLegData(component);
      }
      
      // Validate required fields
      if (!component.id && !component.componentId) {
        return;
      }

      // Calculate drop position using raycasting if camera is available
      if (containerRef.current && onAddComponent) {
        const rect = containerRef.current.getBoundingClientRect();
        
        // Initialize position with a default value to ensure it's always set
        let position: [number, number, number] = [0, 0, 0];
        
        // Use raycasting if camera is available
        if (cameraRef.current && glRef.current) {
          try {
            // Ensure camera projection matrix is up to date
            if (cameraRef.current instanceof THREE.PerspectiveCamera) {
              cameraRef.current.updateProjectionMatrix();
            }
            
            // Convert screen coordinates to normalized device coordinates (NDC)
            const mouse = new THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            console.log('🎯 Raycasting - mouse NDC:', mouse, 'rect:', rect);

            // Create raycaster and set from camera
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, cameraRef.current);
            
            // Method 1: Try to intersect with actual ground plane mesh in scene
            // This is more accurate than mathematical plane intersection
            const groundPlaneMesh = glRef.current?.domElement?.parentElement?.querySelector('mesh[data-ground-plane]');
            
            // Use mathematical plane as primary method (more reliable)
            // Plane at grid level (Y = 0) so components sit exactly on grid lines
            const GRID_OFFSET = 0;
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectionPoint = new THREE.Vector3();
            const distance = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
            
            if (distance !== null && distance > 0 && 
                !isNaN(intersectionPoint.x) && !isNaN(intersectionPoint.y) && !isNaN(intersectionPoint.z) &&
                isFinite(intersectionPoint.x) && isFinite(intersectionPoint.y) && isFinite(intersectionPoint.z)) {
              // Valid intersection with ground plane (on grid)
              // Always use GRID_OFFSET for Y position to ensure components spawn on grid
              position = [
                Math.round(intersectionPoint.x * 100) / 100,
                GRID_OFFSET, // Always place at GRID_OFFSET (on grid)
                Math.round(intersectionPoint.z * 100) / 100
              ];
            } else {
              // Fallback: Calculate intersection manually
              // Project ray onto plane at grid level (y = GRID_OFFSET)
              const GRID_OFFSET = 0;
              const ray = raycaster.ray;
              const rayDirY = ray.direction.y;
              
              if (Math.abs(rayDirY) > 0.0001) {
                // Ray is not parallel to ground
                const t = (GRID_OFFSET - ray.origin.y) / rayDirY;
                if (t > 0 && isFinite(t) && !isNaN(t)) {
                  const point = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
                  position = [
                    Math.round(point.x * 100) / 100,
                    GRID_OFFSET, // Always place at GRID_OFFSET (on grid)
                    Math.round(point.z * 100) / 100
                  ];
                } else {
                  // Invalid intersection, use camera forward projection
                  console.warn('⚠️ Invalid ray intersection, using camera forward projection');
                  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);
                  const GRID_OFFSET = 0;
                  const projected = cameraRef.current.position.clone().add(forward.multiplyScalar(10));
                  position = [
                    Math.round(projected.x * 100) / 100,
                    GRID_OFFSET, // Place on grid
                    Math.round(projected.z * 100) / 100
                  ];
                }
              } else {
                // Ray is parallel to ground, project forward from camera
                console.warn('⚠️ Ray parallel to ground, using camera forward projection');
                const GRID_OFFSET = 0;
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);
                const projected = cameraRef.current.position.clone().add(forward.multiplyScalar(10));
                position = [
                  Math.round(projected.x * 100) / 100,
                  GRID_OFFSET, // Place on grid
                  Math.round(projected.z * 100) / 100
                ];
              }
            }
          } catch (raycastError) {
            console.error('Error during raycasting, using fallback:', raycastError);
            // Fallback to simple calculation on any error
            const GRID_OFFSET = 0;
            const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            position = [ndcX * 10, GRID_OFFSET, -ndcY * 10];
          }
        } else {
          // Fallback to simple calculation if camera not available
          const GRID_OFFSET = 0;
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          position = [ndcX * 10, GRID_OFFSET, -ndcY * 10];
          console.log('⚠️ Using simple position (camera not ready):', position, {
            hasCamera: !!cameraRef.current,
            hasGL: !!glRef.current
          });
        }
        
        // Normalize bounding_box format if provided
        let normalizedBoundingBox = component.bounding_box || null;
        if (normalizedBoundingBox) {
          // Check if it's in the correct format {min: [x,y,z], max: [x,y,z]}
          if (normalizedBoundingBox.min && normalizedBoundingBox.max && 
              Array.isArray(normalizedBoundingBox.min) && Array.isArray(normalizedBoundingBox.max)) {
            // Format is correct, use as-is
          } else if (normalizedBoundingBox.x && normalizedBoundingBox.y && normalizedBoundingBox.z) {
            // Convert from {x: {min, max}, y: {min, max}, z: {min, max}} format
            normalizedBoundingBox = {
              min: [normalizedBoundingBox.x.min || 0, normalizedBoundingBox.y.min || 0, normalizedBoundingBox.z.min || 0],
              max: [normalizedBoundingBox.x.max || 0, normalizedBoundingBox.y.max || 0, normalizedBoundingBox.z.max || 0],
            };
          } else {
            // Invalid format, treat as missing
            normalizedBoundingBox = null;
          }
        }
        
        // If bounding_box is still missing or invalid, create a default one based on component type
        if (!normalizedBoundingBox || !normalizedBoundingBox.min || !normalizedBoundingBox.max) {
          const isConveyor = (component.category || '').toLowerCase().includes('belt') || 
                            (component.category || '').toLowerCase().includes('conveyor');
          
          if (isConveyor) {
            // Default conveyor dimensions: 1000mm length, 500mm width, 300mm height
            // For conveyors: X=width, Y=height, Z=length in world space
            // But in bounding_box: [0]=width, [1]=height, [2]=length
            const defaultLength = 1000;  // Total length (D)
            const defaultWidth = 500;    // Conveyor width (R)
            const defaultHeight = 300;   // Height
            
            normalizedBoundingBox = {
              min: [-defaultWidth / 2, 0, -defaultLength / 2],
              max: [defaultWidth / 2, defaultHeight, defaultLength / 2],
            };
          } else {
            // Default dimensions for other components
            const defaultSize = 450;
            normalizedBoundingBox = {
              min: [-defaultSize / 2, -defaultSize / 2, -defaultSize / 2],
              max: [defaultSize / 2, defaultSize / 2, defaultSize / 2],
            };
          }
        }
        
        // Special handling for specific components
        const componentName = (component.name || '').toLowerCase();
        const componentCategory = (component.category || '').toLowerCase();
        const isCM = componentName === 'cm';
        const isRod = componentName.includes('rod') || componentCategory.includes('rod');
        const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
        const isHorizontalRod = (componentName.includes('horizontal') && isRod) || (componentCategory.includes('horizontal') && isRod);
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
        const isFixedWheel = (componentName.includes('fixed') && componentName.includes('wheel')) ||
                            (componentCategory.includes('fixed') && componentCategory.includes('wheel'));
        const isFixedLeg = componentName.includes('fixed') && 
                          (componentName.includes('leg') || componentCategory.includes('leg'));
        const isBed = componentName.includes('bed') || componentCategory.includes('bed');
        
        // Debug logging
        console.log('Component placement:', {
          name: component.name,
          category: component.category,
          isRod,
          isCM,
          isWheelWithBreak,
          isBed
        });
        
        // Check if rod is being placed near a "Wheel with Break" component
        let finalPosition: [number, number, number] = position;
        let shouldAutoLock = false;
        let shouldAutoLockRod = false;
        let nearbyWheelForLock: SceneComponent | null = null;
        let shouldAutoLockFixedLeg = false;
        let nearbyBedForLock: SceneComponent | null = null;
        let adjustedY: number = position[1]; // Initialize with drop position Y
        let horizontalRodPositionSet = false; // Track if horizontal rod position was set
        
        if (isRod) {
          // Check for nearby "Wheel with Break" components
          // Find all wheels and get the closest one
          const wheels = components.filter(wheelComp => {
            const wheelName = (wheelComp.name || '').toLowerCase();
            return wheelName.includes('wheel') && wheelName.includes('break');
          });
          
          // Find the closest wheel by horizontal distance
          // If ANY wheel exists, always snap to the closest one (very aggressive snapping)
          let nearbyWheel: SceneComponent | null = null;
          let minDistance = Infinity;
          const maxSnapDistance = 10.0; // Very large snap distance (10 grid units = 1000mm) - essentially always snap if wheel exists
          
          if (wheels.length > 0) {
            // If there are any wheels, find the closest one
            wheels.forEach(wheelComp => {
              // Calculate distance in X and Z (horizontal plane only)
              const dx = position[0] - wheelComp.position[0];
              const dz = position[2] - wheelComp.position[2];
              const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
              
              if (horizontalDistance < minDistance) {
                minDistance = horizontalDistance;
                nearbyWheel = wheelComp;
              }
            });
            
            // Always snap if we found a wheel (even if far away, within reason)
            if (nearbyWheel && minDistance <= maxSnapDistance) {
              // Wheel found, will snap
            } else if (nearbyWheel && minDistance > maxSnapDistance) {
              // Too far, don't snap
              nearbyWheel = null;
            }
          }
          
          if (nearbyWheel) {
            // Snap rod EXACTLY to wheel's position (X and Z match exactly, Y is on top)
            // Use the wheel's exact position coordinates
            const wheelX = nearbyWheel.position[0];
            const wheelZ = nearbyWheel.position[2];
            
            // Special case: Vertical Rod should be placed at Y: 1.46 on Wheel
            let rodHeightGrid: number | undefined;
            
            if (isVerticalRod) {
              adjustedY = 1.46;
            } else if (isHorizontalRod) {
              // Horizontal Rod: Place in two specific positions alternately
              // Find other horizontal rods near this wheel
              const otherHorizontalRods = components.filter(rod => {
                const rodName = (rod.name || '').toLowerCase();
                const rodCategory = (rod.category || '').toLowerCase();
                const isOtherHorizontalRod = (rodName.includes('horizontal') && (rodName.includes('rod') || rodCategory.includes('rod'))) ||
                                            (rodCategory.includes('horizontal') && (rodName.includes('rod') || rodCategory.includes('rod')));
                return isOtherHorizontalRod && rod.id !== component.id; // Exclude current rod being placed
              });
              
              // Check if there's a horizontal rod already placed near this wheel
              // Look for rods within a small distance (same wheel area)
              const nearbyHorizontalRods = otherHorizontalRods.filter(rod => {
                const dx = rod.position[0] - wheelX;
                const dz = rod.position[2] - wheelZ;
                const distance = Math.sqrt(dx * dx + dz * dz);
                return distance < 2.0; // Within 2 grid units (200mm) of wheel
              });
              
              // Calculate Y position for horizontal rod on wheel first
              const wheelY = 0.10;
              const wheelHeight = 0.2;
              const wheelTopY = wheelY + wheelHeight;
              const gap = 0.05;
              
              // Horizontal rod height (in Y axis for horizontal rods)
              const rodHeightMm = normalizedBoundingBox 
                ? Math.abs((normalizedBoundingBox.max[1] || 0) - (normalizedBoundingBox.min[1] || 0))
                : 100; // Default small height
              
              rodHeightGrid = rodHeightMm / 100;
              const rodBottomOffsetMm = normalizedBoundingBox?.min?.[1] || 0;
              const rodBottomOffsetGrid = rodBottomOffsetMm / 100;
              
              adjustedY = wheelTopY + gap + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              
              // Ensure rod's bottom never goes below grid level
              const GRID_LEVEL = 0;
              const rodBottomY = adjustedY - (rodHeightGrid / 2) + rodBottomOffsetGrid;
              if (rodBottomY < GRID_LEVEL) {
                adjustedY = GRID_LEVEL + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              }
              
              // Also ensure rod is always above the wheel
              adjustedY = Math.max(adjustedY, wheelTopY + gap);
              
              // Define two positions for horizontal rods
              // Position 1: Slightly offset in one direction
              // Position 2: Slightly offset in opposite direction
              const POSITION_OFFSET = 1.0; // 1 grid unit = 100mm offset
              
              if (nearbyHorizontalRods.length === 0) {
                // First horizontal rod: place in position 1 (offset in +X direction)
                finalPosition = [
                  wheelX + POSITION_OFFSET,
                  adjustedY,
                  wheelZ
                ];
              } else {
                // Second horizontal rod: place in position 2 (offset in -X direction)
                finalPosition = [
                  wheelX - POSITION_OFFSET,
                  adjustedY,
                  wheelZ
                ];
              }
              
              horizontalRodPositionSet = true;
            } else {
              // Calculate rod dimensions from bounding box
              const rodHeightMm = normalizedBoundingBox 
                ? Math.abs((normalizedBoundingBox.max[1] || 0) - (normalizedBoundingBox.min[1] || 0))
                : 1300; // Default rod height in mm (1.3 grid units)
              
              rodHeightGrid = rodHeightMm / 100; // Convert mm to grid units
              const rodBottomOffsetMm = normalizedBoundingBox?.min?.[1] || 0;
              const rodBottomOffsetGrid = rodBottomOffsetMm / 100; // Convert mm to grid units
              
              // Place rod on top of wheel
              // Wheel is at Y: 0.10, wheel height is approximately 0.2 grid units
              const wheelY = 0.10;
              const wheelHeight = 0.2; // Approximate wheel height in grid units
              const wheelTopY = wheelY + wheelHeight;
              const gap = 0.05; // Small gap between wheel and rod
              
              // Calculate where the rod's bottom should be (in world space)
              // Rod bottom in world space = rod center Y - (rod height / 2) + rod bottom offset
              // We want: rod bottom in world space = wheel top + gap
              // So: rod center Y - (rod height / 2) + rod bottom offset = wheel top + gap
              // Therefore: rod center Y = wheel top + gap + (rod height / 2) - rod bottom offset
              adjustedY = wheelTopY + gap + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              
              // Calculate the rod's actual bottom position in world space
              // Rod bottom = rod center Y - (rod height / 2) + rod bottom offset
              const rodBottomY = adjustedY - (rodHeightGrid / 2) + rodBottomOffsetGrid;
              
              // Ensure rod's bottom never goes below grid level (Y=0)
              const GRID_LEVEL = 0;
              if (rodBottomY < GRID_LEVEL) {
                // Adjust rod center Y so bottom is at grid level
                adjustedY = GRID_LEVEL + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              }
              
              // Also ensure rod is always above the wheel
              adjustedY = Math.max(adjustedY, wheelTopY + gap);
            }
            
            // For horizontal rods, finalPosition is already set with the alternate positioning
            // For vertical rods and other rods, snap X and Z EXACTLY to wheel's position
            if (!horizontalRodPositionSet) {
            finalPosition = [
              wheelX,  // Exact X position
              adjustedY,
              wheelZ   // Exact Z position
            ];
            }
            // For horizontal rods, finalPosition was already set in the else if block above
            
            shouldAutoLock = true;
            shouldAutoLockRod = true;
            nearbyWheelForLock = nearbyWheel;
            console.log('🔗 Rod snapped to Wheel with Break:', {
              wheelId: nearbyWheel.id,
              wheelPos: nearbyWheel.position,
              rodPos: finalPosition,
              rodHeightGrid: rodHeightGrid,
              adjustedY,
              distance: minDistance,
              autoLock: shouldAutoLock,
              isVerticalRod,
              isHorizontalRod
            });
          } else {
            // No nearby wheel, use default rod position
            // Calculate rod dimensions to ensure it doesn't go below grid
            const rodHeightMm = normalizedBoundingBox 
              ? Math.abs((normalizedBoundingBox.max[1] || 0) - (normalizedBoundingBox.min[1] || 0))
              : (isHorizontalRod ? 100 : 1300); // Default: 100mm for horizontal rods, 1300mm for vertical rods
            
            const rodHeightGrid = rodHeightMm / 100; // Convert mm to grid units
            const rodBottomOffsetMm = normalizedBoundingBox?.min?.[1] || 0;
            const rodBottomOffsetGrid = rodBottomOffsetMm / 100; // Convert mm to grid units
            
            // For horizontal rods without a wheel, place them on the grid (at ground level)
            // For vertical rods, use a default height
            if (isHorizontalRod) {
              // Place horizontal rod on the grid (Y = 0 + half rod height)
              const GRID_LEVEL = 0;
              adjustedY = GRID_LEVEL + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              // Ensure it's at least slightly above ground
              adjustedY = Math.max(adjustedY, 0.1);
            } else {
              // Default Y position for vertical rods
            adjustedY = 1.40;
            
            // Calculate the rod's actual bottom position in world space
            const rodBottomY = adjustedY - (rodHeightGrid / 2) + rodBottomOffsetGrid;
            
            // Ensure rod's bottom never goes below grid level (Y=0)
            const GRID_LEVEL = 0;
            if (rodBottomY < GRID_LEVEL) {
              // Adjust rod center Y so bottom is at grid level
              adjustedY = GRID_LEVEL + (rodHeightGrid / 2) - rodBottomOffsetGrid;
              }
            }
            
            finalPosition = [position[0], adjustedY, position[2]];
            console.log('Placing rod at Y:', adjustedY, '(no nearby wheel found)', {
              wheelsFound: wheels.length,
              dropPosition: position,
              rodHeightGrid,
              rodBottomOffsetGrid,
              isHorizontalRod
            });
          }
        } else {
          if (isCM) {
            // CM component should be placed at Y: 1.00
            adjustedY = 1.00;
            finalPosition = [
              position[0], // Use drop X position
              adjustedY, // CM at Y: 1.00
              position[2] // Use drop Z position
            ];
          } else if (isFixedWheel) {
            // Fixed Wheel component should be placed at Y: 0.05
            adjustedY = 0.05;
            finalPosition = [
              position[0], // Use drop X position
              adjustedY, // Fixed Wheel at Y: 0.05
              position[2] // Use drop Z position
            ];
            console.log('Placing Fixed Wheel at Y: 0.05', {
              componentName,
              componentCategory,
              isFixedWheel,
              finalPosition
            });
          } else if (isWheelWithBreak) {
            // Wheel with Break component should be placed at Y: 0.10
            adjustedY = 0.10;
            finalPosition = [
              position[0], // Use drop X position
              adjustedY, // Wheel with Break at Y: 0.10
              position[2] // Use drop Z position
            ];
            console.log('Placing Wheel with Break at Y: 0.10');
          } else if (isFixedLeg) {
            // Fixed Legs component should be placed at Y: 0.75
            adjustedY = 0.75;
            
            // Use attach point if available (from drag highlighting)
            if (currentAttachPoint) {
              finalPosition = currentAttachPoint.position;
              shouldAutoLockFixedLeg = true;
              nearbyBedForLock = currentAttachPoint.frame;
              console.log('🔗 Fixed Leg snapped to attach point:', {
                attachPoint: currentAttachPoint.position,
                frameId: currentAttachPoint.frameId,
                frameName: currentAttachPoint.frame.name
              });
            } else {
              // Fallback: Check for nearby "Bed" components to attach to
              const beds = components.filter(bedComp => {
                const bedName = (bedComp.name || '').toLowerCase();
                const bedCategory = (bedComp.category || '').toLowerCase();
                return bedName.includes('bed') || bedCategory.includes('bed');
              });
              
              // Find the closest Bed by horizontal distance
              let nearbyBed: SceneComponent | null = null;
              let minDistance = Infinity;
              const maxSnapDistance = 20.0; // Large snap distance (20 grid units = 2000mm)
              
              if (beds.length > 0) {
                beds.forEach(bedComp => {
                  const dx = position[0] - bedComp.position[0];
                  const dz = position[2] - bedComp.position[2];
                  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
                  
                  if (horizontalDistance < minDistance) {
                    minDistance = horizontalDistance;
                    nearbyBed = bedComp;
                  }
                });
                
                // Snap if Bed is within reasonable distance
                if (nearbyBed && minDistance <= maxSnapDistance) {
                // Get Bed dimensions and calculate marked attachment points (at the ends/sides)
                const bedLengthMm = nearbyBed.bounding_box 
                  ? Math.abs((nearbyBed.bounding_box.max[0] || 0) - (nearbyBed.bounding_box.min[0] || 0))
                  : 0;
                const bedWidthMm = nearbyBed.bounding_box 
                  ? Math.abs((nearbyBed.bounding_box.max[2] || 0) - (nearbyBed.bounding_box.min[2] || 0))
                  : 0;
                
                const bedLengthGrid = bedLengthMm / 100;
                const bedWidthGrid = bedWidthMm / 100;
                
                const bedX = nearbyBed.position[0];
                const bedZ = nearbyBed.position[2];
                
                // Determine which axis is the length (longer dimension)
                const isBedLongerInX = bedLengthGrid > bedWidthGrid;
                
                // Safety check: if bed dimensions are invalid, use default placement
                if (bedLengthGrid <= 0 || bedWidthGrid <= 0 || !isFinite(bedLengthGrid) || !isFinite(bedWidthGrid)) {
                  finalPosition = [
                    position[0],
                    adjustedY,
                    position[2]
                  ];
                  console.log('⚠️ Invalid bed dimensions, using default placement');
                } else {
                  // Calculate bed edges (used for placement calculations)
                  const LEG_OFFSET_MM = 10.0; // 10mm offset towards center
                  const LEG_OFFSET_GRID = LEG_OFFSET_MM / 100;
                  
                  const bedLeftEdge = bedX - (bedLengthGrid / 2);
                  const bedRightEdge = bedX + (bedLengthGrid / 2);
                  const bedFrontEdge = bedZ - (bedWidthGrid / 2);
                  const bedBackEdge = bedZ + (bedWidthGrid / 2);
                
                // Find other Fixed Legs linked to this Bed
                const otherLegs = components.filter(leg => {
                  const legName = (leg.name || '').toLowerCase();
                  const legCategory = (leg.category || '').toLowerCase();
                  return legName.includes('fixed') && 
                         (legName.includes('leg') || legCategory.includes('leg'));
                });
                
                  // Determine which SIDE of the bed the drop position is on
                  let targetEndIndex = 0;
                  let legX: number = bedX; // Initialize with bed center as fallback
                  let legZ: number = bedZ; // Initialize with bed center as fallback
                  
                  if (isBedLongerInX) {
                    // Bed extends in X direction
                    if (position[0] < bedX) {
                      targetEndIndex = 0; // Left side
                    } else {
                      targetEndIndex = 1; // Right side
                    }
                    
                    // Use a fixed small offset from bed edge (consistent placement)
                    // This ensures legs are always placed close to the bed edges at marked points
                    const FIXED_OFFSET_FROM_EDGE_MM = 10.0; // 10mm from edge
                    const FIXED_OFFSET_GRID = FIXED_OFFSET_FROM_EDGE_MM / 100;
                    
                    // Place leg at fixed distance from the target edge
                    if (targetEndIndex === 0) {
                      // Left side - place at left edge + offset
                      legX = bedLeftEdge + FIXED_OFFSET_GRID;
                    } else {
                      // Right side - place at right edge - offset
                      legX = bedRightEdge - FIXED_OFFSET_GRID;
                    }
                    
                    // Check if there are legs at the same side for side-by-side placement
                    const legsAtSameSide = otherLegs.filter(leg => {
                      const legOnLeft = leg.position[0] < bedX;
                      return (targetEndIndex === 0 && legOnLeft) || (targetEndIndex === 1 && !legOnLeft);
                    });
                    
                    // Check if there are legs on the opposite side (to use as reference for both X and Z)
                    const legsAtOppositeSide = otherLegs.filter(leg => {
                      const legOnLeft = leg.position[0] < bedX;
                      return (targetEndIndex === 0 && !legOnLeft) || (targetEndIndex === 1 && legOnLeft);
                    });
                    
                    // If there are opposite side legs, place 1.89 units away from their Z position
                    if (legsAtOppositeSide.length > 0) {
                      // Find the closest opposite leg and add 1.89 to its Z position
                      let closestLeg = legsAtOppositeSide[0];
                      let minDistance = Math.abs(position[2] - closestLeg.position[2]);
                      legsAtOppositeSide.forEach(leg => {
                        const distance = Math.abs(position[2] - leg.position[2]);
                        if (distance < minDistance) {
                          minDistance = distance;
                          closestLeg = leg;
                        }
                      });
                      legZ = closestLeg.position[2] + 1.89;
                    } else if (otherLegs.length > 0) {
                      // If there are other legs on same side, only align Z if very close (within 0.2 units)
                      let closest = otherLegs[0];
                      let best = Math.abs(position[2] - closest.position[2]);
                      otherLegs.forEach(leg => {
                        const d = Math.abs(position[2] - leg.position[2]);
                        if (d < best) { best = d; closest = leg; }
                      });
                      // Only snap if very close to existing leg, otherwise allow free placement
                      const SNAP_THRESHOLD = 0.2; // Only snap if within 0.2 units
                      if (best < SNAP_THRESHOLD) {
                        legZ = closest.position[2];
                      } else {
                        // Allow free placement - use drop Z position or bed center
                        legZ = position[2] !== undefined ? position[2] : bedZ;
                      }
                    } else if (legsAtSameSide.length > 0) {
                      // Place side by side in Z direction (only if no other legs exist)
                      const LEG_SPACING_MM = 50.0;
                      const LEG_SPACING_GRID = LEG_SPACING_MM / 100;
                      let maxZ = -Infinity;
                      let minZ = Infinity;
                      legsAtSameSide.forEach(leg => {
                        if (leg.position[2] > maxZ) maxZ = leg.position[2];
                        if (leg.position[2] < minZ) minZ = leg.position[2];
                      });
                      
                      const legWidthGrid = normalizedBoundingBox 
                        ? Math.abs((normalizedBoundingBox.max[2] || 0) - (normalizedBoundingBox.min[2] || 0)) / 100
                        : 0.5;
                      
                      const spaceAbove = Math.abs(bedZ - maxZ);
                      const spaceBelow = Math.abs(bedZ - minZ);
                      
                      if (spaceAbove > spaceBelow) {
                        legZ = maxZ + LEG_SPACING_GRID + (legWidthGrid / 2);
                      } else {
                        legZ = minZ - LEG_SPACING_GRID - (legWidthGrid / 2);
                      }
                    } else {
                      // No legs at all - use bed center Z
                      legZ = bedZ;
                    }
                  } else {
                    // Bed extends in Z direction
                    if (position[2] < bedZ) {
                      targetEndIndex = 0; // Front side
                    } else {
                      targetEndIndex = 1; // Back side
                    }
                    
                    // Use a fixed small offset from bed edge (consistent placement)
                    // This ensures legs are always placed close to the bed edges at marked points
                    const FIXED_OFFSET_FROM_EDGE_MM = 10.0; // 10mm from edge
                    const FIXED_OFFSET_GRID = FIXED_OFFSET_FROM_EDGE_MM / 100;
                    
                    // Place leg at fixed distance from the target edge
                    if (targetEndIndex === 0) {
                      // Front side - place at front edge + offset
                      legZ = bedFrontEdge + FIXED_OFFSET_GRID;
                    } else {
                      // Back side - place at back edge - offset
                      legZ = bedBackEdge - FIXED_OFFSET_GRID;
                    }
                    
                    // Check if there are legs at the same side for side-by-side placement
                    const legsAtSameSide = otherLegs.filter(leg => {
                      const legOnFront = leg.position[2] < bedZ;
                      return (targetEndIndex === 0 && legOnFront) || (targetEndIndex === 1 && !legOnFront);
                    });
                    
                    // Check if there are legs on the opposite side (to use as reference for both X and Z)
                    const legsAtOppositeSide = otherLegs.filter(leg => {
                      const legOnFront = leg.position[2] < bedZ;
                      return (targetEndIndex === 0 && !legOnFront) || (targetEndIndex === 1 && legOnFront);
                    });
                    
                    // Only align X to nearest existing leg if very close (within 0.2 units)
                    if (otherLegs.length > 0) {
                      let closest = otherLegs[0];
                      let best = Math.abs(position[0] - closest.position[0]);
                      otherLegs.forEach(leg => {
                        const d = Math.abs(position[0] - leg.position[0]);
                        if (d < best) { best = d; closest = leg; }
                      });
                      // Only snap if very close to existing leg, otherwise allow free placement
                      const SNAP_THRESHOLD = 0.2; // Only snap if within 0.2 units
                      if (best < SNAP_THRESHOLD) {
                        legX = closest.position[0];
                      } else {
                        // Allow free placement - use drop X position or bed center
                        legX = position[0] !== undefined ? position[0] : bedX;
                      }
                    } else if (legsAtSameSide.length > 0) {
                      // Place side by side in X direction (only if no other legs exist)
                      const LEG_SPACING_MM = 50.0;
                      const LEG_SPACING_GRID = LEG_SPACING_MM / 100;
                      let maxX = -Infinity;
                      let minX = Infinity;
                      legsAtSameSide.forEach(leg => {
                        if (leg.position[0] > maxX) maxX = leg.position[0];
                        if (leg.position[0] < minX) minX = leg.position[0];
                      });
                      
                      const legLengthGrid = normalizedBoundingBox 
                        ? Math.abs((normalizedBoundingBox.max[0] || 0) - (normalizedBoundingBox.min[0] || 0)) / 100
                        : 0.5;
                      
                      const spaceRight = Math.abs(bedX - maxX);
                      const spaceLeft = Math.abs(bedX - minX);
                      
                      if (spaceRight > spaceLeft) {
                        legX = maxX + LEG_SPACING_GRID + (legLengthGrid / 2);
                      } else {
                        legX = minX - LEG_SPACING_GRID - (legLengthGrid / 2);
                      }
                    } else {
                      // No legs at all - use bed center X
                      legX = bedX;
                    }
                }
                
                finalPosition = [legX, adjustedY, legZ];
                shouldAutoLockFixedLeg = true;
                nearbyBedForLock = nearbyBed;
                
                console.log('🔗 Fixed Legs snapped to Bed:', {
                  bedId: nearbyBed.id,
                  bedPos: nearbyBed.position,
                    bedCenter: [bedX, bedZ],
                    dropPos: position,
                    targetEndIndex,
                  legPos: finalPosition,
                  distance: minDistance,
                  autoLock: shouldAutoLockFixedLeg,
                    otherLegsCount: otherLegs.length,
                    isBedLongerInX
                });
                }
              } else {
                // No nearby Bed, use default placement
                finalPosition = [
                  position[0], // Use drop X position
                  adjustedY, // Fixed Legs at Y: 0.75
                  position[2] // Use drop Z position
                ];
                console.log('Placing Fixed Legs at Y: 0.75 (no nearby Bed found)', {
                  bedsFound: beds.length,
                  minDistance
                });
              }
            } else {
              // No Bed found, use default placement
              finalPosition = [
                position[0], // Use drop X position
                adjustedY, // Fixed Legs at Y: 0.75
                position[2] // Use drop Z position
              ];
              console.log('Placing Fixed Legs at Y: 0.75 (no Bed found)');
            }
          }
        } else if (isBed) {
            // Check for nearby "Fixed Legs" components
            // Find all Fixed Legs and get the closest one
            const fixedLegs = components.filter(legComp => {
              const legName = (legComp.name || '').toLowerCase();
              const legCategory = (legComp.category || '').toLowerCase();
              return legName.includes('fixed') && 
                     (legName.includes('leg') || legCategory.includes('leg'));
            });
            
            // Find the closest Fixed Legs by horizontal distance
            // If ANY Fixed Legs exists, always snap to the closest one (very aggressive snapping, like rods to wheels)
            let nearbyFixedLeg: SceneComponent | null = null;
            let minDistance = Infinity;
            // Always snap if Fixed Legs exists, regardless of distance (like rods to wheels)
            
            if (fixedLegs.length > 0) {
              // If there are any Fixed Legs, find the closest one
              fixedLegs.forEach(legComp => {
                // Calculate distance in X and Z (horizontal plane only)
                const dx = position[0] - legComp.position[0];
                const dz = position[2] - legComp.position[2];
                const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
                
                if (horizontalDistance < minDistance) {
                  minDistance = horizontalDistance;
                  nearbyFixedLeg = legComp;
                }
              });
              
              // Always snap if we found a Fixed Legs (like rods snapping to wheels - very aggressive)
              if (nearbyFixedLeg) {
                console.log('🔗 Bed found Fixed Legs to snap to:', {
                  legId: nearbyFixedLeg.id,
                  distance: minDistance,
                  legPos: nearbyFixedLeg.position,
                  dropPos: position,
                  fixedLegsCount: fixedLegs.length
                });
              }
            } else {
              console.log('⚠️ No Fixed Legs found for Bed to snap to');
            }
            
            if (nearbyFixedLeg) {
              // L+55 fixed for DPS50 means 27.5 on each side after legs
              // Bed should extend 27.5mm beyond Fixed Legs on each side
              const OFFSET_AFTER_LEGS_MM = 27.5; // 27.5mm on each side (total L+55)
              const OFFSET_AFTER_LEGS_GRID = OFFSET_AFTER_LEGS_MM / 100; // Convert to grid units
              
              // Bed always spawns at Y: 1.00
              adjustedY = 1.00;
              
              // Check if there are 2 Fixed Legs to position Bed between them
              // Find Fixed Legs dimensions to determine which axis is the length
              const legLengthMm = nearbyFixedLeg.bounding_box 
                ? Math.abs((nearbyFixedLeg.bounding_box.max[0] || 0) - (nearbyFixedLeg.bounding_box.min[0] || 0))
                : 0;
              const legWidthMm = nearbyFixedLeg.bounding_box 
                ? Math.abs((nearbyFixedLeg.bounding_box.max[2] || 0) - (nearbyFixedLeg.bounding_box.min[2] || 0))
                : 0;
              
              const legLengthGrid = legLengthMm / 100; // Convert mm to grid units
              const legWidthGrid = legWidthMm / 100; // Convert mm to grid units
              
              // Determine which axis is the length (longer dimension)
              const isLongerInX = legLengthGrid > legWidthGrid;
              
              // Find if there's a second Fixed Leg
              let secondFixedLeg: SceneComponent | null = null;
              if (fixedLegs.length > 1) {
                // Find the second closest Fixed Leg (different from the first one)
                const sortedLegs = fixedLegs
                  .filter(leg => leg.id !== nearbyFixedLeg!.id)
                  .map(leg => {
                    const dx = position[0] - leg.position[0];
                    const dz = position[2] - leg.position[2];
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    return { leg, dist };
                  })
                  .sort((a, b) => a.dist - b.dist);
                
                if (sortedLegs.length > 0) {
                  secondFixedLeg = sortedLegs[0].leg;
                }
              }
              
              let bedX: number;
              let bedZ: number;
              
              if (secondFixedLeg) {
                // Two Fixed Legs: Position Bed between them with 27.5mm offset on each side
                const leg1X = nearbyFixedLeg.position[0];
                const leg1Z = nearbyFixedLeg.position[2];
                const leg2X = secondFixedLeg.position[0];
                const leg2Z = secondFixedLeg.position[2];
                
                // Get leg dimensions
                const leg1WidthMm = nearbyFixedLeg.bounding_box 
                  ? Math.abs((nearbyFixedLeg.bounding_box.max[2] || 0) - (nearbyFixedLeg.bounding_box.min[2] || 0))
                  : 100;
                const leg1LengthMm = nearbyFixedLeg.bounding_box 
                  ? Math.abs((nearbyFixedLeg.bounding_box.max[0] || 0) - (nearbyFixedLeg.bounding_box.min[0] || 0))
                  : 100;
                const leg2WidthMm = secondFixedLeg.bounding_box 
                  ? Math.abs((secondFixedLeg.bounding_box.max[2] || 0) - (secondFixedLeg.bounding_box.min[2] || 0))
                  : 100;
                const leg2LengthMm = secondFixedLeg.bounding_box 
                  ? Math.abs((secondFixedLeg.bounding_box.max[0] || 0) - (secondFixedLeg.bounding_box.min[0] || 0))
                  : 100;
                
                const leg1WidthGrid = leg1WidthMm / 100;
                const leg1LengthGrid = leg1LengthMm / 100;
                const leg2WidthGrid = leg2WidthMm / 100;
                const leg2LengthGrid = leg2LengthMm / 100;
                
                // Determine alignment direction (which axis has more separation)
                const dx = Math.abs(leg1X - leg2X);
                const dz = Math.abs(leg1Z - leg2Z);
                
                if (dx > dz) {
                  // Legs are aligned in X direction, Bed extends in X
                  // Find the leftmost and rightmost leg center positions
                  const leftLegX = Math.min(leg1X, leg2X);
                  const rightLegX = Math.max(leg1X, leg2X);
                  
                  // Calculate the OUTER edges of both legs (the edges farthest from each other)
                  // Left leg's left edge (outermost left edge)
                  const leftLegLeftEdge = leftLegX - (leftLegX === leg1X ? leg1LengthGrid / 2 : leg2LengthGrid / 2);
                  // Right leg's right edge (outermost right edge)
                  const rightLegRightEdge = rightLegX + (rightLegX === leg1X ? leg1LengthGrid / 2 : leg2LengthGrid / 2);
                  
                  // Bed should extend 27.5mm beyond the outer edges on each side
                  // Bed left edge = left leg left edge - 27.5mm
                  // Bed right edge = right leg right edge + 27.5mm
                  const bedLeftEdge = leftLegLeftEdge - OFFSET_AFTER_LEGS_GRID;
                  const bedRightEdge = rightLegRightEdge + OFFSET_AFTER_LEGS_GRID;
                  bedX = (bedLeftEdge + bedRightEdge) / 2;
                  bedZ = (leg1Z + leg2Z) / 2; // Average Z position
                } else {
                  // Legs are aligned in Z direction, Bed extends in Z
                  const frontLegZ = Math.min(leg1Z, leg2Z);
                  const backLegZ = Math.max(leg1Z, leg2Z);
                  
                  // Calculate the OUTER edges of both legs
                  // Front leg's front edge (outermost front edge)
                  const frontLegFrontEdge = frontLegZ - (frontLegZ === leg1Z ? leg1WidthGrid / 2 : leg2WidthGrid / 2);
                  // Back leg's back edge (outermost back edge)
                  const backLegBackEdge = backLegZ + (backLegZ === leg1Z ? leg1WidthGrid / 2 : leg2WidthGrid / 2);
                  
                  // Bed should extend 27.5mm beyond the outer edges on each side
                  const bedFrontEdge = frontLegFrontEdge - OFFSET_AFTER_LEGS_GRID;
                  const bedBackEdge = backLegBackEdge + OFFSET_AFTER_LEGS_GRID;
                  bedX = (leg1X + leg2X) / 2; // Average X position
                  bedZ = (bedFrontEdge + bedBackEdge) / 2;
                }
              } else {
                // Single Fixed Leg: Position Bed so it extends 27.5mm on EACH side
                // Get Fixed Leg position
                const legX = nearbyFixedLeg.position[0];
                const legZ = nearbyFixedLeg.position[2];
                
                // Calculate Fixed Leg edges to position Bed with exact 27.5mm offset
                const legLeftEdge = legX - (legLengthGrid / 2);
                const legRightEdge = legX + (legLengthGrid / 2);
                const legFrontEdge = legZ - (legWidthGrid / 2);
                const legBackEdge = legZ + (legWidthGrid / 2);
                
                // Get Bed dimensions
                const bedLengthMm = normalizedBoundingBox 
                  ? Math.abs((normalizedBoundingBox.max[0] || 0) - (normalizedBoundingBox.min[0] || 0))
                  : 1000;
                const bedWidthMm = normalizedBoundingBox 
                  ? Math.abs((normalizedBoundingBox.max[2] || 0) - (normalizedBoundingBox.min[2] || 0))
                  : 500;
                
                const bedLengthGrid = bedLengthMm / 100;
                const bedWidthGrid = bedWidthMm / 100;
                
                // Determine which axis Bed extends in (longer dimension)
                const isBedLongerInX = bedLengthGrid > bedWidthGrid;
                
                if (isBedLongerInX) {
                  // Bed extends in X direction
                  // Bed left edge = leg left edge - 27.5mm
                  // Bed right edge = leg right edge + 27.5mm
                  // Bed center = (Bed left edge + Bed right edge) / 2
                  const bedLeftEdge = legLeftEdge - OFFSET_AFTER_LEGS_GRID;
                  const bedRightEdge = legRightEdge + OFFSET_AFTER_LEGS_GRID;
                  bedX = (bedLeftEdge + bedRightEdge) / 2;
                  bedZ = legZ; // Same Z as leg
                } else {
                  // Bed extends in Z direction
                  // Bed front edge = leg front edge - 27.5mm
                  // Bed back edge = leg back edge + 27.5mm
                  const bedFrontEdge = legFrontEdge - OFFSET_AFTER_LEGS_GRID;
                  const bedBackEdge = legBackEdge + OFFSET_AFTER_LEGS_GRID;
                  bedX = legX; // Same X as leg
                  bedZ = (bedFrontEdge + bedBackEdge) / 2;
                }
              }
              
              finalPosition = [
                bedX,
                adjustedY,
                bedZ
              ];
              
              console.log('🔗 Bed snapped to Fixed Legs:', {
                legId: nearbyFixedLeg.id,
                legPos: nearbyFixedLeg.position,
                bedPos: finalPosition,
                adjustedY,
                distance: minDistance,
                offsetAfterLegs: OFFSET_AFTER_LEGS_GRID
              });
            } else {
              // No nearby Fixed Legs, use default placement at Y: 1.00
              adjustedY = 1.00;
              
              finalPosition = [
                position[0], // Use drop X position
                adjustedY, // Bed at Y: 1.00
                position[2] // Use drop Z position
              ];
              
              console.log('Placing Bed at Y: 1.00 (no nearby Fixed Legs found)', {
                fixedLegsFound: fixedLegs.length,
                dropPosition: position
              });
            }
          } else {
            // Adjust Y position so the component's bottom sits at Y=0 (grid level)
            // Use drop X and Z positions, but always snap Y to grid based on bounding box
            // Bounding box values are in mm, scene positions are in grid units (1 grid unit = 100mm)
            // Formula: adjustedY = 0 - (boundingBox.min[1] / 100)
            // This ensures the component's bottom (at min[1] relative to origin) sits at Y=0
            const GRID_OFFSET = 0; // Always snap to grid level
            const GRID_UNIT_SIZE_MM = 100; // 1 grid unit = 100mm
            const bottomOffsetMm = normalizedBoundingBox.min[1] || 0;
            const bottomOffsetGridUnits = bottomOffsetMm / GRID_UNIT_SIZE_MM;
            adjustedY = GRID_OFFSET - bottomOffsetGridUnits;
            
            finalPosition = [
              position[0], // Use drop X position
              adjustedY, // Auto-adjust Y: Rod at 1.40, CM at 1.00, others at grid level (Y=0)
              position[2] // Use drop Z position
            ];
          }
        }
        
        // Special rotation handling for belt, rod, Wheel with Break, and Fixed Legs components
        // isRod, isWheelWithBreak, isFixedWheel, and isFixedLeg are already declared above, reuse them
        const isBelt = (component.name || '').toLowerCase().includes('belt') || 
                      (component.category || '').toLowerCase().includes('belt');
        // isFixedWheel is already declared above, reuse it
        
        let initialRotation: [number, number, number] = [0, 0, 0];
        if (isBelt || (isRod && !isHorizontalRod)) {
          // Rotate 90 degrees around X axis (for belts and non-horizontal rods)
          initialRotation = [Math.PI / 2, 0, 0] as [number, number, number];
        } else if (isHorizontalRod) {
          // Horizontal rod: no rotation (spawns horizontally)
          initialRotation = [0, 0, 0] as [number, number, number];
        } else if (isFixedWheel) {
          // Fixed Wheel: rotate -90 degrees around X axis
          initialRotation = [-Math.PI / 2, 0, 0] as [number, number, number];
        } else if (isWheelWithBreak) {
          // Wheel with Break: rotate -90 degrees around X axis
          initialRotation = [-Math.PI / 2, 0, 0] as [number, number, number];
        } else if (isFixedLeg) {
          // Fixed Legs: rotate -180 degrees around X axis and -3 degrees around Z axis
          initialRotation = [-180 * Math.PI / 180, 0, -3 * Math.PI / 180] as [number, number, number];
        }
        
        const componentToAdd = {
          componentId: component.id || component.componentId,
          name: component.name || 'Unnamed Component',
          category: component.category || 'unknown',
          glb_url: component.glb_url || null,
          original_url: component.original_url || null,
          bounding_box: normalizedBoundingBox,
          center: component.center || [0, 0, 0],
          position: finalPosition,
          rotation: initialRotation,
          // Auto-link rod to wheel if placed on top
          ...(shouldAutoLockRod && nearbyWheelForLock ? {
            linkedTo: nearbyWheelForLock.id,
            isLocked: true
          } : {}),
          // Auto-link Fixed Legs to Bed if placed nearby
          ...(shouldAutoLockFixedLeg && nearbyBedForLock ? {
            linkedTo: nearbyBedForLock.id,
            isLocked: true
          } : {})
        };
        
        
        if (onAddComponent) {
          onAddComponent(componentToAdd);
          
          // If auto-locking rod to wheel, update the wheel component to link back
          // This will be handled after the rod component is added in Builder.tsx
          if (shouldAutoLockRod && nearbyWheelForLock && onUpdateComponent) {
            // Use setTimeout to ensure the rod is added to the components array first
            setTimeout(() => {
              // Update the wheel to link back to the rod
              // The rod's ID will be generated in Builder.tsx, so we need to find it by position
              // For now, we'll update the wheel immediately - the linking will be completed
              // when the rod component is actually added to the scene
              console.log('🔗 Auto-locking: Wheel will be updated after rod is added');
            }, 200);
          }
          
          // Reset Fixed Leg drag state
          setIsDraggingFixedLeg(false);
          setDragPosition(null);
          setCurrentAttachPoint(null);
          setDraggedFixedLegData(null);
        }
      } else {
        console.error('❌ Container ref or onAddComponent not available', {
          hasContainerRef: !!containerRef.current,
          hasOnAddComponent: !!onAddComponent
        });
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  }, [onAddComponent, components]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelectComponent(id);
  };

  const handleClearSelection = useCallback(() => {
    setSelectedId(null);
    onSelectComponent('');
  }, [onSelectComponent]);

  const cameraPosition: [number, number, number] = viewMode === 'shopfloor' 
    ? [40, 30, 40] 
    : [15, 12, 15];
    
  // controlsRef already declared earlier
  const internalControlsRef = useRef<SceneControls | null>(null);

  // Expose controls to parent via ref
  useEffect(() => {
    if (externalControlsRef && internalControlsRef.current) {
      externalControlsRef.current = internalControlsRef.current;
    }
  }, [externalControlsRef, internalControlsRef.current]);

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full bg-background rounded-lg overflow-hidden border border-border transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''} ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onDragOver={(e) => {
        e.preventDefault(); // Required to allow drop
        handleDragOver(e);
      }}
      onDragLeave={(e) => {
        handleDragLeave(e);
      }}
      onDrop={(e) => {
        console.log('🎯 Container div onDrop handler called');
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Calling handleDrop...');
        handleDrop(e);
      }}
      style={{ position: 'relative' }}
    >
      {/* FPS Counter - 2D overlay in top-right corner */}
      {sceneSettings?.fpsCounter === true && (
        <FPSCounter enabled={sceneSettings.fpsCounter} />
      )}
      
      {/* Selected Component Coordinates - 2D overlay in left-bottom corner */}
      {selectedId && (() => {
        const selectedComp = components.find(c => c.id === selectedId);
        if (!selectedComp) return null;
        return (
          <div className="absolute bottom-2 left-2 bg-black/80 text-white px-3 py-2 rounded text-xs font-mono z-50 pointer-events-none">
            <div className="font-semibold mb-1 text-primary">{selectedComp.name || 'Component'}</div>
            <div className="space-y-0.5">
              <div>Position: X: {selectedComp.position[0].toFixed(2)}, Y: {selectedComp.position[1].toFixed(2)}, Z: {selectedComp.position[2].toFixed(2)}</div>
              {selectedComp.rotation && (
                <div>Rotation: X: {(selectedComp.rotation[0] * 180 / Math.PI).toFixed(1)}°, Y: {(selectedComp.rotation[1] * 180 / Math.PI).toFixed(1)}°, Z: {(selectedComp.rotation[2] * 180 / Math.PI).toFixed(1)}°</div>
              )}
            </div>
          </div>
        );
      })()}
      
        {/* Floating Lock UI */}
        {selectedId && onFindPairedComponent && onLockComponents && onUnlockComponents && (() => {
        const selectedComp = components.find(c => c.id === selectedId);
        if (!selectedComp) {
          console.log('🔒 Lock UI: Selected component not found:', selectedId);
          return null;
        }
        
        console.log('🔒 Lock UI: Looking for paired component for:', selectedComp.name);
        const pairedComp = onFindPairedComponent(selectedId);
        if (!pairedComp) {
          console.log('🔒 Lock UI: No paired component found');
          return null;
        }
        
        console.log('🔒 Lock UI: Found paired component:', pairedComp.name, 'Camera:', !!cameraRef.current, 'Renderer:', !!glRef.current);
        
        // Calculate distance
        const dx = selectedComp.position[0] - pairedComp.position[0];
        const dy = selectedComp.position[1] - pairedComp.position[1];
        const dz = selectedComp.position[2] - pairedComp.position[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 100; // Convert to mm
        
        // Check if they're locked (in same group)
        const isLocked = selectedComp.groupId && pairedComp.groupId && selectedComp.groupId === pairedComp.groupId;
        
        if (!cameraRef.current || !glRef.current) {
          console.log('🔒 Lock UI: Camera or renderer not ready yet');
          return null;
        }
        
        return (
          <FloatingLockUI
            component1={selectedComp}
            component2={pairedComp}
            camera={cameraRef.current}
            renderer={glRef.current}
            isLocked={!!isLocked}
            distance={distance}
            onLock={() => onLockComponents(selectedId, pairedComp.id)}
            onUnlock={() => onUnlockComponents(selectedId, pairedComp.id)}
          />
        );
      })()}
      
      {/* Camera Preview Cube */}
      {(sceneSettings?.cameraCube === true) && (
        <CameraPreviewCube
          onFaceClick={(face) => {
            if (!cameraState.camera || !cameraState.controls) return;
            
            const target = cameraState.controls.target ? cameraState.controls.target.clone() : new THREE.Vector3(0, 0, 0);
            const distance = cameraState.camera.position.distanceTo(target);
            
            // Define camera positions for each face
            const positions: Record<string, THREE.Vector3> = {
              front: new THREE.Vector3(target.x, target.y, target.z + distance),
              back: new THREE.Vector3(target.x, target.y, target.z - distance),
              right: new THREE.Vector3(target.x + distance, target.y, target.z),
              left: new THREE.Vector3(target.x - distance, target.y, target.z),
              top: new THREE.Vector3(target.x, target.y + distance, target.z),
              bottom: new THREE.Vector3(target.x, target.y - distance, target.z),
            };
            
            const newPosition = positions[face];
            if (newPosition && cameraState.camera && cameraState.controls) {
              // Smoothly animate camera to new position
              const startPos = cameraState.camera.position.clone();
              const startTarget = target.clone();
              const duration = 500; // ms
              const startTime = performance.now();
              
              const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
                
                const currentPos = startPos.clone().lerp(newPosition, eased);
                if (cameraState.camera) {
                  cameraState.camera.position.copy(currentPos);
                  cameraState.camera.lookAt(target);
                }
                
                if (cameraState.controls) {
                  cameraState.controls.target.copy(target);
                  cameraState.controls.update();
                }
                
                if (controlsRef.current) {
                  controlsRef.current.target.copy(target);
                  controlsRef.current.update();
                }
                
                if (progress < 1) {
                  requestAnimationFrame(animate);
                }
              };
              
              animate();
            }
          }}
          mainCamera={cameraState.camera}
          mainControls={cameraState.controls}
        />
      )}
      
      <Canvas 
        shadows={sceneSettings?.shadows ?? true}
        gl={{ 
          antialias: sceneSettings?.levelOfDetail === 'high', // Enable antialiasing for high quality
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
          alpha: false, // Disable alpha for better performance
          premultipliedAlpha: false
        }}
        dpr={
          sceneSettings?.levelOfDetail === 'high' ? [1, 3.0] : // Increased max pixel ratio for higher quality
          sceneSettings?.levelOfDetail === 'medium' ? [1, 2.0] :
          [1, 1.5] // Low quality - also increased
        }
        performance={{ min: 0.2 }} // Lower performance threshold
        style={{ 
          display: 'block', 
          width: '100%', 
          height: '100%', 
          pointerEvents: dragOver ? 'none' : 'auto',
          position: 'relative',
          zIndex: dragOver ? 0 : 1,
          cursor: activeTool === 'pan' ? 'grab' : 'default'
        }}
        onCreated={({ camera, gl, scene }) => {
          // Update camera, gl, and scene refs when Canvas is created/updated
          cameraRef.current = camera;
          glRef.current = gl;
          sceneRef.current = scene;
          
          // Apply level of detail settings
          const lod = sceneSettings?.levelOfDetail || 'medium';
          
          // Pixel ratio based on quality level - increased for better quality
          let pixelRatio: number;
          switch (lod) {
            case 'high':
              pixelRatio = Math.min(window.devicePixelRatio, 3.0); // Much higher pixel ratio for ultra-crisp rendering
              break;
            case 'medium':
              pixelRatio = Math.min(window.devicePixelRatio, 2.0); // Increased for better quality
              break;
            case 'low':
              pixelRatio = Math.min(window.devicePixelRatio, 1.5); // Increased for better quality
              break;
            default:
              pixelRatio = Math.min(window.devicePixelRatio, 2.0);
          }
          gl.setPixelRatio(pixelRatio);
          
          // Shadow map settings based on quality level
          gl.shadowMap.enabled = sceneSettings?.shadows ?? true;
          switch (lod) {
            case 'high':
              gl.shadowMap.type = THREE.PCFSoftShadowMap; // Best quality shadows
              gl.shadowMap.autoUpdate = true;
              break;
            case 'medium':
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
              gl.shadowMap.autoUpdate = true;
              break;
            case 'low':
              gl.shadowMap.type = THREE.BasicShadowMap; // Faster, lower quality shadows
              gl.shadowMap.autoUpdate = false; // Don't auto-update for better performance
              break;
          }
          
          // Set background color based on theme
          const isDark = document.documentElement.classList.contains('dark');
          gl.setClearColor(isDark ? 0x0f1115 : 0xffffff, 1);
          
          // Enable frustum culling
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.frustumCulled = true;
            }
          });
          
          console.log('Canvas created, camera and gl refs set');
        }}
        onPointerMissed={(e) => {
          // This fires when clicking on empty space (not on any 3D object)
          if (selectedId && activeTool === 'select') {
            setSelectedId(null);
            onSelectComponent('');
          }
        }}
        onDragOver={(e) => {
          // Allow drag over on canvas - prevent default to allow drop
          // Don't stop propagation so container can also handle it
          e.preventDefault();
          
          // Update drag position continuously during drag
          if (isDraggingFixedLeg && containerRef.current && cameraRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouse = new THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, cameraRef.current);
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectionPoint = new THREE.Vector3();
            const distance = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
            
            if (distance !== null && distance > 0) {
              setDragPosition(intersectionPoint);
            }
          }
        }}
        onDrop={(e) => {
          // Handle drop on canvas - call handleDrop directly
          console.log('🎯 Canvas onDrop - calling handleDrop');
          e.preventDefault();
          e.stopPropagation();
          handleDrop(e);
        }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
        <OrbitControls 
          ref={controlsRef}
          enablePan={activeTool === 'select' || activeTool === 'pan'}
          enableZoom={true}
          enableRotate={activeTool === 'select'}
          minDistance={1}  // Allow much closer zoom
          maxDistance={1000}  // Much increased max distance for better zoom out
          zoomSpeed={(sceneSettings?.invertZoom ? -1 : 1) * 1.5}  // Increased zoom speed for more responsive zooming
          onChange={() => {
            // Update controls target to mouse cursor position when zooming
            if (sceneSettings?.zoomTarget === 'mouse' && isZoomingRef.current && mousePosition && cameraRef.current && sceneRef.current && controlsRef.current) {
              const raycaster = new THREE.Raycaster();
              raycaster.setFromCamera(mousePosition, cameraRef.current);
              
              const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
              let zoomTargetPoint: THREE.Vector3;
              
              if (intersects.length > 0) {
                zoomTargetPoint = intersects[0].point;
              } else {
                // Project to a plane at the current target distance
                const currentTarget = controlsRef.current.target;
                const distance = cameraRef.current.position.distanceTo(currentTarget);
                const direction = raycaster.ray.direction.normalize();
                zoomTargetPoint = cameraRef.current.position.clone().add(direction.multiplyScalar(distance));
              }

              // Update controls target to mouse cursor position
              controlsRef.current.target.copy(zoomTargetPoint);
              controlsRef.current.update();
            }
          }}
        />
        
        {/* Drop handler for accurate 3D positioning using raycasting */}
        <DropHandler 
          onReady={(camera, gl) => {
            cameraRef.current = camera;
            glRef.current = gl;
          }}
        />
        
        {/* Expose camera controls */}
        <CameraControlsExposer
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          onControlsReady={(controls) => {
            internalControlsRef.current = controls;
            if (externalControlsRef) {
              externalControlsRef.current = controls;
            }
          }}
          components={components}
          viewMode={viewMode}
          selectedId={selectedId}
          onClearSelection={handleClearSelection}
          zoomTarget={sceneSettings?.zoomTarget}
          mousePosition={mousePosition}
          sceneRef={sceneRef}
        />
        
        {/* Update camera state for preview cube */}
        <CameraStateUpdater
          cameraRef={cameraRef}
          controlsRef={controlsRef}
          onUpdate={(camera, controls) => setCameraState({ camera, controls })}
        />
        
        {/* Auto-fit camera to all components */}
        <CameraController components={components} />

        {/* Fixed Leg Placement Helper */}
        <FixedLegPlacementHelper
          components={components}
          isDraggingFixedLeg={isDraggingFixedLeg}
          dragPosition={dragPosition}
          onAttachPointFound={setCurrentAttachPoint}
        />
        
        {/* Disabled frame cube highlight to avoid large box outlines during drag */}
        
        {isDraggingComponent && dragPosition && draggedComponentData && (
          <DraggedComponentPreview
            component={draggedComponentData}
            position={dragPosition}
            camera={cameraRef.current}
          />
        )}

        {isDraggingComponent && dragPosition && draggedComponentData && (
          <DraggedGhostPreview
            modelUrl={draggedComponentData.glb_url}
            position={dragPosition}
          />
        )}
        
        {/* Blue preview at attach point - shows "this component belongs here" */}
        {isDraggingFixedLeg && currentAttachPoint && (
          <FixedLegGhostPreview
            attachPoint={currentAttachPoint}
            legModelUrl={draggedFixedLegData?.glb_url}
            legBoundingBox={draggedFixedLegData?.bounding_box}
          />
        )}

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 15, 10]} 
          intensity={1}
          castShadow={sceneSettings?.shadows ?? true}
          shadow-mapSize-width={
            sceneSettings?.levelOfDetail === 'high' ? 2048 :
            sceneSettings?.levelOfDetail === 'medium' ? 1024 :
            512 // Low quality
          }
          shadow-mapSize-height={
            sceneSettings?.levelOfDetail === 'high' ? 2048 :
            sceneSettings?.levelOfDetail === 'medium' ? 1024 :
            512 // Low quality
          }
        />
        <pointLight position={[-10, 10, -10]} intensity={0.5} color="#00b4d8" />
        <pointLight position={[10, 5, 10]} intensity={0.3} color="#ff6b35" />

        {/* Environment - wrapped in error handling to prevent crashes when offline */}
        <Suspense fallback={null}>
          <EnvironmentWrapper />
        </Suspense>

        {/* Grid floor */}
        {((sceneSettings?.grid !== undefined ? sceneSettings.grid : showGrid)) && (
          <ThemeAwareGrid 
            viewMode={viewMode}
            theme={mounted ? theme : 'dark'}
          />
        )}

        {/* Coordinate System Helper - removed global, now shown per selected component */}
        

        {/* Floor plane for shadows and raycasting */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, 0, 0]} 
          receiveShadow={sceneSettings?.shadows ?? true}
          userData={{ isGroundPlane: true }}
        >
          <planeGeometry args={[1000, 1000]} />
          <shadowMaterial transparent opacity={sceneSettings?.shadows ? 0.3 : 0} />
        </mesh>

        {/* Slot-based placement system */}
        <SlotPlacementSystem />

        {/* Render dynamic components from backend */}
        {components.length > 0 && (
          <>
            {components.map((comp) => {
              const key = comp.id;
              
              // Format URLs to be absolute if needed (important for loading from links)
              const formatUrl = (url: string | null | undefined): string | null => {
                if (!url || url.trim() === '' || url === 'null') return null;
                // If URL is already absolute, use as-is
                if (url.startsWith('http://') || url.startsWith('https://')) {
                  return url;
                }
                // If relative, make it absolute using API_BASE
                return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
              };
              
              const originalUrl = formatUrl(comp.original_url);
              const glbUrl = formatUrl(comp.glb_url);

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
            // Calculate targetSize from bounding_box (stable calculation)
            let targetSize: [number, number, number];
            if (comp.bounding_box && comp.bounding_box.min && comp.bounding_box.max) {
              const width = Math.abs((comp.bounding_box.max[0] || 0) - (comp.bounding_box.min[0] || 0));
              const height = Math.abs((comp.bounding_box.max[1] || 0) - (comp.bounding_box.min[1] || 0));
              const length = Math.abs((comp.bounding_box.max[2] || 0) - (comp.bounding_box.min[2] || 0));
              
              // Use exact values - normalization happens inside GLBModelContent for comparison
              // This ensures all changes are detected
              targetSize = [
                Math.max(width, 1),
                Math.max(height, 1),
                Math.max(length, 1)
              ] as [number, number, number];
            } else {
              // No bounding_box available - use defaults based on component type
              const isConveyor = (comp.category || '').toLowerCase().includes('belt') || 
                                (comp.category || '').toLowerCase().includes('conveyor');
              
              if (isConveyor) {
                targetSize = [500, 300, 1000] as [number, number, number]; // [width, height, length]
              } else {
                targetSize = [450, 450, 450] as [number, number, number];
              }
            }
            

            // Use component ID + bounding box hash as key to force re-render when dimensions change
            // This ensures the component updates when bounding_box changes
            // Use high precision for hash to detect all changes (0.01mm precision for accurate updates)
            const normalizeForHash = (val: number) => Math.round(val * 100) / 100;
            const boundingBoxHash = comp.bounding_box 
              ? `${normalizeForHash(comp.bounding_box.min[0])},${normalizeForHash(comp.bounding_box.min[1])},${normalizeForHash(comp.bounding_box.min[2])},${normalizeForHash(comp.bounding_box.max[0])},${normalizeForHash(comp.bounding_box.max[1])},${normalizeForHash(comp.bounding_box.max[2])}`
              : '';
            
            content = (
              <GLBModel
                key={`${comp.id}-${boundingBoxHash}`} // Include bounding box hash to force re-render on dimension changes
                url={glbUrl!}
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
                targetSize={targetSize}
                wireframe={sceneSettings?.viewMode === 'wireframe'}
                category={comp.category}
                castShadow={sceneSettings?.shadows ?? true}
                receiveShadow={sceneSettings?.shadows ?? true}
              />
            );
          } else if (originalUrl && isSTL) {
            content = (
              <STLModel
                url={originalUrl}
                position={[0, 0, 0]} // Position handled by parent group
                rotation={[0, 0, 0]} // Rotation handled by parent group
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          } else if (originalUrl && isOBJ) {
            content = (
              <OBJModel
                url={originalUrl}
                position={[0, 0, 0]} // Position handled by parent group
                rotation={[0, 0, 0]} // Rotation handled by parent group
                selected={selectedId === comp.id}
                onSelect={() => handleSelect(comp.id)}
              />
            );
          } else if (originalUrl && isSTEP) {
            // STEP files need conversion - if no GLB, show placeholder with helpful message
            content = (
              <ComponentPlaceholder
                position={[0, 0, 0]} // Position handled by parent group
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
                position={[0, 0, 0]} // Position handled by parent group
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
          // Components in groups can still be moved - the group movement logic in handleUpdateComponent will handle moving all group members
          if (selectedId === comp.id && onUpdateComponent && activeTool !== 'select') {
            return (
              <TransformControlWrapper
                key={key}
                component={comp}
                transformMode={transformMode}
                snap={snap}
                onUpdate={(pos, rot, scale) => {
                  // Check if this is a horizontal rod that needs auto-extension
                  const componentName = (comp.name || '').toLowerCase();
                  const componentCategory = (comp.category || '').toLowerCase();
                  const isRod = componentName.includes('rod') || componentCategory.includes('rod');
                  const isHorizontalRod = (componentName.includes('horizontal') && isRod) || (componentCategory.includes('horizontal') && isRod);
                  
                  // Update this component
                  const update: Partial<SceneComponent> = { position: pos, rotation: rot };
                  if (scale) {
                    update.scale = scale;
                  }
                  
                  // For horizontal rods, auto-extend length to touch the other side
                  if (isHorizontalRod && comp.bounding_box) {
                    // Find all potential target components (other horizontal rods, fixed legs, beds)
                    const potentialTargets: Array<{ comp: SceneComponent; distance: number; direction: 'positive' | 'negative' }> = [];
                    
                    components.forEach(otherComp => {
                      if (otherComp.id === comp.id) return;
                      
                      const otherName = (otherComp.name || '').toLowerCase();
                      const otherCategory = (otherComp.category || '').toLowerCase();
                      
                      // Check if it's a relevant component (horizontal rod, fixed leg, bed, or frame)
                      const isRelevant = 
                        (otherName.includes('horizontal') && (otherName.includes('rod') || otherCategory.includes('rod'))) ||
                        (otherName.includes('fixed') && (otherName.includes('leg') || otherCategory.includes('leg'))) ||
                        otherName.includes('bed') || otherCategory.includes('bed') ||
                        otherName.includes('frame') || otherCategory.includes('frame');
                      
                      if (isRelevant) {
                        // Calculate distance in Z direction (horizontal rods extend in Z)
                        const dz = otherComp.position[2] - pos[2];
                        const dx = Math.abs(otherComp.position[0] - pos[0]);
                        const dy = Math.abs(otherComp.position[1] - pos[1]);
                        
                        // For beds, also check if the rod is within the bed's X bounds
                        let isAligned = false;
                        if (otherName.includes('bed') || otherCategory.includes('bed')) {
                          // Check if rod is within bed's X bounds
                          if (otherComp.bounding_box) {
                            const bedMinX = (otherComp.bounding_box.min[0] || 0) / 100 + otherComp.position[0];
                            const bedMaxX = (otherComp.bounding_box.max[0] || 0) / 100 + otherComp.position[0];
                            isAligned = pos[0] >= bedMinX - 0.5 && pos[0] <= bedMaxX + 0.5 && dy < 1.0 && Math.abs(dz) > 0.1;
                          } else {
                            isAligned = dx < 5.0 && dy < 1.0 && Math.abs(dz) > 0.1;
                          }
                        } else {
                          // For other components, check alignment more leniently
                          isAligned = dx < 3.0 && dy < 1.5 && Math.abs(dz) > 0.1;
                        }
                        
                        if (isAligned) {
                          potentialTargets.push({
                            comp: otherComp,
                            distance: Math.abs(dz),
                            direction: dz > 0 ? 'positive' : 'negative'
                          });
                        }
                      }
                    });
                    
                    // Find the furthest target in each direction
                    let furthestPositive: { comp: SceneComponent; distance: number } | null = null;
                    let furthestNegative: { comp: SceneComponent; distance: number } | null = null;
                    
                    potentialTargets.forEach(target => {
                      if (target.direction === 'positive') {
                        if (!furthestPositive || target.distance > furthestPositive.distance) {
                          furthestPositive = { comp: target.comp, distance: target.distance };
                        }
                      } else {
                        if (!furthestNegative || target.distance > furthestNegative.distance) {
                          furthestNegative = { comp: target.comp, distance: target.distance };
                        }
                      }
                    });
                    
                    // Determine which side to extend to (use the furthest target)
                    let targetZ: number | null = null;
                    if (furthestPositive && furthestNegative) {
                      // Use the furthest one
                      targetZ = furthestPositive.distance > furthestNegative.distance 
                        ? furthestPositive.comp.position[2]
                        : furthestNegative.comp.position[2];
                    } else if (furthestPositive) {
                      targetZ = furthestPositive.comp.position[2];
                    } else if (furthestNegative) {
                      targetZ = furthestNegative.comp.position[2];
                    }
                    
                    // If we found a target, calculate the required length
                    if (targetZ !== null) {
                      // Calculate distance from current position to target in Z direction
                      const dz = targetZ - pos[2];
                      const distance = Math.abs(dz);
                      
                      // The rod's center is at pos[2], and we want it to reach targetZ
                      // So the rod needs to extend from center to target, which means:
                      // length = 2 * distance (to reach from center to target in the target direction)
                      const requiredLengthGrid = 2 * distance;
                      
                      // Convert to mm (grid units to mm)
                      const requiredLengthMm = Math.max(350, Math.round(requiredLengthGrid * 100));
                      
                      // Get current rod dimensions
                      const currentLength = comp.dimensions?.length || 
                                           (comp.bounding_box ? Math.abs((comp.bounding_box.max[2] || 0) - (comp.bounding_box.min[2] || 0)) : 350);
                      
                      // Always update to ensure it reaches the target
                      if (Math.abs(requiredLengthMm - currentLength) > 5) {
                        // Update the rod's length dimension
                        // For horizontal rods, length is in Z axis (max[2] - min[2])
                        const newBoundingBox = comp.bounding_box ? {
                          ...comp.bounding_box,
                          max: [
                            comp.bounding_box.max[0] || 0,
                            comp.bounding_box.max[1] || 0,
                            (comp.bounding_box.min[2] || 0) + requiredLengthMm
                          ] as [number, number, number]
                        } : comp.bounding_box;
                        
                        update.bounding_box = newBoundingBox;
                        update.dimensions = {
                          ...comp.dimensions,
                          length: requiredLengthMm,
                          width: comp.dimensions?.width || 50,
                          height: comp.dimensions?.height || 50
                        };
                      }
                    }
                  }
                  
                  onUpdateComponent(comp.id, update);
                  
                  // If this component is locked to another, update the linked component too
                  if (comp.isLocked && comp.linkedTo) {
                    const linkedComp = components.find(c => c.id === comp.linkedTo);
                    if (linkedComp) {
                      // Calculate relative position difference
                      const dx = pos[0] - comp.position[0];
                      const dy = pos[1] - comp.position[1];
                      const dz = pos[2] - comp.position[2];
                      
                      // Move linked component by the same amount
                      const linkedUpdate: Partial<SceneComponent> = {
                        position: [
                          linkedComp.position[0] + dx,
                          linkedComp.position[1] + dy,
                          linkedComp.position[2] + dz
                        ],
                        rotation: rot // Use same rotation
                      };
                      if (scale) {
                        linkedUpdate.scale = scale; // Use same scale
                      }
                      onUpdateComponent(linkedComp.id, linkedUpdate);
                    }
                  }
                }}
                showCoordinateSystem={sceneSettings?.coordinateSystem === true}
                orbitControlsRef={controlsRef}
                allComponents={components}
                onUpdateComponent={onUpdateComponent}
              >
                {content}
              </TransformControlWrapper>
            );
          }

          // Return the component group directly (no transform controls)
          // Position is already calculated so bottom sits on grid (Y=0) or special positions (rod: 1.40, CM: 1.00, Wheel with Break: 0.10)
          // CM must always be locked at Y: 1.00, Wheel with Break at Y: 0.10
          const componentName = (comp.name || '').toLowerCase();
          const componentCategory = (comp.category || '').toLowerCase();
          const isRod = componentName.includes('rod') || componentCategory.includes('rod');
          const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
          const isCM = componentName === 'cm';
          const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
          const isFixedLeg = componentName.includes('fixed') && 
                        (componentName.includes('leg') || componentCategory.includes('leg'));
          const GRID_OFFSET = 0;
          // CM is locked at Y: 1.00, Wheel with Break at Y: 0.10, Fixed Legs at Y: 0.75, Vertical Rod on Wheel at Y: 1.46, rod can be above grid, others constrained to be at least on grid
          let constrainedY: number;
          if (isCM) {
            constrainedY = 1.00;
          } else if (isWheelWithBreak) {
            constrainedY = 0.10;
          } else if (isFixedLeg) {
            constrainedY = 0.75;
          } else if (isVerticalRod && comp.isLocked && comp.linkedTo) {
            // Check if vertical rod is locked to a wheel
            const linkedComp = components.find(c => c.id === comp.linkedTo);
            const linkedName = (linkedComp?.name || '').toLowerCase();
            const isLinkedToWheel = linkedName.includes('wheel') && linkedName.includes('break');
            if (isLinkedToWheel) {
              // Vertical Rod locked to Wheel should be at Y: 1.46
              constrainedY = 1.46;
            } else {
              // Vertical rod locked to something else, use position or grid
              constrainedY = Math.max(comp.position[1], GRID_OFFSET);
            }
          } else {
            // Rods can move above grid, but must stay at or above grid level (Y >= 0)
            constrainedY = Math.max(comp.position[1], GRID_OFFSET);
          }
          const isSelected = selectedId === comp.id;
          
          // Check for linkable components (rod + wheel with break)
          // Only show lock UI on the first component (rod) to avoid duplication
          const linkableComponent = !comp.isLocked && components.find(otherComp => 
            otherComp.id !== comp.id && 
            !otherComp.linkedTo && 
            !comp.linkedTo &&
            areComponentsLinkable(comp, otherComp, 0.5) &&
            // Only show on rod component (to avoid showing on both)
            (isRod || (() => {
              const otherName = (otherComp.name || '').toLowerCase();
              return otherName.includes('rod') || (otherComp.category || '').toLowerCase().includes('rod');
            })())
          );
          
          // Calculate lock UI position (midpoint between two components)
          const lockPosition: [number, number, number] | null = (linkableComponent || (comp.isLocked && comp.linkedTo))
            ? (() => {
                const otherComp = linkableComponent || components.find(c => c.id === comp.linkedTo);
                if (!otherComp) return null;
                const otherY = (() => {
                  const otherName = (otherComp.name || '').toLowerCase();
                  const isOtherCM = otherName === 'cm';
                  const isOtherWheel = otherName.includes('wheel') && otherName.includes('break');
                  if (isOtherCM) return 1.00;
                  if (isOtherWheel) return 0.10;
                  const isOtherRod = otherName.includes('rod') || (otherComp.category || '').toLowerCase().includes('rod');
                  return isOtherRod ? otherComp.position[1] : Math.max(otherComp.position[1], 0);
                })();
                return [
                  (comp.position[0] + otherComp.position[0]) / 2,
                  (constrainedY + otherY) / 2 + 0.5, // Slightly above
                  (comp.position[2] + otherComp.position[2]) / 2
                ];
              })()
            : null;
          
          // Enforce rotation for components that need locked rotation (even when not selected)
          let finalRotation: [number, number, number] = comp.rotation || [0, 0, 0];
          if (isWheelWithBreak) {
            // Wheel with Break must always be locked at X: -90.0 degrees
            finalRotation = [-Math.PI / 2, 0, 0];
          }
          
          return (
            <group 
              key={key} 
              position={[comp.position[0], constrainedY, comp.position[2]]} 
              rotation={finalRotation}
              scale={comp.scale || [1, 1, 1]}
            >
              {content}
              {/* Show coordinate system for selected component if setting is enabled */}
              {isSelected && sceneSettings?.coordinateSystem === true && (
                <axesHelper args={[2]} />
              )}
              {/* Show lock UI when components are close enough to link and not already locked */}
              {/* Only show on rod component to avoid duplication */}
              {linkableComponent && lockPosition && onUpdateComponent && !comp.isLocked && !linkableComponent.isLocked && isRod && (
                <LockUI
                  position={lockPosition}
                  onLock={() => {
                    // Lock/merge the components
                    const rodComp = comp;
                    const wheelComp = linkableComponent;
                    
                    // Calculate relative position offset
                    const relativePos: [number, number, number] = [
                      rodComp.position[0] - wheelComp.position[0],
                      rodComp.position[1] - wheelComp.position[1],
                      rodComp.position[2] - wheelComp.position[2]
                    ];
                    
                    // Link rod to wheel (rod follows wheel)
                    // Store relative position in the linked component for maintaining offset
                    onUpdateComponent(rodComp.id, {
                      linkedTo: wheelComp.id,
                      isLocked: true
                    });
                    onUpdateComponent(wheelComp.id, {
                      linkedTo: rodComp.id,
                      isLocked: true
                    });
                    
                    console.log('🔒 Components locked:', {
                      rod: rodComp.id,
                      wheel: wheelComp.id,
                      relativePos
                    });
                  }}
                  isLocked={false}
                />
              )}
              {/* Show locked indicator if already locked - only show on rod component */}
              {comp.isLocked && comp.linkedTo && lockPosition && onUpdateComponent && isRod && (
                <LockUI
                  position={lockPosition}
                  onLock={() => {
                    // Unlock the components
                    const linkedComp = components.find(c => c.id === comp.linkedTo);
                    if (linkedComp) {
                      onUpdateComponent(comp.id, {
                        linkedTo: undefined,
                        isLocked: false
                      });
                      onUpdateComponent(linkedComp.id, {
                        linkedTo: undefined,
                        isLocked: false
                      });
                      console.log('🔓 Components unlocked:', {
                        comp1: comp.id,
                        comp2: linkedComp.id
                      });
                    }
                  }}
                  isLocked={true}
                />
              )}
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
