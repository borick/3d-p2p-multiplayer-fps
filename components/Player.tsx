import React, { useEffect, useRef } from 'react';
import { useSphere } from '@react-three/cannon';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster, Euler } from 'three';
import { useGameStore } from '../store/gameStore';
import { PLAYER_RADIUS } from '../constants';

const SPEED = 10;
const JUMP_FORCE = 7;

export const LocalPlayer = () => {
  const { camera, scene, gl } = useThree();
  const { updateMyState, players, myId, sendHit } = useGameStore();
  
  // Physics Body
  const [ref, api] = useSphere(() => ({ 
    mass: 1, 
    type: 'Dynamic',
    position: [0, 8, 0], // Spawn higher to avoid floor clipping
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
        const currentVec = new Vector3(position.current[0], position.current[1], position.current[2]);
        const serverVec = new Vector3(myState.position.x, myState.position.y, myState.position.z);
        const dist = currentVec.distanceTo(serverVec);
        
        if (dist > 8) {
            api.position.set(myState.position.x, myState.position.y, myState.position.z);
            api.velocity.set(0, 0, 0);
        }
    }
  }, [players[myId]?.position, players[myId]?.health, api.position, api.velocity, myId]);


  // Input Handling
  const keys = useRef<{ [key: string]: boolean }>({});
  const clickRequest = useRef(false);
  const isLocked = useRef(false);
  const cameraEuler = useRef(new Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    
    const handleMouseDown = (e: MouseEvent) => {
        if (document.pointerLockElement === gl.domElement && e.button === 0) {
            clickRequest.current = true;
        }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement === gl.domElement) {
            // Update camera rotation manually
            // Sensitivity
            const sensitivity = 0.002;
            
            cameraEuler.current.setFromQuaternion(camera.quaternion);
            
            cameraEuler.current.y -= e.movementX * sensitivity;
            cameraEuler.current.x -= e.movementY * sensitivity;
            
            // Clamp pitch (up/down) to avoid flipping
            cameraEuler.current.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraEuler.current.x));
            
            camera.quaternion.setFromEuler(cameraEuler.current);
        }
    };

    const handleLockChange = () => {
        isLocked.current = document.pointerLockElement === gl.domElement;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handleLockChange);
    
    // Initial check
    handleLockChange();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handleLockChange);
    };
  }, [gl.domElement, camera]);

  const raycaster = useRef(new Raycaster());

  useFrame(() => {
    if (!ref.current) return;

    // --- Movement ---
    const { KeyW, KeyS, KeyA, KeyD, Space } = keys.current;
    
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const direction = new Vector3();
    
    if (isLocked.current) {
        if (KeyW) direction.add(forward);
        if (KeyS) direction.sub(forward);
        if (KeyA) direction.sub(right);
        if (KeyD) direction.add(right);
    }

    direction.normalize().multiplyScalar(SPEED);

    // Apply velocity
    api.velocity.set(direction.x, velocity.current[1], direction.z);

    // Jump
    if (Space && isLocked.current && Math.abs(velocity.current[1]) < 0.1) {
      api.velocity.set(velocity.current[0], JUMP_FORCE, velocity.current[2]);
    }

    // --- Camera Position Sync ---
    camera.position.set(position.current[0], position.current[1] + 0.6, position.current[2]);

    // --- Shooting ---
    if (clickRequest.current) {
        clickRequest.current = false;
        
        // Raycast from center of screen
        raycaster.current.setFromCamera({ x: 0, y: 0 }, camera);
        
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        
        for (let hit of intersects) {
            let obj = hit.object;
            let foundTarget = false;
            
            for (let i = 0; i < 5; i++) {
                if (obj.userData && obj.userData.id) {
                    if (obj.userData.id !== myId) {
                        sendHit(obj.userData.id);
                        foundTarget = true;
                    }
                    break;
                }
                if (!obj.parent) break;
                obj = obj.parent as any;
            }
            
            if (foundTarget) break; 
        }
    }

    // --- Update Network State ---
    const lookAtVector = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const yaw = Math.atan2(-lookAtVector.x, -lookAtVector.z);

    updateMyState({ x: position.current[0], y: position.current[1], z: position.current[2] }, yaw);
  });

  return (
    <mesh ref={ref as any}>
        <sphereGeometry args={[PLAYER_RADIUS, 16, 16]} />
        <meshBasicMaterial color="white" visible={false} />
    </mesh>
  );
};
