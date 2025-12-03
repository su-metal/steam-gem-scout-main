import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Sparkles, Html } from "@react-three/drei";
import * as THREE from "three";
import { VIBES } from "./constants";
import { VibeData, VibeType } from './types';

interface GlobeProps {
  onVibeChange: (vibe: VibeData) => void;
  currentVibe: VibeData | null;
}

interface VibeMarkerProps {
  vibe: VibeData;
  isActive: boolean;
  onClick: () => void;
}

// Reusable component for the Vibe Marker on the globe
const VibeMarker: React.FC<VibeMarkerProps> = ({
  vibe,
  isActive,
  onClick
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Animate scale based on active state
  useFrame((state) => {
    if (meshRef.current) {
      const targetScale = isActive ? 1.4 : 1.0;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
      // ラベル用の円盤をカメラに向ける
      meshRef.current.lookAt(state.camera.position);
    }

    if (ringRef.current) {
      // 外側リングもカメラ方向に向ける
      ringRef.current.lookAt(state.camera.position);
    }
  });

  return (
    <group position={new THREE.Vector3(...vibe.position)}>
      {/* The glowing orb */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <circleGeometry args={[0.25, 32]} />
        <meshBasicMaterial
          color={isActive ? vibe.accentColor : '#ffffff'}
          transparent
          opacity={isActive ? 0.9 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer ring for active state */}
      {isActive && (
        <mesh ref={ringRef}>
          <ringGeometry args={[0.3, 0.32, 32]} />
          <meshBasicMaterial
            color={vibe.accentColor}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Text Label floating near the marker */}
      <Html
        position={[0, 0.4, 0]}
        center
        distanceFactor={10}
        occlude={false}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`
            font-display font-bold text-sm tracking-widest uppercase transition-all duration-300
            ${isActive ? 'text-white text-opacity-100 scale-110 blur-none' : 'text-gray-400 text-opacity-60 scale-90 blur-[1px]'}
          `}
          style={{ textShadow: isActive ? `0 0 20px ${vibe.color}` : 'none' }}
        >
          {vibe.label}
        </div>
      </Html>
    </group>
  );
};


// The main sphere object
const DataSphere = () => {
  return (
    <group>
      {/* Core dark sphere */}
      <mesh>
        <sphereGeometry args={[1.95, 64, 64]} />
        <meshPhysicalMaterial
          color="#000000"
          roughness={0.7}
          metalness={0.2}
          clearcoat={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Wireframe lattice */}
      <mesh>
        <icosahedronGeometry args={[2, 4]} />
        <meshBasicMaterial
          color="#1e1b4b" // Dark indigo 
          wireframe
          transparent
          opacity={0.15}
        />
      </mesh>

      {/* Floating particles inside/around */}
      <Sparkles count={150} scale={2.5} size={2} speed={0.4} opacity={0.5} color="#4c1d95" />
    </group>
  );
};

const GlobeScene = ({ onVibeChange, currentVibe }: GlobeProps) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  // Logic to determine which vibe is closest to the camera view
  useFrame(() => {
    if (!controlsRef.current) return;

    // Get the camera's direction
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    // We want the node that is closest to "facing" the camera. 
    // Since the markers are on a sphere at (0,0,0), the marker facing the camera 
    // will have a position vector that roughly matches the INVERSE of the camera direction (since camera looks at 0,0,0).
    // Actually simpler: Determine distance from camera position to marker position.

    let closestVibe = null;
    let minDistance = Infinity;

    VIBES.forEach((vibe) => {
      const markerPos = new THREE.Vector3(...vibe.position);
      // Apply the rotation of the scene? 
      // No, the camera moves around the scene with OrbitControls. 
      // So marker world position is constant, Camera world position changes.

      const distance = camera.position.distanceTo(markerPos);

      if (distance < minDistance) {
        minDistance = distance;
        closestVibe = vibe;
      }
    });

    if (closestVibe && closestVibe !== currentVibe) {
      // Only trigger update if it's "significantly" close or focused?
      // For this UI, instantaneous snap feels better for responsiveness.
      // To prevent jitter, we could add a debounce in parent, but here we just emit.
      onVibeChange(closestVibe as VibeData);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#4f46e5" />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#ec4899" />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      <group>
        <DataSphere />
        {VIBES.map((vibe) => (
          <VibeMarker
            key={vibe.id}
            vibe={vibe}
            isActive={currentVibe?.id === vibe.id}
            onClick={() => {
              // Optional: animate camera to this position on click
              // For now, we rely on rotation
            }}
          />
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={false}
        rotateSpeed={0.5}
        autoRotate={true}
        autoRotateSpeed={0.5}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI - Math.PI / 4}
      />
    </>
  );
};

const VibeGlobe = (props: GlobeProps) => {
  return (
    <div className="w-full h-full absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }}>
        <fog attach="fog" args={['#030305', 5, 20]} />
        <GlobeScene {...props} />
      </Canvas>
    </div>
  );
};

export default VibeGlobe;