import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { ConveyorBelt } from './ConveyorBelt';
import { Motor } from './Motor';
import { useState } from 'react';
import { Raycaster, Vector2, Vector3, MeshStandardMaterial } from 'three';
import { Model } from './Model';
import { getComponentMeta } from '@/lib/componentLibrary';

interface SceneProps {
  onSelectComponent: (id: string) => void;
  viewMode?: 'focused' | 'shopfloor';
  showGrid?: boolean;
  onDropComponent?: (type: string) => void;
  components?: Array<{ id: string; type: string; position: [number, number, number] }>;
  activeTool?: string;
}

export const Scene = ({ onSelectComponent, viewMode = 'focused', showGrid = true, onDropComponent, components = [], activeTool }: SceneProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);

  const handleSelect = (id: string, obj?: any) => {
    setSelectedId(id);
    if (obj) setSelectedObject(obj);
    onSelectComponent(id);
  };

  const cameraPosition: [number, number, number] = viewMode === 'shopfloor' 
    ? [40, 30, 40] 
    : [15, 12, 15];

  // Preview placement state
  const [preview, setPreview] = useState<{ type: string; position: [number, number, number]; valid: boolean } | null>(null);
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const getSnapPos = (point: Vector3): [number, number, number] => {
    // snap to 0.5m grid
    const step = 0.5;
    const sx = Math.round(point.x / step) * step;
    const sz = Math.round(point.z / step) * step;
    const y = point.y; // y decided by surface
    return [sx, y, sz];
  };

  return (
    <div 
      className="w-full h-full bg-background rounded-lg overflow-hidden border border-border"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-component')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const data = e.dataTransfer.getData('application/x-component');
        if (data) {
          try {
            const comp = JSON.parse(data);
            const type = (comp.type || comp.id || '').toString();
            onDropComponent?.(type);
            setPreview(null);
          } catch {}
        }
      }}
      onDragEnter={(e) => {
        const data = e.dataTransfer.getData('application/x-component');
        if (!data) return;
        const comp = JSON.parse(data);
        const type = (comp.type || comp.id || '').toString();
        setPreview({ type, position: [0, 0, 0], valid: false });
      }}
      onDragLeave={() => setPreview(null)}
      onMouseMove={(e) => {
        if (!preview) return;
        // compute ray from mouse to scene, intersect plane y=0 or conveyor top (~0.1)
        const rect = (e.target as HTMLDivElement).getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        // For simplicity, snap to floor (y ~ 0). In future, collect actual meshes to intersect
        // Here we just set y to 0 and snap x/z to grid
        const cam = (document.querySelector('canvas') as any)?._threeCamera || undefined;
        // Fallback: keep y at 0
        const p = new Vector3((mouse.x) * 10, 0, (mouse.y) * 10);
        const [sx, sy, sz] = getSnapPos(p);
        setPreview((prev) => prev ? { ...prev, position: [sx, 0, sz], valid: true } : prev);
      }}
    >
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={activeTool !== 'move' && activeTool !== 'rotate'}
          minDistance={5}
          maxDistance={50}
        />
        {selectedObject && (activeTool === 'move' || activeTool === 'rotate') && (
          <TransformControls object={selectedObject} mode={activeTool === 'move' ? 'translate' : 'rotate'} />
        )}

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

        {/* Built-in demo components */}
        <ConveyorBelt 
          position={[0, 0, 0]} 
          length={12}
          width={2}
          selected={selectedId === 'belt-1'}
          onSelect={(obj) => handleSelect('belt-1', obj)}
        />

        <Motor 
          position={[-6.5, 0, 1.5]}
          selected={selectedId === 'motor-1'}
          onSelect={(obj) => handleSelect('motor-1', obj)}
        />
        {/* Drag preview */}
        {preview && (
          <Model 
            path={getComponentMeta(preview.type as any)?.path}
            fallback={preview.type === 'motor' ? 'cylinder' : 'cube'}
            position={preview.position}
            transparent
            color={preview.valid ? '#22c55e' : '#ef4444'}
          />
        )}

        {/* Dynamically dropped components */}
        {components.map((c) => {
          if (c.type === 'belt') {
            return (
              <ConveyorBelt key={c.id} position={c.position} length={6} width={1.2} selected={selectedId === c.id} onSelect={(obj) => handleSelect(c.id, obj)} />
            );
          }
          if (c.type === 'motor') {
            return (
              <Motor key={c.id} position={[c.position[0], 0, c.position[2]]} selected={selectedId === c.id} onSelect={(obj) => handleSelect(c.id, obj)} />
            );
          }
          // Generic placeholder cube for other types
          return (
            <mesh key={c.id} position={c.position} onClick={(e) => handleSelect(c.id, e.object)}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#0ea5e9" />
            </mesh>
          );
        })}

        {/* Support legs */}
        {[-4, 0, 4].map((x, i) => (
          <group key={i} position={[x, -1, 0]}>
            <mesh position={[0, 0, 1.2]}>
              <boxGeometry args={[0.2, 2, 0.2]} />
              <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, -1.2]}>
              <boxGeometry args={[0.2, 2, 0.2]} />
              <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Additional rollers at ends */}
        <mesh position={[6, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 2.4, 16]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[-6, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 2.4, 16]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
        </mesh>

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
