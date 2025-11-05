import { useRef } from 'react';
import { Mesh } from 'three';
import { Html } from '@react-three/drei';
import { Zap } from 'lucide-react';

interface MotorProps {
  position: [number, number, number];
  selected?: boolean;
  onSelect?: () => void;
}

export const Motor = ({ position, selected = false, onSelect }: MotorProps) => {
  const meshRef = useRef<Mesh>(null);

  return (
    <group position={position} onClick={onSelect}>
      {/* Motor body */}
      <mesh ref={meshRef} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.4, 0.4, 1.2, 16]} />
        <meshStandardMaterial 
          color={selected ? "#00b4d8" : "#1a1a1a"} 
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Motor shaft */}
      <mesh position={[0.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.8, 16]} />
        <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Motor mount */}
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[0.6, 0.2, 0.8]} />
        <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Info tag */}
      {selected && (
        <Html position={[0, 1, 0]} center>
          <div className="bg-card border border-primary rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">Drive Motor - 2.2kW</span>
          </div>
        </Html>
      )}
    </group>
  );
};
