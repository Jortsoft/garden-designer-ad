import * as THREE from 'three';
import { GameConfig } from '../Managers/GameConfig';

const LOOK_SENSITIVITY = 0.005;
const MOVE_SPEED = 2;
const MAX_PITCH = Math.PI / 2 - 0.05;

export class CameraController {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly inputElement: HTMLElement;
    private readonly keyStates = new Map<string, boolean>();
    private readonly pointerPosition = new THREE.Vector2();
    private readonly moveDirection = new THREE.Vector3();
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly lookDirection = new THREE.Vector3();
    private readonly upAxis = new THREE.Vector3(0, 1, 0);
    private readonly rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly isEnabled = GameConfig.debugMode;

    private isRotating = false;
    private yaw = 0;
    private pitch = 0;

    constructor(camera: THREE.PerspectiveCamera, inputElement: HTMLElement) {
        this.camera = camera;
        this.inputElement = inputElement;
    }

    initialize() {
        this.applyDefaultCameraPose();
        this.syncCameraAngles();

        if (!this.isEnabled) {
            return;
        }

        this.logCameraPosition();
        this.logCameraOrientation();

        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.inputElement.addEventListener('contextmenu', this.handleContextMenu);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleWindowBlur);
    }

    update(deltaSeconds: number) {
        if (!this.isEnabled) {
            return;
        }

        this.moveDirection.set(0, 0, 0);

        this.forward.set(0, 0, -1).applyAxisAngle(this.upAxis, this.yaw);
        this.right.set(1, 0, 0).applyAxisAngle(this.upAxis, this.yaw);

        if (this.isKeyActive('KeyW')) {
            this.moveDirection.add(this.forward);
        }

        if (this.isKeyActive('KeyS')) {
            this.moveDirection.sub(this.forward);
        }

        if (this.isKeyActive('KeyD')) {
            this.moveDirection.add(this.right);
        }

        if (this.isKeyActive('KeyA')) {
            this.moveDirection.sub(this.right);
        }

        if (this.isKeyActive('KeyE')) {
            this.moveDirection.add(this.upAxis);
        }

        if (this.isKeyActive('KeyQ')) {
            this.moveDirection.sub(this.upAxis);
        }

        if (this.moveDirection.lengthSq() === 0) {
            return;
        }

        this.moveDirection.normalize();
        this.camera.position.addScaledVector(this.moveDirection, MOVE_SPEED * deltaSeconds);
        this.logCameraPosition();
    }

    dispose() {
        if (!this.isEnabled) {
            return;
        }

        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.inputElement.removeEventListener('contextmenu', this.handleContextMenu);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('blur', this.handleWindowBlur);
    }

    private syncCameraAngles() {
        this.rotationEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.pitch = this.rotationEuler.x;
        this.yaw = this.rotationEuler.y;
    }

    private applyDefaultCameraPose() {
        const { x, y, z, yaw, pitch } = GameConfig.defaultCameraPosition;

        this.camera.position.set(x, y, z);
        this.yaw = THREE.MathUtils.degToRad(yaw);
        this.pitch = THREE.MathUtils.clamp(
            THREE.MathUtils.degToRad(pitch),
            -MAX_PITCH,
            MAX_PITCH,
        );
        this.applyCameraRotation();
    }

    private applyCameraRotation() {
        this.rotationEuler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.rotationEuler);
    }

    private isKeyActive(code: string) {
        return this.keyStates.get(code) === true;
    }

    private logCameraPosition() {
        const { x, y, z } = this.camera.position;

        console.log(
            `Debug camera position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`,
        );
    }

    private logCameraOrientation() {
        const lookDirection = this.camera.getWorldDirection(this.lookDirection);
        const yawDegrees = THREE.MathUtils.radToDeg(this.yaw);
        const pitchDegrees = THREE.MathUtils.radToDeg(this.pitch);

        console.log(
            `Debug camera look: yaw=${yawDegrees.toFixed(2)}deg, pitch=${pitchDegrees.toFixed(2)}deg, dirX=${lookDirection.x.toFixed(3)}, dirY=${lookDirection.y.toFixed(3)}, dirZ=${lookDirection.z.toFixed(3)}`,
        );
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 2) {
            return;
        }

        event.preventDefault();
        this.isRotating = true;
        this.pointerPosition.set(event.clientX, event.clientY);
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (!this.isRotating) {
            return;
        }

        const deltaX = event.clientX - this.pointerPosition.x;
        const deltaY = event.clientY - this.pointerPosition.y;

        this.pointerPosition.set(event.clientX, event.clientY);

        if (deltaX === 0 && deltaY === 0) {
            return;
        }

        this.yaw -= deltaX * LOOK_SENSITIVITY;
        this.pitch -= deltaY * LOOK_SENSITIVITY;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);

        this.applyCameraRotation();
        this.logCameraOrientation();
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (event.button !== 2) {
            return;
        }

        this.isRotating = false;
    };

    private readonly handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        this.keyStates.set(event.code, true);
    };

    private readonly handleKeyUp = (event: KeyboardEvent) => {
        this.keyStates.set(event.code, false);
    };

    private readonly handleWindowBlur = () => {
        this.keyStates.clear();
        this.isRotating = false;
    };
}
