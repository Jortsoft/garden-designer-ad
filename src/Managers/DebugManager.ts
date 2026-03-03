import * as THREE from 'three';
import { GameConfig } from './GameConfig';

const LOOK_SENSITIVITY = 0.005;
const MOVE_SPEED = 2;
const MAX_PITCH = Math.PI / 2 - 0.05;
const FPS_SAMPLE_WINDOW = 0.25;
const FPS_PANEL_WIDTH = 256;
const FPS_PANEL_HEIGHT = 96;
const FPS_PANEL_DISTANCE = 1.5;
const FPS_PANEL_WORLD_HEIGHT = 0.18;
const FPS_PANEL_MARGIN = 0.06;

export class DebugManager {
    private readonly inputElement: HTMLElement;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly keyStates = new Map<string, boolean>();
    private readonly pointerPosition = new THREE.Vector2();
    private readonly moveDirection = new THREE.Vector3();
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly upAxis = new THREE.Vector3(0, 1, 0);
    private readonly rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly isEnabled = GameConfig.debugMode;
    private readonly fpsCanvas: HTMLCanvasElement;
    private readonly fpsContext: CanvasRenderingContext2D | null;
    private readonly fpsTexture: THREE.CanvasTexture | null;
    private readonly fpsSprite: THREE.Sprite | null;

    private isRotating = false;
    private yaw = 0;
    private pitch = 0;
    private fpsFrameCount = 0;
    private fpsElapsedTime = 0;

    constructor(camera: THREE.PerspectiveCamera, inputElement: HTMLElement) {
        this.camera = camera;
        this.inputElement = inputElement;
        this.fpsCanvas = document.createElement('canvas');
        this.fpsCanvas.width = FPS_PANEL_WIDTH;
        this.fpsCanvas.height = FPS_PANEL_HEIGHT;
        this.fpsContext = this.fpsCanvas.getContext('2d');

        if (this.fpsContext) {
            this.fpsTexture = new THREE.CanvasTexture(this.fpsCanvas);
            this.fpsTexture.colorSpace = THREE.SRGBColorSpace;

            const fpsMaterial = new THREE.SpriteMaterial({
                map: this.fpsTexture,
                transparent: true,
                depthTest: false,
                depthWrite: false,
            });

            this.fpsSprite = new THREE.Sprite(fpsMaterial);
            this.fpsSprite.renderOrder = 999;
        } else {
            this.fpsTexture = null;
            this.fpsSprite = null;
        }
    }

    initialize() {
        if (!this.isEnabled) {
            return;
        }

        this.syncCameraAngles();
        this.attachFpsCounter();
        this.logCameraPosition();

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

        this.updateFpsCounter(deltaSeconds);
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

        if (this.fpsSprite?.parent === this.camera) {
            this.camera.remove(this.fpsSprite);
        }

        if (this.fpsSprite) {
            this.fpsSprite.material.dispose();
        }

        this.fpsTexture?.dispose();
    }

    updateViewport() {
        if (!this.isEnabled) {
            return;
        }

        this.updateFpsCounterLayout();
    }

    private syncCameraAngles() {
        this.rotationEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.pitch = this.rotationEuler.x;
        this.yaw = this.rotationEuler.y;
    }

    private applyCameraRotation() {
        this.rotationEuler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.rotationEuler);
    }

    private isKeyActive(code: string) {
        return this.keyStates.get(code) === true;
    }

    private attachFpsCounter() {
        if (!this.fpsSprite) {
            return;
        }

        if (this.fpsSprite.parent !== this.camera) {
            this.camera.add(this.fpsSprite);
        }

        this.updateFpsCounterLayout();
        this.drawFpsCounter(GameConfig.Fps);
    }

    private updateFpsCounter(deltaSeconds: number) {
        if (!this.fpsTexture || !this.fpsContext) {
            return;
        }

        this.fpsFrameCount += 1;
        this.fpsElapsedTime += deltaSeconds;

        if (this.fpsElapsedTime < FPS_SAMPLE_WINDOW) {
            return;
        }

        const currentFps = this.fpsFrameCount / this.fpsElapsedTime;

        this.fpsFrameCount = 0;
        this.fpsElapsedTime = 0;
        this.drawFpsCounter(currentFps);
    }

    private drawFpsCounter(currentFps: number) {
        if (!this.fpsContext || !this.fpsTexture) {
            return;
        }

        this.fpsContext.clearRect(0, 0, FPS_PANEL_WIDTH, FPS_PANEL_HEIGHT);
        this.fpsContext.fillStyle = 'rgba(8, 8, 12, 0.82)';
        this.fpsContext.fillRect(0, 0, FPS_PANEL_WIDTH, FPS_PANEL_HEIGHT);
        this.fpsContext.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        this.fpsContext.lineWidth = 2;
        this.fpsContext.strokeRect(1, 1, FPS_PANEL_WIDTH - 2, FPS_PANEL_HEIGHT - 2);

        this.fpsContext.textAlign = 'right';
        this.fpsContext.textBaseline = 'middle';
        this.fpsContext.fillStyle = '#8ef5a4';
        this.fpsContext.font = '700 26px monospace';
        this.fpsContext.fillText(`FPS ${Math.round(currentFps)}`, FPS_PANEL_WIDTH - 18, 34);

        this.fpsContext.fillStyle = '#ffffff';
        this.fpsContext.font = '16px monospace';
        this.fpsContext.fillText(`Cap ${GameConfig.Fps}`, FPS_PANEL_WIDTH - 18, 68);

        this.fpsTexture.needsUpdate = true;
    }

    private updateFpsCounterLayout() {
        if (!this.fpsSprite) {
            return;
        }

        const halfFovRadians = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
        const halfHeight = Math.tan(halfFovRadians) * FPS_PANEL_DISTANCE;
        const halfWidth = halfHeight * this.camera.aspect;
        const panelAspect = FPS_PANEL_WIDTH / FPS_PANEL_HEIGHT;
        const panelHeight = FPS_PANEL_WORLD_HEIGHT;
        const panelWidth = panelHeight * panelAspect;

        this.fpsSprite.scale.set(panelWidth, panelHeight, 1);
        this.fpsSprite.position.set(
            halfWidth - panelWidth * 0.5 - FPS_PANEL_MARGIN,
            halfHeight - panelHeight * 0.5 - FPS_PANEL_MARGIN,
            -FPS_PANEL_DISTANCE,
        );
    }

    private logCameraPosition() {
        const { x, y, z } = this.camera.position;

        console.log(
            `Debug camera position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`,
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
        this.yaw -= deltaX * LOOK_SENSITIVITY;
        this.pitch -= deltaY * LOOK_SENSITIVITY;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);

        this.applyCameraRotation();
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
