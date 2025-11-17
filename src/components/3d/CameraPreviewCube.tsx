import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface CameraPreviewCubeProps {
  onFaceClick: (face: string) => void;
  mainCamera?: THREE.Camera | null;
  mainControls?: any;
}

// Interactive cube component
function InteractiveCube({ 
  onFaceClick,
  mainCamera,
  mainControls
}: CameraPreviewCubeProps) {
  const { camera, gl } = useThree();
  const cubeRef = useRef<THREE.Mesh>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const autoRotate = useRef(true);
  const [isHovered, setIsHovered] = useState(false);

  // Sync cube rotation with main camera orientation
  useFrame(() => {
    if (!mainCamera || !cubeRef.current || isDragging.current) return;
    
    // Calculate rotation based on camera direction
    const direction = new THREE.Vector3();
    mainCamera.getWorldDirection(direction);
    
    // Convert camera direction to cube rotation
    // The cube represents the view direction, so we rotate it to match
    const angleY = Math.atan2(direction.x, direction.z);
    const angleX = -Math.asin(Math.max(-1, Math.min(1, direction.y)));
    
    // Smoothly interpolate cube rotation to match camera
    if (cubeRef.current) {
      const targetY = angleY;
      const targetX = angleX * 0.5; // Scale down X rotation for better visual
      
      // Smooth interpolation
      cubeRef.current.rotation.y += (targetY - cubeRef.current.rotation.y) * 0.1;
      cubeRef.current.rotation.x += (targetX - cubeRef.current.rotation.x) * 0.1;
    }
  });

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
        e.stopPropagation();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging.current && cubeRef.current) {
        const deltaX = e.clientX - lastMousePos.current.x;
        const deltaY = e.clientY - lastMousePos.current.y;
        
        cubeRef.current.rotation.y += deltaX * 0.01;
        cubeRef.current.rotation.x += deltaY * 0.01;
        
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        e.stopPropagation();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging.current && cubeRef.current) {
        // Check if we clicked on a face (not dragged much)
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

    const handlePointerEnter = () => {
      setIsHovered(true);
      canvas.style.cursor = 'grab';
    };

    const handlePointerLeave = () => {
      setIsHovered(false);
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerenter', handlePointerEnter);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerenter', handlePointerEnter);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.style.cursor = 'default';
    };
  }, [camera, gl, onFaceClick]);

  // Auto-rotate when not dragging and not syncing with main camera
  useFrame((state, delta) => {
    if (cubeRef.current && autoRotate.current && !isDragging.current && !mainCamera) {
      cubeRef.current.rotation.y += delta * 0.3;
    }
  });

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <group>
      <mesh ref={cubeRef}>
        <primitive object={boxGeometry} />
        <meshStandardMaterial 
          color={isHovered ? "#00d4ff" : "#00b4d8"}
          metalness={0.3}
          roughness={0.4}
          emissive={isHovered ? new THREE.Color(0x00d4ff) : new THREE.Color(0x000000)}
          emissiveIntensity={isHovered ? 0.2 : 0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[boxGeometry]} />
        <lineBasicMaterial color="#ffffff" linewidth={1} />
      </lineSegments>
    </group>
  );
}

// Main component
export function CameraPreviewCube({ 
  onFaceClick, 
  mainCamera, 
  mainControls 
}: CameraPreviewCubeProps) {
  return (
    <div className="absolute bottom-4 right-4 w-32 h-32 bg-black/60 rounded-lg border border-border/50 overflow-hidden backdrop-blur-sm z-50">
      <Canvas
        camera={{ position: [2, 2, 2], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-5, 5, -5]} intensity={0.3} />
        <InteractiveCube 
          onFaceClick={onFaceClick}
          mainCamera={mainCamera}
          mainControls={mainControls}
        />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
        />
      </Canvas>
    </div>
  );
}

