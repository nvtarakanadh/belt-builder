import { useState, useRef, useEffect, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export interface SceneSettings {
  viewMode: 'realistic' | 'orthographic' | 'wireframe';
  levelOfDetail: 'high' | 'medium' | 'low';
  zoomTarget: 'center' | 'selection';
  invertZoom: boolean;
  shadows: boolean;
  placementPreview: boolean;
  coordinateSystem: boolean;
  cameraCube: boolean;
  grid: boolean;
  fpsCounter: boolean;
}

export const DEFAULT_SETTINGS: SceneSettings = {
  viewMode: 'realistic',
  levelOfDetail: 'high',
  zoomTarget: 'center',
  invertZoom: false,
  shadows: true,
  placementPreview: true,
  coordinateSystem: false,
  cameraCube: false,
  grid: true,
  fpsCounter: false,
};

interface SettingsPanelProps {
  open: boolean;
  onClose?: () => void;
  settings: SceneSettings;
  onSettingsChange: (settings: SceneSettings) => void;
  onResetSettings?: () => void;
}

// Interactive cube widget component
function InteractiveCube({ 
  onFaceClick,
  cameraRef 
}: { 
  onFaceClick: (face: string) => void;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}) {
  const { camera, gl } = useThree();
  const cubeRef = useRef<THREE.Mesh>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const autoRotate = useRef(true);

  // Update camera ref
  useEffect(() => {
    if (camera) {
      cameraRef.current = camera;
    }
  }, [camera, cameraRef]);

  // Handle mouse interactions
  useEffect(() => {
    const canvas = gl.domElement;
    
    const handlePointerDown = (e: PointerEvent) => {
      if (!cubeRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObject(cubeRef.current);
      
      if (intersects.length > 0) {
        isDragging.current = true;
        autoRotate.current = false;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging.current && cubeRef.current) {
        const deltaX = e.clientX - lastMousePos.current.x;
        const deltaY = e.clientY - lastMousePos.current.y;
        
        cubeRef.current.rotation.y += deltaX * 0.01;
        cubeRef.current.rotation.x += deltaY * 0.01;
        
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging.current && cubeRef.current) {
        // Check if we clicked on a face (not dragged)
        const moved = Math.abs(e.clientX - lastMousePos.current.x) < 5 && 
                     Math.abs(e.clientY - lastMousePos.current.y) < 5;
        
        if (moved) {
          const rect = canvas.getBoundingClientRect();
          mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          
          raycaster.current.setFromCamera(mouse.current, camera);
          const intersects = raycaster.current.intersectObject(cubeRef.current);
          
          if (intersects.length > 0) {
            const face = intersects[0].face;
            if (face) {
              // Transform normal to world space
              const normal = face.normal.clone();
              if (cubeRef.current.matrixWorld) {
                normal.transformDirection(cubeRef.current.matrixWorld);
              }
              
              // Determine which face was clicked
              const absX = Math.abs(normal.x);
              const absY = Math.abs(normal.y);
              const absZ = Math.abs(normal.z);
              
              let faceName = 'front';
              if (absX > absY && absX > absZ) {
                faceName = normal.x > 0 ? 'right' : 'left';
              } else if (absY > absX && absY > absZ) {
                faceName = normal.y > 0 ? 'top' : 'bottom';
              } else {
                faceName = normal.z > 0 ? 'back' : 'front';
              }
              
              onFaceClick(faceName);
            }
          }
        }
        
        isDragging.current = false;
        autoRotate.current = true;
        canvas.style.cursor = 'grab';
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.style.cursor = 'default';
    };
  }, [camera, gl, onFaceClick]);

  // Auto-rotate when not dragging
  useFrame((state, delta) => {
    if (cubeRef.current && autoRotate.current && !isDragging.current) {
      cubeRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <mesh ref={cubeRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="#00b4d8"
        metalness={0.3}
        roughness={0.4}
      />
      <Edges />
    </mesh>
  );
}

// Edges helper component
function Edges() {
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  
  return (
    <lineSegments>
      <edgesGeometry args={[boxGeometry]} />
      <lineBasicMaterial color="#ffffff" linewidth={1} />
    </lineSegments>
  );
}

// FPS Counter component (will be rendered in Scene, not here)

export function SettingsPanel({
  open,
  onClose,
  settings,
  onSettingsChange,
  onResetSettings,
}: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<SceneSettings>(settings);
  const cubeCameraRef = useRef<THREE.Camera | null>(null);

  // Sync local settings with props
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const updateSetting = useCallback((key: keyof SceneSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  }, [localSettings, onSettingsChange]);

  const handleReset = useCallback(() => {
    setLocalSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
    onResetSettings?.();
  }, [onSettingsChange, onResetSettings]);

  const handleCubeFaceClick = useCallback((face: string) => {
    // This will be handled by the parent component to change camera angle
    console.log('Cube face clicked:', face);
    // You can emit an event or call a callback here
  }, []);

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">3D Settings</h2>
        <p className="text-sm text-muted-foreground">Viewport configuration</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* View Mode */}
        <div className="space-y-2">
          <Label htmlFor="view-mode">View</Label>
          <Select
            value={localSettings.viewMode}
            onValueChange={(value: 'realistic' | 'orthographic' | 'wireframe') =>
              updateSetting('viewMode', value)
            }
          >
            <SelectTrigger id="view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realistic">Realistic</SelectItem>
              <SelectItem value="orthographic">Orthographic</SelectItem>
              <SelectItem value="wireframe">Wireframe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Level of Detail */}
        <div className="space-y-2">
          <Label htmlFor="lod">Level of detail</Label>
          <Select
            value={localSettings.levelOfDetail}
            onValueChange={(value: 'high' | 'medium' | 'low') =>
              updateSetting('levelOfDetail', value)
            }
          >
            <SelectTrigger id="lod">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Zoom Target */}
        <div className="space-y-2">
          <Label htmlFor="zoom-target">Zoom target</Label>
          <Select
            value={localSettings.zoomTarget}
            onValueChange={(value: 'center' | 'selection') =>
              updateSetting('zoomTarget', value)
            }
          >
            <SelectTrigger id="zoom-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="center">Center of screen</SelectItem>
              <SelectItem value="selection">Selection</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Invert Zoom */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="invert-zoom">Invert Zoom</Label>
            <p className="text-xs text-muted-foreground">Reverse zoom direction</p>
          </div>
          <Switch
            id="invert-zoom"
            checked={localSettings.invertZoom}
            onCheckedChange={(checked) => updateSetting('invertZoom', checked)}
          />
        </div>

        <Separator />

        {/* Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="shadows">Shadow</Label>
            <Switch
              id="shadows"
              checked={localSettings.shadows}
              onCheckedChange={(checked) => updateSetting('shadows', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="placement-preview">Placement preview</Label>
            <Switch
              id="placement-preview"
              checked={localSettings.placementPreview}
              onCheckedChange={(checked) => updateSetting('placementPreview', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="coordinate-system">Coordinate system</Label>
            <Switch
              id="coordinate-system"
              checked={localSettings.coordinateSystem}
              onCheckedChange={(checked) => updateSetting('coordinateSystem', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="camera-cube">Camera cube</Label>
            <Switch
              id="camera-cube"
              checked={localSettings.cameraCube}
              onCheckedChange={(checked) => updateSetting('cameraCube', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="grid">Grid</Label>
            <Switch
              id="grid"
              checked={localSettings.grid}
              onCheckedChange={(checked) => updateSetting('grid', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="fps-counter">FPS counter</Label>
            <Switch
              id="fps-counter"
              checked={localSettings.fpsCounter}
              onCheckedChange={(checked) => updateSetting('fpsCounter', checked)}
            />
          </div>
        </div>

        <Separator />

        {/* Interactive Cube Preview */}
        <div className="space-y-2">
          <Label>Camera Preview</Label>
          <div className="w-full h-48 bg-secondary/30 rounded-lg border border-border/50 overflow-hidden relative">
            <Canvas
              camera={{ position: [2, 2, 2], fov: 50 }}
              gl={{ antialias: true }}
            >
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={0.8} />
              <pointLight position={[-5, 5, -5]} intensity={0.3} />
              <InteractiveCube
                onFaceClick={handleCubeFaceClick}
                cameraRef={cubeCameraRef}
              />
              <OrbitControls
                enableZoom={false}
                enablePan={false}
                enableRotate={false}
              />
            </Canvas>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleReset}
        >
          Reset to Factory Settings
        </Button>
      </div>
    </div>
  );
}

