import { useRef } from 'react';
import { Mesh } from 'three';
import { Html } from '@react-three/drei';
import { Info } from 'lucide-react';

interface ConveyorBeltProps {
  position: [number, number, number];
  length?: number;
  width?: number;
  selected?: boolean;
  onSelect?: () => void;
}

export const ConveyorBelt = ({ 
  position, 
  length = 10, 
  width = 2, 
  selected = false,
  onSelect 
}: ConveyorBeltProps) => {
  const meshRef = useRef<Mesh>(null);

  return (
    <group position={position} onClick={onSelect}>
      {/* Main belt surface */}
      <mesh ref={meshRef} position={[0, 0.1, 0]}>
        <boxGeometry args={[length, 0.2, width]} />
        <meshStandardMaterial 
          color={selected ? "#00b4d8" : "#2b2b2b"} 
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Belt frame */}
      <mesh position={[0, -0.1, width / 2 + 0.1]}>
        <boxGeometry args={[length, 0.3, 0.2]} />
        <meshStandardMaterial color="#444444" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.1, -width / 2 - 0.1]}>
        <boxGeometry args={[length, 0.3, 0.2]} />
        <meshStandardMaterial color="#444444" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Rollers */}
      {Array.from({ length: Math.floor(length / 2) + 1 }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + i * 2, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, width + 0.4, 16]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Info tag */}
      {selected && (
        <Html position={[0, 1, 0]} center>
          <div className="bg-card border border-primary rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Conveyor Belt Assembly</span>
          </div>
        </Html>
      )}
    </group>
  );
};
