import * as THREE from 'three';
import { GameConfig } from '../Managers/GameConfig';

const KEYBOARD_PAN_SPEED = 3.2;
const DRAG_PAN_SPEED = 0.0032;
const WHEEL_ZOOM_SPEED = 0.004;
const PINCH_ZOOM_SPEED = 0.004;
const LOOK_SENSITIVITY = 0.005;
const MIN_CAMERA_HEIGHT = 0.8;
const MOUSE_PAN_BUTTON = 0;
const MOUSE_LOOK_BUTTON = 2;
const MAX_PITCH = Math.PI / 2 - 0.05;

type ScreenPointBlocker = (screenX: number, screenY: number) => boolean;

export class CameraController {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly inputElement: HTMLElement;
    private readonly shouldBlockInput: ScreenPointBlocker;
    private readonly keyStates = new Map<string, boolean>();
    private readonly pointerPosition = new THREE.Vector2();
    private readonly touchPointers = new Map<number, THREE.Vector2>();
    private readonly moveDirection = new THREE.Vector3();
    private readonly horizontalForward = new THREE.Vector3();
    private readonly horizontalRight = new THREE.Vector3();
    private readonly lookDirection = new THREE.Vector3();
    private readonly upAxis = new THREE.Vector3(0, 1, 0);
    private readonly rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly isDebugEnabled = GameConfig.debugMode;

    private isMousePanning = false;
    private isMouseLooking = false;
    private activeTouchPanId: number | null = null;
    private lastPinchDistance = 0;
    private yaw = 0;
    private pitch = 0;

    constructor(
        camera: THREE.PerspectiveCamera,
        inputElement: HTMLElement,
        shouldBlockInput: ScreenPointBlocker = () => false,
    ) {
        this.camera = camera;
        this.inputElement = inputElement;
        this.shouldBlockInput = shouldBlockInput;
    }

    initialize() {
        this.applyDefaultCameraPose();
        this.applyLandscapeDefaultZoomIfNeeded();
        this.clampPanPosition();
        this.syncCameraAngles();

        if (this.isDebugEnabled) {
            this.logCameraPosition();
            this.logCameraOrientation();
        }

        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.inputElement.addEventListener('contextmenu', this.handleContextMenu);
        this.inputElement.addEventListener('wheel', this.handleWheel, { passive: false });
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerUp);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleWindowBlur);
    }

    update(deltaSeconds: number) {
        this.moveDirection.set(0, 0, 0);
        this.updateHorizontalAxes();

        if (this.isKeyActive('KeyW') || this.isKeyActive('ArrowUp')) {
            this.moveDirection.add(this.horizontalForward);
        }

        if (this.isKeyActive('KeyS') || this.isKeyActive('ArrowDown')) {
            this.moveDirection.sub(this.horizontalForward);
        }

        if (this.isKeyActive('KeyD') || this.isKeyActive('ArrowRight')) {
            this.moveDirection.add(this.horizontalRight);
        }

        if (this.isKeyActive('KeyA') || this.isKeyActive('ArrowLeft')) {
            this.moveDirection.sub(this.horizontalRight);
        }

        if (this.moveDirection.lengthSq() === 0) {
            return;
        }

        this.moveDirection.normalize();
        this.camera.position.addScaledVector(this.moveDirection, KEYBOARD_PAN_SPEED * deltaSeconds);
        this.clampPanPosition();
        this.logCameraPositionIfDebug();
    }

    dispose() {
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.inputElement.removeEventListener('contextmenu', this.handleContextMenu);
        this.inputElement.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);
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

    private updateHorizontalAxes() {
        this.horizontalForward.set(0, 0, -1).applyAxisAngle(this.upAxis, this.yaw);
        this.horizontalRight.set(1, 0, 0).applyAxisAngle(this.upAxis, this.yaw);
    }

    private isKeyActive(code: string) {
        return this.keyStates.get(code) === true;
    }

    private clampPanPosition() {
        const lookDirection = this.camera.getWorldDirection(this.lookDirection);

        if (lookDirection.y >= -Number.EPSILON) {
            return;
        }

        const groundDistance = -this.camera.position.y / lookDirection.y;
        const currentGroundX = this.camera.position.x + lookDirection.x * groundDistance;
        const currentGroundZ = this.camera.position.z + lookDirection.z * groundDistance;
        const panBounds = this.getPanBounds();
        const clampedGroundX = THREE.MathUtils.clamp(
            currentGroundX,
            panBounds.minX,
            panBounds.maxX,
        );
        const clampedGroundZ = THREE.MathUtils.clamp(
            currentGroundZ,
            panBounds.minZ,
            panBounds.maxZ,
        );

        this.camera.position.x = clampedGroundX - lookDirection.x * groundDistance;
        this.camera.position.z = clampedGroundZ - lookDirection.z * groundDistance;
    }

    private getPanBounds() {
        const referenceGroundDistance = this.getDefaultGroundDistance();
        const { dirX, dirZ } = GameConfig.defaultCameraPosition;

        return {
            minX: GameConfig.MaxLeftMove + dirX * referenceGroundDistance,
            maxX: GameConfig.MaxRightMove + dirX * referenceGroundDistance,
            minZ: GameConfig.MaxTopMove + dirZ * referenceGroundDistance,
            maxZ: GameConfig.MaxDownMove + dirZ * referenceGroundDistance,
        };
    }

    private getDefaultGroundDistance() {
        const { y, dirY } = GameConfig.defaultCameraPosition;

        if (Math.abs(dirY) <= Number.EPSILON) {
            return 0;
        }

        return -y / dirY;
    }

    private applyLandscapeDefaultZoomIfNeeded() {
        if (!this.isLandscapeMode()) {
            return;
        }

        const lookDirection = this.camera.getWorldDirection(this.lookDirection);

        if (lookDirection.y >= -Number.EPSILON) {
            return;
        }

        const currentGroundDistance = -this.camera.position.y / lookDirection.y;
        const targetGroundDistance = THREE.MathUtils.clamp(
            GameConfig.LandscapeDefaultZoomLevel,
            GameConfig.MaxZoomInLevel,
            this.getCurrentMaxZoomOutLevel(),
        );
        const zoomDelta = currentGroundDistance - targetGroundDistance;

        if (zoomDelta === 0) {
            return;
        }

        this.camera.position.addScaledVector(lookDirection, zoomDelta);
    }

    private getCurrentMaxZoomOutLevel() {
        if (!this.isLandscapeMode()) {
            return GameConfig.MaxZoomOutLevel;
        }

        return Math.min(
            GameConfig.MaxZoomOutLevel,
            GameConfig.LandscapeDefaultZoomLevel,
        );
    }

    private isLandscapeMode() {
        return window.innerWidth > window.innerHeight;
    }

    private applyPanFromScreenDelta(deltaX: number, deltaY: number) {
        if (deltaX === 0 && deltaY === 0) {
            return;
        }

        this.updateHorizontalAxes();

        const panDistance = Math.max(this.camera.position.y, MIN_CAMERA_HEIGHT) * DRAG_PAN_SPEED;

        this.camera.position.addScaledVector(this.horizontalRight, -deltaX * panDistance);
        this.camera.position.addScaledVector(this.horizontalForward, deltaY * panDistance);
        this.clampPanPosition();
        this.logCameraPositionIfDebug();
    }

    private applyZoomDelta(zoomDelta: number) {
        if (zoomDelta === 0) {
            return;
        }

        const lookDirection = this.camera.getWorldDirection(this.lookDirection);

        if (lookDirection.y >= -Number.EPSILON) {
            return;
        }

        const currentGroundDistance = -this.camera.position.y / lookDirection.y;
        const targetGroundDistance = THREE.MathUtils.clamp(
            currentGroundDistance - zoomDelta,
            GameConfig.MaxZoomInLevel,
            this.getCurrentMaxZoomOutLevel(),
        );
        const appliedZoomDelta = currentGroundDistance - targetGroundDistance;

        if (appliedZoomDelta === 0) {
            return;
        }

        this.camera.position.addScaledVector(lookDirection, appliedZoomDelta);
        this.logCameraPositionIfDebug();
        this.logCameraZoomIfDebug();
    }

    private getTouchDistance() {
        const touchPoints = Array.from(this.touchPointers.values());

        if (touchPoints.length < 2) {
            return 0;
        }

        return touchPoints[0].distanceTo(touchPoints[1]);
    }

    private tryCapturePointer(pointerId: number) {
        if (this.inputElement.hasPointerCapture?.(pointerId)) {
            return;
        }

        try {
            this.inputElement.setPointerCapture(pointerId);
        } catch {
            return;
        }
    }

    private tryReleasePointer(pointerId: number) {
        if (!this.inputElement.hasPointerCapture?.(pointerId)) {
            return;
        }

        try {
            this.inputElement.releasePointerCapture(pointerId);
        } catch {
            return;
        }
    }

    private isInputBlocked(screenX: number, screenY: number) {
        return this.shouldBlockInput(screenX, screenY);
    }

    private logCameraPositionIfDebug() {
        if (!this.isDebugEnabled) {
            return;
        }

        this.logCameraPosition();
    }

    private logCameraZoomIfDebug() {
        if (!this.isDebugEnabled) {
            return;
        }

        this.logCameraZoomLevel();
    }

    private logCameraPosition() {
        const { x, y, z } = this.camera.position;

        console.log(
            `Debug camera position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`,
        );
    }

    private logCameraZoomLevel() {
        const lookDirection = this.camera.getWorldDirection(this.lookDirection);
        const distanceToGroundPlane =
            lookDirection.y < -Number.EPSILON
                ? -this.camera.position.y / lookDirection.y
                : Number.POSITIVE_INFINITY;

        console.log(
            `Debug camera zoom: height=${this.camera.position.y.toFixed(3)}, groundDistance=${distanceToGroundPlane.toFixed(3)}`,
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
        if (this.isInputBlocked(event.clientX, event.clientY)) {
            return;
        }

        if (event.pointerType === 'mouse') {
            if (event.button === MOUSE_PAN_BUTTON) {
                event.preventDefault();
                this.isMousePanning = true;
                this.pointerPosition.set(event.clientX, event.clientY);
                this.tryCapturePointer(event.pointerId);

                return;
            }

            if (event.button !== MOUSE_LOOK_BUTTON || !this.isDebugEnabled) {
                return;
            }

            event.preventDefault();
            this.isMouseLooking = true;
            this.pointerPosition.set(event.clientX, event.clientY);
            this.tryCapturePointer(event.pointerId);

            return;
        }

        if (event.pointerType !== 'touch') {
            return;
        }

        event.preventDefault();
        this.touchPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
        this.tryCapturePointer(event.pointerId);

        if (this.touchPointers.size === 1) {
            this.activeTouchPanId = event.pointerId;
            this.pointerPosition.set(event.clientX, event.clientY);
            this.lastPinchDistance = 0;

            return;
        }

        this.activeTouchPanId = null;
        this.lastPinchDistance = this.getTouchDistance();
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
            if (!this.isMousePanning && !this.isMouseLooking) {
                return;
            }

            event.preventDefault();

            const deltaX = event.clientX - this.pointerPosition.x;
            const deltaY = event.clientY - this.pointerPosition.y;

            this.pointerPosition.set(event.clientX, event.clientY);

            if (this.isMousePanning) {
                this.applyPanFromScreenDelta(deltaX, deltaY);

                return;
            }

            this.yaw -= deltaX * LOOK_SENSITIVITY;
            this.pitch -= deltaY * LOOK_SENSITIVITY;
            this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
            this.applyCameraRotation();

            if (this.isDebugEnabled) {
                this.logCameraOrientation();
            }

            return;
        }

        if (event.pointerType !== 'touch') {
            return;
        }

        const touchPoint = this.touchPointers.get(event.pointerId);

        if (!touchPoint) {
            return;
        }

        event.preventDefault();

        const deltaX = event.clientX - touchPoint.x;
        const deltaY = event.clientY - touchPoint.y;

        touchPoint.set(event.clientX, event.clientY);

        if (this.touchPointers.size >= 2) {
            const pinchDistance = this.getTouchDistance();

            if (this.lastPinchDistance > 0) {
                this.applyZoomDelta((pinchDistance - this.lastPinchDistance) * PINCH_ZOOM_SPEED);
            }

            this.lastPinchDistance = pinchDistance;

            return;
        }

        if (this.activeTouchPanId === event.pointerId) {
            this.applyPanFromScreenDelta(deltaX, deltaY);
        }
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
            if (event.button === MOUSE_PAN_BUTTON) {
                this.isMousePanning = false;
                this.tryReleasePointer(event.pointerId);

                return;
            }

            if (event.button === MOUSE_LOOK_BUTTON) {
                this.isMouseLooking = false;
                this.tryReleasePointer(event.pointerId);
            }

            return;
        }

        if (event.pointerType !== 'touch') {
            return;
        }

        this.touchPointers.delete(event.pointerId);
        this.tryReleasePointer(event.pointerId);

        if (this.touchPointers.size >= 2) {
            this.lastPinchDistance = this.getTouchDistance();

            return;
        }

        this.lastPinchDistance = 0;

        if (this.touchPointers.size === 1) {
            const [pointerId, pointerPosition] = Array.from(this.touchPointers.entries())[0];

            this.activeTouchPanId = pointerId;
            this.pointerPosition.copy(pointerPosition);

            return;
        }

        this.activeTouchPanId = null;
    };

    private readonly handleWheel = (event: WheelEvent) => {
        if (this.isInputBlocked(event.clientX, event.clientY)) {
            return;
        }

        event.preventDefault();
        this.applyZoomDelta(-event.deltaY * WHEEL_ZOOM_SPEED);
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
        this.isMousePanning = false;
        this.isMouseLooking = false;
        this.activeTouchPanId = null;
        this.lastPinchDistance = 0;
        this.touchPointers.clear();
    };
}
