import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from 'next-themes';

interface CameraPreviewCubeProps {
  onFaceClick: (face: string) => void;
  mainCamera?: THREE.Camera | null;
  mainControls?: any;
  theme?: string;
  onCubeRotate?: (rotation: { x: number; y: number; z: number }) => void;
}

// Compass label component
function CompassLabel({ 
  position, 
  label, 
  onClick, 
  isHovered, 
  textColor,
  onHoverChange
}: { 
  position: [number, number, number]; 
  label: string; 
  onClick: () => void;
  isHovered: boolean;
  textColor: string;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <group position={position}>
      <Text
        position={[0, 0, 0]}
        fontSize={0.16}
        color={isHovered ? '#222222' : textColor}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        outlineWidth={0.02}
        outlineColor="#ffffff"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(false);
        }}
      >
        {label}
      </Text>
    </group>
  );
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
  const cubeRef = useRef<THREE.Group>(null);
  const cubeMeshRef = useRef<THREE.Mesh>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const autoRotate = useRef(true);
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  const [hoveredCompass, setHoveredCompass] = useState<string | null>(null);
  
  const textColor = "#000000"; // Always black for readability
  const cubeColor = "#d3d3d3"; // Light gray
  const edgeColor = "#808080"; // Darker gray for edges
  const circleColor = "#999999"; // Light gray for circles (matching reference)
  const cubeSize = 0.5; // Size of the cube (half-extent) - slightly smaller for better visibility
  const compassRadius = 0.85; // Radius for compass labels (must be > cubeSize * sqrt(2) to avoid clipping)
  const circleY = 0.001; // Slightly above Y=0 to avoid z-fighting

  // Handle face click - rotate both main camera and cube
  const handleFaceClick = useCallback((faceName: string) => {
    // First, call the parent's onFaceClick to rotate the main camera
    onFaceClick(faceName);
    
    // Then, immediately rotate the cube to show that view
    if (!mainCamera || !mainControls || !cubeRef.current) return;
    
    const target = mainControls.target ? mainControls.target.clone() : new THREE.Vector3(0, 0, 0);
    const distance = mainCamera.position.distanceTo(target);
    
    // Calculate the camera position for this face view
    let newPosition: THREE.Vector3;
    switch (faceName) {
      case 'top':
        newPosition = new THREE.Vector3(target.x, target.y + distance, target.z);
        break;
      case 'bottom':
        newPosition = new THREE.Vector3(target.x, target.y - distance, target.z);
        break;
      case 'front':
        newPosition = new THREE.Vector3(target.x, target.y, target.z + distance);
        break;
      case 'back':
        newPosition = new THREE.Vector3(target.x, target.y, target.z - distance);
        break;
      case 'right':
        newPosition = new THREE.Vector3(target.x + distance, target.y, target.z);
        break;
      case 'left':
        newPosition = new THREE.Vector3(target.x - distance, target.y, target.z);
        break;
      default:
        return;
    }
    
    // Set cube rotation to match this view (immediate, no lerp)
    // Use the same logic as the sync function to ensure consistency
    if (cubeRef.current) {
      let targetRotationX = 0;
      let targetRotationY = 0;
      
      switch (faceName) {
        case 'top':
          targetRotationX = -Math.PI / 2;
          targetRotationY = 0;
          break;
        case 'bottom':
          targetRotationX = Math.PI / 2;
          targetRotationY = 0;
          break;
        case 'front':
          targetRotationX = 0;
          targetRotationY = Math.PI;
          break;
        case 'back':
          targetRotationX = 0;
          targetRotationY = 0;
          break;
        case 'right':
          targetRotationX = 0;
          targetRotationY = -Math.PI / 2;
          break;
        case 'left':
          targetRotationX = 0;
          targetRotationY = Math.PI / 2;
          break;
      }
      
      cubeRef.current.rotation.x = targetRotationX;
      cubeRef.current.rotation.y = targetRotationY;
    }
  }, [onFaceClick, mainCamera, mainControls]);

  // Sync cube rotation with main camera orientation
  useFrame(() => {
    if (!mainCamera || !cubeRef.current || isDragging.current || !mainControls) return;
    
    // Get camera position and target to calculate rotation
    const target = mainControls.target ? mainControls.target.clone() : new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3()
      .subVectors(mainCamera.position, target)
      .normalize();
    
    // Check if camera is in an orthographic view (top, front, right, etc.)
    // by checking which axis the camera is most aligned with
    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);
    const absZ = Math.abs(direction.z);
    
    let targetRotationX = 0;
    let targetRotationY = 0;
    
    // Determine which orthographic view we're closest to
    // Use a threshold to detect orthographic views (when one axis dominates)
    const threshold = 0.7; // If one axis component is > 0.7, consider it an orthographic view
    
    if (absY > threshold && absY > absX && absY > absZ) {
      // Camera is primarily aligned with Y axis (top or bottom view)
      if (direction.y > 0) {
        // Top view - camera looking down, cube should show top face
        // Top face is on +Y, so rotate to show it: X = -90°, Y = 0°
        targetRotationX = -Math.PI / 2;
        targetRotationY = 0;
      } else {
        // Bottom view
        targetRotationX = Math.PI / 2;
        targetRotationY = 0;
      }
    } else if (absX > threshold && absX > absY && absX > absZ) {
      // Camera is primarily aligned with X axis (right or left view)
      if (direction.x > 0) {
        // Right view - camera looking from +X, cube should show right face
        // Right face is on +X, so rotate: X = 0°, Y = -90°
        targetRotationX = 0;
        targetRotationY = -Math.PI / 2;
      } else {
        // Left view
        targetRotationX = 0;
        targetRotationY = Math.PI / 2;
      }
    } else if (absZ > threshold && absZ > absX && absZ > absY) {
      // Camera is primarily aligned with Z axis (front or back view)
      if (direction.z > 0) {
        // Front view - camera looking from +Z, cube should show front face
        // Front face is on -Z, so rotate: X = 0°, Y = 180° (or -180°)
        targetRotationX = 0;
        targetRotationY = Math.PI;
      } else {
        // Back view
        targetRotationX = 0;
        targetRotationY = 0;
      }
    } else {
      // Not in a pure orthographic view, use spherical coordinates
      const phi = Math.acos(Math.max(-1, Math.min(1, direction.y)));
      const theta = Math.atan2(direction.x, direction.z);
      targetRotationX = phi - Math.PI / 2;
      targetRotationY = theta;
    }
    
    // Apply rotation to cube (smoothly interpolate)
    if (cubeRef.current) {
      const lerpFactor = 0.3; // Responsive tracking
      
      // Normalize angles to [-PI, PI] range
      const normalizeAngle = (angle: number) => {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
      };
      
      // Calculate shortest rotation path
      let deltaX = normalizeAngle(targetRotationX - cubeRef.current.rotation.x);
      let deltaY = normalizeAngle(targetRotationY - cubeRef.current.rotation.y);
      
      cubeRef.current.rotation.x += deltaX * lerpFactor;
      cubeRef.current.rotation.y += deltaY * lerpFactor;
    }
  });

  // Handle compass direction clicks
  const handleCompassClick = (direction: 'N' | 'E' | 'S' | 'W') => {
    if (!mainCamera || !mainControls || !cubeRef.current) return;
    
    const target = mainControls.target ? mainControls.target.clone() : new THREE.Vector3(0, 0, 0);
    const distance = mainCamera.position.distanceTo(target);
    
    // Calculate camera position for each direction
    let newPosition: THREE.Vector3;
    switch (direction) {
      case 'N': // North - looking from positive Z
        newPosition = new THREE.Vector3(target.x, target.y + distance * 0.5, target.z + distance);
        break;
      case 'E': // East - looking from positive X
        newPosition = new THREE.Vector3(target.x + distance, target.y + distance * 0.5, target.z);
        break;
      case 'S': // South - looking from negative Z
        newPosition = new THREE.Vector3(target.x, target.y + distance * 0.5, target.z - distance);
        break;
      case 'W': // West - looking from negative X
        newPosition = new THREE.Vector3(target.x - distance, target.y + distance * 0.5, target.z);
        break;
      default:
        return;
    }
    
    // Smoothly animate camera to new position
    const startPosition = mainCamera.position.clone();
    const startTime = Date.now();
    const duration = 500; // 500ms animation
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      
      mainCamera.position.lerpVectors(startPosition, newPosition, eased);
      mainCamera.lookAt(target);
      
      if (mainControls) {
        mainControls.target.copy(target);
        mainControls.update();
      }
      
      // Update cube rotation to match
      if (cubeRef.current) {
        const direction = new THREE.Vector3()
          .subVectors(mainCamera.position, target)
          .normalize();
        const phi = Math.acos(Math.max(-1, Math.min(1, direction.y)));
        const theta = Math.atan2(direction.x, direction.z);
        cubeRef.current.rotation.x = phi - Math.PI / 2;
        cubeRef.current.rotation.y = theta;
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // Handle mouse interactions
  useEffect(() => {
    const canvas = gl.domElement;
    
    const handlePointerDown = (e: PointerEvent) => {
      if (!cubeMeshRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObject(cubeMeshRef.current);
      
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
      } else if (cubeMeshRef.current) {
        // Check for face hover
        const rect = canvas.getBoundingClientRect();
        mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.current.setFromCamera(mouse.current, camera);
        const intersects = raycaster.current.intersectObject(cubeMeshRef.current);
        
        if (intersects.length > 0) {
          const face = intersects[0].face;
          if (face) {
            const normal = face.normal.clone();
            if (cubeMeshRef.current.matrixWorld) {
              normal.transformDirection(cubeMeshRef.current.matrixWorld);
            }
            
            const absX = Math.abs(normal.x);
            const absY = Math.abs(normal.y);
            const absZ = Math.abs(normal.z);
            
            let faceName: string | null = null;
            if (absX > absY && absX > absZ) {
              faceName = normal.x > 0 ? 'right' : 'left';
            } else if (absY > absX && absY > absZ) {
              faceName = normal.y > 0 ? 'top' : 'bottom';
            } else {
              faceName = normal.z > 0 ? 'back' : 'front';
            }
            
            setHoveredFace(faceName);
            canvas.style.cursor = 'pointer';
          }
        } else {
          setHoveredFace(null);
          canvas.style.cursor = 'default';
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging.current && cubeMeshRef.current) {
        // Check if we clicked on a face (not dragged much)
        const moved = Math.abs(e.clientX - lastMousePos.current.x) < 5 && 
                     Math.abs(e.clientY - lastMousePos.current.y) < 5;
        
        if (moved) {
          const rect = canvas.getBoundingClientRect();
          mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          
          raycaster.current.setFromCamera(mouse.current, camera);
          const intersects = raycaster.current.intersectObject(cubeMeshRef.current);
          
          if (intersects.length > 0) {
            const face = intersects[0].face;
            if (face) {
              // Transform normal to world space
              const normal = face.normal.clone();
              if (cubeMeshRef.current.matrixWorld) {
                normal.transformDirection(cubeMeshRef.current.matrixWorld);
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
              
              handleFaceClick(faceName);
            }
          }
        }
        
        isDragging.current = false;
        autoRotate.current = true;
        canvas.style.cursor = 'default';
      }
    };

    const handlePointerEnter = () => {
      canvas.style.cursor = 'grab';
    };

    const handlePointerLeave = () => {
      setHoveredFace(null);
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
  }, [camera, gl, onFaceClick, mainCamera, mainControls, onCubeRotate]);

  // Auto-rotate when not dragging and not syncing with main camera
  useFrame((state, delta) => {
    if (cubeRef.current && autoRotate.current && !isDragging.current && !mainCamera) {
      cubeRef.current.rotation.y += delta * 0.3;
    }
  });

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(cubeSize * 2, cubeSize * 2, cubeSize * 2), [cubeSize]);
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(boxGeometry), [boxGeometry]);

  // Create circle geometries
  const innerCircleGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * (compassRadius - 0.05),
        circleY,
        Math.sin(angle) * (compassRadius - 0.05)
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [compassRadius, circleY]);

  const outerCircleGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * (compassRadius + 0.05),
        circleY,
        Math.sin(angle) * (compassRadius + 0.05)
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [compassRadius, circleY]);

  // Face label positions (relative to cube center, slightly outside)
  const faceLabelOffset = cubeSize + 0.05;

  return (
    <group ref={cubeRef}>
      {/* Main cube - solid, light gray, semi-transparent */}
      <mesh ref={cubeMeshRef}>
        <primitive object={boxGeometry} />
        <meshStandardMaterial 
          color={cubeColor}
          opacity={0.7}
          transparent={true}
          metalness={0.0}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Darker edges */}
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial 
          color={edgeColor} 
          linewidth={1.5}
        />
      </lineSegments>
      
      {/* Face labels - Top, Front, Right */}
      <group>
        {/* Top face label */}
        <Text
          position={[0, faceLabelOffset, 0]}
          fontSize={0.18}
          color={hoveredFace === 'top' ? '#222222' : textColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.02}
          outlineColor="#ffffff"
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            handleFaceClick('top');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredFace('top');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredFace(null);
          }}
        >
          TOP
        </Text>
        
        {/* Front face label */}
        <Text
          position={[0, 0, -faceLabelOffset]}
          fontSize={0.18}
          color={hoveredFace === 'front' ? '#222222' : textColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.02}
          outlineColor="#ffffff"
          onClick={(e) => {
            e.stopPropagation();
            handleFaceClick('front');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredFace('front');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredFace(null);
          }}
        >
          FRONT
        </Text>
        
        {/* Right face label */}
        <Text
          position={[faceLabelOffset, 0, 0]}
          fontSize={0.18}
          color={hoveredFace === 'right' ? '#222222' : textColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.02}
          outlineColor="#ffffff"
          rotation={[0, Math.PI / 2, 0]}
          onClick={(e) => {
            e.stopPropagation();
            handleFaceClick('right');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredFace('right');
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredFace(null);
          }}
        >
          RIGHT
        </Text>
      </group>
      
      {/* Concentric circles - thin lines (horizontal, in XZ plane) */}
      <group>
        {/* Inner circle */}
        <lineLoop geometry={innerCircleGeometry}>
          <lineBasicMaterial color={circleColor} linewidth={1} />
        </lineLoop>
        
        {/* Outer circle */}
        <lineLoop geometry={outerCircleGeometry}>
          <lineBasicMaterial color={circleColor} linewidth={1} />
        </lineLoop>
      </group>
      
      {/* Compass labels - N, E, S, W */}
      <group>
        <CompassLabel
          position={[0, circleY + 0.01, -compassRadius]}
          label="N"
          onClick={() => handleCompassClick('N')}
          isHovered={hoveredCompass === 'N'}
          textColor={textColor}
          onHoverChange={(hovered) => setHoveredCompass(hovered ? 'N' : null)}
        />
        <CompassLabel
          position={[compassRadius, circleY + 0.01, 0]}
          label="E"
          onClick={() => handleCompassClick('E')}
          isHovered={hoveredCompass === 'E'}
          textColor={textColor}
          onHoverChange={(hovered) => setHoveredCompass(hovered ? 'E' : null)}
        />
        <CompassLabel
          position={[0, circleY + 0.01, compassRadius]}
          label="S"
          onClick={() => handleCompassClick('S')}
          isHovered={hoveredCompass === 'S'}
          textColor={textColor}
          onHoverChange={(hovered) => setHoveredCompass(hovered ? 'S' : null)}
        />
        <CompassLabel
          position={[-compassRadius, circleY + 0.01, 0]}
          label="W"
          onClick={() => handleCompassClick('W')}
          isHovered={hoveredCompass === 'W'}
          textColor={textColor}
          onHoverChange={(hovered) => setHoveredCompass(hovered ? 'W' : null)}
        />
      </group>
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
  
  return (
    <div className="absolute top-4 right-4 w-32 h-32 z-50 pointer-events-auto">
      <Canvas
        camera={{ position: [1.5, 1.5, 1.5], fov: 45, near: 0.1, far: 10 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[5, 5, 5]} intensity={0.6} />
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
    </div>
  );
}
