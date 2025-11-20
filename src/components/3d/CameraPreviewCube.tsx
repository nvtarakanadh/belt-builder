import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from 'next-themes';

interface CameraPreviewCubeProps {
  onFaceClick: (face: string) => void;
  mainCamera?: THREE.Camera | null;
  mainControls?: any;
  theme?: string;
  onCubeRotate?: (rotation: { x: number; y: number; z: number }) => void;
}

// Interactive cube component
function InteractiveCube({ 
  onFaceClick,
  mainCamera,
  mainControls,
  theme = 'dark',
  onCubeRotate
}: CameraPreviewCubeProps) {
  const { camera, gl } = useThree();
  const cubeRef = useRef<THREE.Mesh>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const autoRotate = useRef(true);
  const [isHovered, setIsHovered] = useState(false);
  
  const isDark = theme === 'dark';
  const cubeColor = isDark ? (isHovered ? "#00d4ff" : "#00b4d8") : (isHovered ? "#0066cc" : "#0088dd");
  const textColor = isDark ? "#ffffff" : "#000000";

  // Sync cube rotation with main camera orientation
  useFrame(() => {
    if (!mainCamera || !cubeRef.current || isDragging.current || !mainControls) return;
    
    // Get camera position and target to calculate rotation
    const target = mainControls.target ? mainControls.target.clone() : new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3()
      .subVectors(mainCamera.position, target)
      .normalize();
    
    // Convert direction to spherical coordinates (phi, theta)
    const phi = Math.acos(Math.max(-1, Math.min(1, direction.y))); // Vertical angle
    const theta = Math.atan2(direction.x, direction.z); // Horizontal angle
    
    // Apply rotation to cube (smoothly interpolate)
    if (cubeRef.current) {
      const lerpFactor = 0.3; // Responsive tracking
      const targetX = phi - Math.PI / 2; // Adjust for cube orientation
      const targetY = theta;
      
      cubeRef.current.rotation.x += (targetX - cubeRef.current.rotation.x) * lerpFactor;
      cubeRef.current.rotation.y += (targetY - cubeRef.current.rotation.y) * lerpFactor;
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
      if (isDragging.current && cubeRef.current && mainCamera && mainControls) {
        const deltaX = e.clientX - lastMousePos.current.x;
        const deltaY = e.clientY - lastMousePos.current.y;
        
        // Rotate the cube
        cubeRef.current.rotation.y += deltaX * 0.01;
        cubeRef.current.rotation.x += deltaY * 0.01;
        
        // Clamp X rotation to prevent flipping
        cubeRef.current.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cubeRef.current.rotation.x));
        
        // Rotate the main camera to match cube rotation
        if (mainControls && mainCamera) {
          const target = mainControls.target ? mainControls.target.clone() : new THREE.Vector3(0, 0, 0);
          const distance = mainCamera.position.distanceTo(target);
          
          // Convert cube rotation to camera position using spherical coordinates
          // phi: vertical angle (from Y axis), theta: horizontal angle (around Y axis)
          const phi = cubeRef.current.rotation.x + Math.PI / 2; // Adjust for cube orientation
          const theta = cubeRef.current.rotation.y;
          
          // Calculate new camera position
          const x = target.x + distance * Math.sin(phi) * Math.cos(theta);
          const y = target.y + distance * Math.cos(phi);
          const z = target.z + distance * Math.sin(phi) * Math.sin(theta);
          
          const newPosition = new THREE.Vector3(x, y, z);
          mainCamera.position.copy(newPosition);
          mainCamera.lookAt(target);
          
          if (mainControls) {
            mainControls.target.copy(target);
            mainControls.update();
          }
          
          // Notify parent of rotation change
          if (onCubeRotate) {
            onCubeRotate({
              x: cubeRef.current.rotation.x,
              y: cubeRef.current.rotation.y,
              z: cubeRef.current.rotation.z
            });
          }
        }
        
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
          color={cubeColor}
          metalness={0.6}
          roughness={0.2}
          emissive={isHovered ? new THREE.Color(cubeColor) : new THREE.Color(0x000000)}
          emissiveIntensity={isHovered ? 0.4 : 0}
        />
      </mesh>
      
      {/* Add subtle edges for better visibility and user-friendliness */}
      <lineSegments>
        <edgesGeometry args={[boxGeometry]} />
        <lineBasicMaterial 
          color={isDark ? "#ffffff" : "#000000"} 
          opacity={0.4} 
          transparent 
          linewidth={2}
        />
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
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const isDark = mounted ? theme === 'dark' : true;
  const textColor = isDark ? "#ffffff" : "#000000";
  const bgColor = isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
  const borderColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
  
  return (
    <div className="absolute top-4 right-4 w-32 h-32 z-50 pointer-events-auto">
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
          theme={mounted ? theme : 'dark'}
          onCubeRotate={(rotation) => {
            // Optional: handle rotation updates if needed
          }}
        />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
        />
      </Canvas>
      
      {/* 2D Labels overlay - positioned absolutely over the cube */}
      <div className="absolute inset-0 pointer-events-none">
        {/* TOP label - top center */}
        <div 
          className="absolute top-1 left-1/2 transform -translate-x-1/2"
          style={{
            color: textColor,
            fontSize: '8px',
            fontWeight: 'bold',
            textShadow: isDark ? '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)' : '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.5)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            background: bgColor,
            padding: '2px 5px',
            borderRadius: '3px',
            border: `1px solid ${borderColor}`,
          }}
        >
          TOP
        </div>
        
        {/* LEFT label - left center */}
        <div 
          className="absolute top-1/2 left-1 transform -translate-y-1/2"
          style={{
            color: textColor,
            fontSize: '8px',
            fontWeight: 'bold',
            textShadow: isDark ? '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)' : '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.5)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            background: bgColor,
            padding: '2px 5px',
            borderRadius: '3px',
            border: `1px solid ${borderColor}`,
          }}
        >
          LEFT
        </div>
        
        {/* RIGHT label - right center */}
        <div 
          className="absolute top-1/2 right-1 transform -translate-y-1/2"
          style={{
            color: textColor,
            fontSize: '8px',
            fontWeight: 'bold',
            textShadow: isDark ? '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)' : '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.5)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            background: bgColor,
            padding: '2px 5px',
            borderRadius: '3px',
            border: `1px solid ${borderColor}`,
          }}
        >
          RIGHT
        </div>
      </div>
    </div>
  );
}

