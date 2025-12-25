import React, { useEffect, useRef } from 'react';
import { useSphere } from '@react-three/cannon';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster } from 'three';
import { PointerLockControls } from '@react-three/drei';
import { useGameStore } from '../store/gameStore';
import { PLAYER_RADIUS } from '../constants';

const SPEED = 8;
const JUMP_FORCE = 6;

export const LocalPlayer = () => {
  const { camera, scene, gl } = useThree();
  const { updateMyState, players, myId, sendHit } = useGameStore();
  
  // Physics Body
  const [ref, api] = useSphere(() => ({ 
    mass: 1, 
    position: [0, 5, 0],
    args: [PLAYER_RADIUS],
    fixedRotation: true,
    material: { friction: 0, restitution: 0 }
  }));

  const velocity = useRef([0, 0, 0]);
  const position = useRef([0, 0, 0]);
  
  // Sync physics state
  useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api.velocity]);
  useEffect(() => api.position.subscribe((p) => {
    position.current = p;
  }), [api.position]);

  // Handle Respawn/Teleport from Server
  useEffect(() => {
    const myState = players[myId];
    if (myState) {
        const dist = new Vector3(position.current[0], position.current[1], position.current[2])
            .distanceTo(new Vector3(myState.position.x, myState.position.y, myState.position.z));
        
        if (dist > 5) {
            api.position.set(myState.position.x, myState.position.y, myState.position.z);
            api.velocity.set(0, 0, 0);
        }
    }
  }, [players[myId]?.position, api.position, api.velocity, myId]);


  // Input Handling
  const keys = useRef<{ [key: string]: boolean }>({});
  const clickRequest = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const handleMouseDown = () => { 
        // Only trigger shoot if the pointer is actually locked to the game
        if (document.pointerLockElement === gl.domElement) {
            clickRequest.current = true; 
        }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [gl.domElement]);

  const raycaster = useRef(new Raycaster());

  useFrame(() => {
    if (!ref.current) return;

    // Only move if locked
    const isLocked = document.pointerLockElement === gl.domElement;
    
    // --- Movement ---
    const { KeyW, KeyS, KeyA, KeyD, Space } = keys.current;
    
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const direction = new Vector3();
    if (isLocked) {
        if (KeyW) direction.add(forward);
        if (KeyS) direction.sub(forward);
        if (KeyA) direction.sub(right);
        if (KeyD) direction.add(right);
    }

    direction.normalize().multiplyScalar(SPEED);

    api.velocity.set(direction.x, velocity.current[1], direction.z);

    if (Space && isLocked && Math.abs(velocity.current[1]) < 0.05) {
      api.velocity.set(velocity.current[0], JUMP_FORCE, velocity.current[2]);
    }

    // --- Camera Sync ---
    camera.position.set(position.current[0], position.current[1] + 0.6, position.current[2]);

    // --- Shooting ---
    if (clickRequest.current) {
        clickRequest.current = false;
        
        // Raycast
        raycaster.current.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        
        for (let hit of intersects) {
            let obj = hit.object;
            while (obj) {
                if (obj.userData && obj.userData.id && obj.userData.id !== myId) {
                    sendHit(obj.userData.id);
                    break;
                }
                obj = obj.parent as any;
            }
            if (!obj?.userData?.id) {
               break; 
            }
        }
    }

    // --- Update Network State ---
    const lookAtVector = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const yaw = Math.atan2(-lookAtVector.x, -lookAtVector.z);

    updateMyState({ x: position.current[0], y: position.current[1], z: position.current[2] }, yaw);
  });

  return (
    <>
        <mesh ref={ref as any}>
            <sphereGeometry args={[PLAYER_RADIUS, 16, 16]} />
            <meshBasicMaterial visible={false} />
        </mesh>
        
        {/* 
           PointerLockControls from drei.
           We assume the user must click the canvas (game) to start locking.
           By stopping propagation on UI elements, we prevent accidental locking/relocking 
           during UI interaction which causes the "exited lock before request completed" error.
        */}
        <PointerLockControls makeDefault />
    </>
  );
};
