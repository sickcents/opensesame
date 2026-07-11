"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FloorPicker, type FloorPickerFloor } from "@/app/components/floor-picker";

type Point = { x: number; y: number };

type Equip3D = {
  id: string;
  xMeters: number;
  yMeters: number;
  widthM: number;
  depthM: number;
  heightM: number;
  typeName: string;
};

type Space3D = { id: string; name: string; points: Point[] };
type Safety3D = { id: string; kind: string; xMeters: number; yMeters: number };

function FlatPolygon({
  points,
  color,
  opacity,
}: {
  points: Point[];
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    // Negate y so that, after the face-up rotation below, world Z ends up
    // equal to +y — matching how Equipment/Safety Equipment positions are
    // placed directly (position.z = yMeters, unaffected by rotation).
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
    return new THREE.ShapeGeometry(shape);
  }, [points]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <meshStandardMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Floor3DView({
  floorWidthM,
  floorHeightM,
  equipment,
  rooms,
  areas,
  safetyEquipment,
  floors,
  currentFloorId,
}: {
  floorWidthM: number;
  floorHeightM: number;
  equipment: Equip3D[];
  rooms: Space3D[];
  areas: Space3D[];
  safetyEquipment: Safety3D[];
  floors: FloorPickerFloor[];
  currentFloorId: string;
}) {
  const maxSpan = Math.max(floorWidthM, floorHeightM);

  return (
    <div className="relative h-[70vh] w-full overflow-hidden rounded-sm border border-[var(--color-grid)] bg-[#eef3f5]">
      <Canvas
        shadows
        camera={{
          position: [floorWidthM * 0.7, maxSpan * 0.9, floorHeightM * 1.3],
          fov: 45,
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[maxSpan, maxSpan * 1.5, maxSpan]} intensity={0.9} castShadow />

        <group position={[-floorWidthM / 2, 0, -floorHeightM / 2]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[floorWidthM / 2, 0, floorHeightM / 2]}
            receiveShadow
          >
            <planeGeometry args={[floorWidthM, floorHeightM]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>

          {rooms.map((r) => (
            <FlatPolygon key={r.id} points={r.points} color="#1b4b6b" opacity={0.18} />
          ))}
          {areas.map((a) => (
            <FlatPolygon key={a.id} points={a.points} color="#4c7191" opacity={0.18} />
          ))}

          {equipment.map((e) => (
            <mesh
              key={e.id}
              position={[e.xMeters, e.heightM / 2, e.yMeters]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[e.widthM, e.heightM, e.depthM]} />
              <meshStandardMaterial color="#4c7191" />
            </mesh>
          ))}

          {safetyEquipment.map((s) => (
            <mesh key={s.id} position={[s.xMeters, 0.02, s.yMeters]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[Math.max(maxSpan / 60, 0.1), 20]} />
              <meshStandardMaterial color="#e2572b" />
            </mesh>
          ))}
        </group>

        <OrbitControls makeDefault />
      </Canvas>
      <FloorPicker floors={floors} currentFloorId={currentFloorId} />
    </div>
  );
}
