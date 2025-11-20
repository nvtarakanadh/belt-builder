import { useState, useCallback, useRef, Suspense, useEffect, useMemo, ErrorInfo, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, useGLTF, TransformControls, Html } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
// type-only declarations are provided in src/types/three-extensions.d.ts
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { useTheme } from 'next-themes';
import { SlotPlacementSystem } from './SlotPlacementSystem';
import { FPSCounter } from './FPSCounter';
import { CameraPreviewCube } from './CameraPreviewCube';

// Smooth camera animation helper using lerp
function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

// Theme-aware Grid component
function ThemeAwareGrid({ viewMode, theme }: { viewMode: 'focused' | 'shopfloor'; theme?: string }) {
  const isDark = theme === 'dark';
  return (
    <Grid 
      args={viewMode === 'shopfloor' ? [100, 100] : [50, 50]}
      cellSize={1}
      cellThickness={0.5}
      cellColor={isDark ? "#2a2a2a" : "#e0e0e0"}
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

interface SceneProps {
  onSelectComponent: (id: string) => void;
  viewMode?: 'focused' | 'shopfloor';
  showGrid?: boolean;
  components?: SceneComponent[];
  onAddComponent?: (component: Omit<SceneComponent, 'id'>) => void;
  onUpdateComponent?: (id: string, update: Partial<SceneComponent>) => void;
  activeTool?: string; // Tool from toolbar: 'select', 'move', 'rotate', 'pan'
  controlsRef?: React.MutableRefObject<SceneControls | null>; // Ref to expose camera controls
  sceneSettings?: {
    viewMode?: 'realistic' | 'orthographic' | 'wireframe';
    levelOfDetail?: 'high' | 'medium' | 'low';
    zoomTarget?: 'center' | 'selection';
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
    // Round to 2 decimal places to catch smaller changes while avoiding floating point precision issues
    const normalizeValue = (val: number) => Math.round(val * 100) / 100;
    const targetSizeKey = `${normalizeValue(targetSize[0])},${normalizeValue(targetSize[1])},${normalizeValue(targetSize[2])}`;
    
    // Skip if targetSize hasn't actually changed (even if array reference changed)
    // BUT always apply on first load (when lastTargetSizeRef is empty)
    if (targetSizeKey === lastTargetSizeRef.current && lastTargetSizeRef.current !== '') {
      console.log('⏭️ TargetSize unchanged, skipping re-scale:', {
        current: targetSizeKey,
        targetSize
      });
      return;
    }
    
    console.log('🔄 TargetSize changed, re-scaling model:', {
      old: lastTargetSizeRef.current,
      new: targetSizeKey,
      targetSize,
      originalSize: originalSizeRef.current
    });
    
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
    
    // Create normalized key to detect changes
    const normalizeValue = (val: number) => Math.round(val * 10) / 10;
    const targetSizeKey = `${normalizeValue(targetSize[0])},${normalizeValue(targetSize[1])},${normalizeValue(targetSize[2])}`;
    
    // Only trigger if targetSize actually changed
    if (targetSizeKey !== lastTargetSizeRef.current) {
      // Force a re-scale by resetting the lastTargetSizeRef
      // This will cause the scaling effect above to run
      lastTargetSizeRef.current = '';
    }
  }, [targetSize, clonedScene]);
  
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

// Wrapper component for TransformControls to properly handle refs
function TransformControlWrapper({ 
  component, 
  transformMode, 
  snap, 
  onUpdate, 
  children,
  showCoordinateSystem,
  orbitControlsRef
}: { 
  component: SceneComponent;
  transformMode: 'translate' | 'rotate' | 'scale';
  snap: { translate: number; rotate: number; scale: number };
  onUpdate: (pos: [number, number, number], rot: [number, number, number]) => void;
  children: React.ReactNode;
  showCoordinateSystem?: boolean;
  orbitControlsRef?: React.RefObject<any>;
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
      const isCM = componentName === 'cm';
      const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
      let constrainedY = component.position[1];
      
      if (isCM) {
        // CM must always be at Y: 1.00
        constrainedY = 1.00;
      } else if (isWheelWithBreak) {
        // Wheel with Break must always be at Y: 0.10
        constrainedY = 0.10;
      } else {
        // Ensure Y position is at least GRID_OFFSET (on grid) for other components
        constrainedY = Math.max(component.position[1], GRID_OFFSET);
      }
      
      // Update group position and rotation to match component
      groupRef.current.position.set(component.position[0], constrainedY, component.position[2]);
      
      // Lock rotation for Wheel with Break
      let rotation: [number, number, number];
      if (isWheelWithBreak) {
        // Wheel with Break must always be locked at X: -90.0 degrees
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
  }, [component.position, component.rotation]);
  
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
    const isCM = componentName === 'cm';
    const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
    
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
        if (isCM) {
          // CM must always be at Y: 1.00
          group.position.y = 1.00;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        } else if (isWheelWithBreak) {
          // Wheel with Break must always be at Y: 0.10
          group.position.y = 0.10;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        } else if (group.position.y < GRID_OFFSET) {
          group.position.y = GRID_OFFSET;
          group.updateMatrixWorld();
          controls.updateMatrixWorld();
        }
      }
    };
    
    // Also enforce constraint during dragging (on every frame)
    const handleObjectChange = () => {
      if (isDraggingRef.current && group) {
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
        } else if (group.position.y < GRID_OFFSET) {
          group.position.y = GRID_OFFSET;
          group.updateMatrixWorld();
        }
      }
    };
    
    controls.addEventListener('dragging-changed', handleDraggingChanged);
    controls.addEventListener('objectChange', handleObjectChange);
    
    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      controls.removeEventListener('objectChange', handleObjectChange);
    };
  }, [component.name]);
  
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
        
        let constrainedY = newPos.y;
        if (isCM) {
          constrainedY = 1.00;
        } else if (isWheelWithBreak) {
          constrainedY = 0.10;
        } else {
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
        onUpdate(pos, rot);
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
            // Rod can be above grid
            const isRod = (component.name || '').toLowerCase().includes('rod') || 
                         (component.category || '').toLowerCase().includes('rod');
            return isRod ? component.position[1] : Math.max(component.position[1], GRID_OFFSET);
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
      </group>
      {groupObject && (() => {
        const componentName = (component.name || '').toLowerCase();
        const isCM = componentName === 'cm';
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
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
            showY={!(isCM || isWheelWithBreak)} // Hide Y-axis handle for CM and Wheel with Break components to prevent vertical movement
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
        } else {
          // Constrain Y position to be at least GRID_OFFSET (on grid) for other components
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
        
        const pos = [
          Math.round(obj.position.x / snap.translate) * snap.translate,
          yPos,
          Math.round(obj.position.z / snap.translate) * snap.translate
        ] as [number, number, number];
        
        // Constrain rotation based on component type
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
        } else {
          // Apply normal rotation snapping for other components
          rot = [
          Math.round(obj.rotation.x / snap.rotate) * snap.rotate,
          Math.round(obj.rotation.y / snap.rotate) * snap.rotate,
          Math.round(obj.rotation.z / snap.rotate) * snap.rotate
        ] as [number, number, number];
        }
        onUpdate(pos, rot);
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
  onClearSelection
}: { 
  controlsRef: React.RefObject<any>; 
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  onControlsReady: (controls: SceneControls) => void;
  components: SceneComponent[];
  viewMode: 'focused' | 'shopfloor';
  selectedId: string | null;
  onClearSelection: () => void;
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
        const distance = camera.position.distanceTo(controlsRef.current.target);
        const newDistance = distance / factor;
        const direction = new THREE.Vector3()
          .subVectors(camera.position, controlsRef.current.target)
          .normalize();
        camera.position.copy(controlsRef.current.target.clone().add(direction.multiplyScalar(newDistance)));
        camera.updateProjectionMatrix();
        controlsRef.current.update();
      }
    },
    zoomOut: (factor = 1.2) => {
      if (controlsRef.current && camera instanceof THREE.PerspectiveCamera) {
        const distance = camera.position.distanceTo(controlsRef.current.target);
        const newDistance = distance * factor;
        const clampedDistance = Math.min(newDistance, 500); // Increased max zoom out distance
        const direction = new THREE.Vector3()
          .subVectors(camera.position, controlsRef.current.target)
          .normalize();
        camera.position.copy(controlsRef.current.target.clone().add(direction.multiplyScalar(clampedDistance)));
        camera.updateProjectionMatrix();
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
  }), [controlsRef, camera, components, viewMode, onClearSelection]);

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
  onAddComponent,
  onUpdateComponent,
  activeTool = 'select',
  controlsRef: externalControlsRef,
  sceneSettings
}: SceneProps) => {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update Canvas background when theme changes
  useEffect(() => {
    if (mounted && glRef.current) {
      const isDark = theme === 'dark';
      glRef.current.setClearColor(isDark ? 0x0f1115 : 0xffffff, 1);
    }
  }, [theme, mounted]);
  
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
  const [snap, setSnap] = useState({ translate: 0.1, rotate: Math.PI / 24, scale: 0.05 });
  
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
    // Set drop effect to show it's a valid drop target
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [dragOver]);

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
      }
    } else {
      setDragOver(false);
    }
  }, []);

  // Store camera and gl references for raycasting
  const cameraRef = useRef<THREE.Camera | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
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
        const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
        
        // Debug logging
        console.log('Component placement:', {
          name: component.name,
          category: component.category,
          isRod,
          isCM,
          isWheelWithBreak
        });
        
        let adjustedY: number;
        if (isRod) {
          // Rod component should be placed at Y: 1.40
          adjustedY = 1.40;
          console.log('Placing rod at Y: 1.40');
        } else if (isCM) {
          // CM component should be placed at Y: 1.00
          adjustedY = 1.00;
        } else if (isWheelWithBreak) {
          // Wheel with Break component should be placed at Y: 0.10
          adjustedY = 0.10;
          console.log('Placing Wheel with Break at Y: 0.10');
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
        }
        
        const finalPosition: [number, number, number] = [
          position[0], // Use drop X position
          adjustedY, // Auto-adjust Y: Rod at 1.40, CM at 1.00, others at grid level (Y=0)
          position[2] // Use drop Z position
        ];
        
        // Special rotation handling for belt, rod, and Wheel with Break components
        // isRod and isWheelWithBreak are already declared above, reuse them
        const isBelt = (component.name || '').toLowerCase().includes('belt') || 
                      (component.category || '').toLowerCase().includes('belt');
        
        let initialRotation: [number, number, number] = [0, 0, 0];
        if (isBelt || isRod) {
          // Rotate 90 degrees around X axis
          initialRotation = [Math.PI / 2, 0, 0] as [number, number, number];
        } else if (isWheelWithBreak) {
          // Wheel with Break: rotate -90 degrees around X axis
          initialRotation = [-Math.PI / 2, 0, 0] as [number, number, number];
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
        };
        
        
        if (onAddComponent) {
          onAddComponent(componentToAdd);
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
  }, [onAddComponent]);

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
    
  const controlsRef = useRef<any>();
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
          // Update camera and gl refs when Canvas is created/updated
          cameraRef.current = camera;
          glRef.current = gl;
          
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
        }}
        onDrop={(e) => {
          // Prevent canvas from handling drop - let container handle it
          console.log('🎯 Canvas onDrop - preventing default and stopping propagation');
          e.preventDefault();
          e.stopPropagation();
          // Don't call handleDrop here - let the container div handle it
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
        />
        
        {/* Update camera state for preview cube */}
        <CameraStateUpdater
          cameraRef={cameraRef}
          controlsRef={controlsRef}
          onUpdate={(camera, controls) => setCameraState({ camera, controls })}
        />
        
        {/* Auto-fit camera to all components */}
        <CameraController components={components} />

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

        {/* Environment */}
        <Environment preset="warehouse" />

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
            // Calculate targetSize from bounding_box (stable calculation)
            let targetSize: [number, number, number];
            if (comp.bounding_box && comp.bounding_box.min && comp.bounding_box.max) {
              const width = Math.abs((comp.bounding_box.max[0] || 0) - (comp.bounding_box.min[0] || 0));
              const height = Math.abs((comp.bounding_box.max[1] || 0) - (comp.bounding_box.min[1] || 0));
              const length = Math.abs((comp.bounding_box.max[2] || 0) - (comp.bounding_box.min[2] || 0));
              
              // Round to 2 decimal places to catch smaller changes while avoiding floating point precision issues
              const roundTo2Decimals = (val: number) => Math.round(val * 100) / 100;
              
              targetSize = [
                Math.max(roundTo2Decimals(width), 1),
                Math.max(roundTo2Decimals(height), 1),
                Math.max(roundTo2Decimals(length), 1)
              ] as [number, number, number];
              
              // Debug log to track dimension changes
              console.log('📐 Calculating targetSize for component:', comp.id, {
                bounding_box: comp.bounding_box,
                calculated: { width, height, length },
                targetSize
              });
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
            

            // Use component ID as key - don't include dimensions to avoid remounting on dimension changes
            // The GLBModelContent will handle dimension updates via targetSize prop changes
            content = (
              <GLBModel
                key={comp.id} // Use stable key - dimension changes handled via targetSize prop
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
          if (selectedId === comp.id && onUpdateComponent && activeTool !== 'select') {
            return (
              <TransformControlWrapper
                key={key}
                component={comp}
                transformMode={transformMode}
                snap={snap}
                onUpdate={(pos, rot) => onUpdateComponent(comp.id, { position: pos, rotation: rot })}
                showCoordinateSystem={sceneSettings?.coordinateSystem === true}
                orbitControlsRef={controlsRef}
              >
                {content}
              </TransformControlWrapper>
            );
          }

          // Return the component group directly (no transform controls)
          // Position is already calculated so bottom sits on grid (Y=0) or special positions (rod: 1.40, CM: 1.00, Wheel with Break: 0.10)
          // CM must always be locked at Y: 1.00, Wheel with Break at Y: 0.10
          const componentName = (comp.name || '').toLowerCase();
          const isRod = componentName.includes('rod') || 
                       (comp.category || '').toLowerCase().includes('rod');
          const isCM = componentName === 'cm';
          const isWheelWithBreak = componentName.includes('wheel') && componentName.includes('break');
          const GRID_OFFSET = 0;
          // CM is locked at Y: 1.00, Wheel with Break at Y: 0.10, rod can be above grid, others constrained to be at least on grid
          let constrainedY: number;
          if (isCM) {
            constrainedY = 1.00;
          } else if (isWheelWithBreak) {
            constrainedY = 0.10;
          } else {
            constrainedY = isRod ? comp.position[1] : Math.max(comp.position[1], GRID_OFFSET);
          }
          const isSelected = selectedId === comp.id;
          return (
            <group 
              key={key} 
              position={[comp.position[0], constrainedY, comp.position[2]]} 
              rotation={comp.rotation || [0, 0, 0]}
            >
              {content}
              {/* Show coordinate system for selected component if setting is enabled */}
              {isSelected && sceneSettings?.coordinateSystem === true && (
                <axesHelper args={[2]} />
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
