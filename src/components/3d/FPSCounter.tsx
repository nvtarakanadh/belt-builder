import { useFrame } from '@react-three/fiber';
import { useState, useRef } from 'react';

export function FPSCounter({ enabled }: { enabled: boolean }) {
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useFrame(() => {
    if (!enabled) return;
    
    frameCount.current++;
    const now = performance.now();
    const delta = now - lastTime.current;
    
    if (delta >= 1000) {
      setFps(Math.round((frameCount.current * 1000) / delta));
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  if (!enabled) return null;

  return (
    <div className="absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-mono z-50">
      FPS: {fps}
    </div>
  );
}

