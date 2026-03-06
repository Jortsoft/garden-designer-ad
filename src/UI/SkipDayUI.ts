import * as THREE from 'three';
import { Assets, Sprite, Texture } from 'pixi.js';
import { audioManager } from '../Managers/AudioManager';
import { PixiUI } from '../Systems/PixiUI';

const SKIP_BUTTON_TEXTURE_PATH = 'assets/images/skip_day.png';
const SKIP_BUTTON_MIN_PIXELS = 96;
const SKIP_BUTTON_MAX_PIXELS = 142;
const SKIP_BUTTON_PIXEL_RATIO = 0.16;
const SKIP_BUTTON_PULSE_SPEED = 2.8;
const SKIP_BUTTON_PULSE_AMOUNT = 0.045;
const SKIP_BUTTON_FLOAT_AMPLITUDE_WORLD = 0.012;
const SKIP_BUTTON_FLOAT_SPEED = 1.45;
const SKIP_BUTTON_OPACITY = 0.95;
const DEFAULT_WORLD_OFFSET = new THREE.Vector3(0, 0, 0);

export class SkipDayUI {
    private readonly inputElement: HTMLElement;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly pixiUI: PixiUI;
    private readonly normalizedAnchorWorld = new THREE.Vector3();
    private readonly projectedPosition = new THREE.Vector3();
    private readonly sprite = new Sprite(Texture.WHITE);
    private readonly fallbackObject3D = new THREE.Group();
    private viewportWidth = 1;
    private viewportHeight = 1;
    private animationTimeSeconds = 0;
    private isVisible = false;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;
    private onSkipRequested: (() => void) | null = null;
    private anchorObject: THREE.Object3D | null = null;
    private worldOffset = DEFAULT_WORLD_OFFSET.clone();
    private currentScreenX = 0;
    private currentScreenY = 0;
    private currentScreenSize = SKIP_BUTTON_MIN_PIXELS;
    private isProjectedVisible = false;

    constructor(inputElement: HTMLElement, camera: THREE.PerspectiveCamera, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.camera = camera;
        this.pixiUI = pixiUI;
        this.sprite.anchor.set(0.5, 0.5);
        this.sprite.alpha = SKIP_BUTTON_OPACITY;
        this.sprite.visible = false;
        this.sprite.zIndex = 24;
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.pixiUI.root.addChild(this.sprite);
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.loadPromise = this.loadTexture();

        return this.loadPromise;
    }

    getObject3D() {
        return this.fallbackObject3D;
    }

    attachTo(anchorObject: THREE.Object3D, worldOffset?: THREE.Vector3) {
        this.anchorObject = anchorObject;
        this.setWorldOffset(worldOffset ?? DEFAULT_WORLD_OFFSET);
    }

    setWorldOffset(worldOffset: THREE.Vector3) {
        this.worldOffset.copy(worldOffset);
        this.updateProjection(0);
    }

    setOnSkipRequested(handler: (() => void) | null) {
        this.onSkipRequested = handler;
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.isVisible = true;
        this.animationTimeSeconds = 0;
        this.updateProjection(0);
    }

    hide() {
        this.isVisible = false;
        this.sprite.visible = false;
        this.isProjectedVisible = false;
    }

    update(deltaSeconds: number) {
        if (!this.isInitialized || this.isDisposed || !this.isVisible) {
            return;
        }

        this.animationTimeSeconds += Math.max(0, deltaSeconds);
        this.updateProjection(this.animationTimeSeconds);
    }

    render() {
        // Rendered by shared PixiUI.
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.updateProjection(this.animationTimeSeconds);
    }

    isScreenPointBlocked(screenX: number, screenY: number) {
        if (!this.isInitialized || this.isDisposed || !this.isVisible || !this.isProjectedVisible) {
            return false;
        }

        return this.isPointerOverButton(screenX, screenY);
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onSkipRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.pixiUI.root.removeChild(this.sprite);
        this.sprite.destroy();
        this.anchorObject = null;
    }

    private async loadTexture() {
        try {
            const texture = await Assets.load<Texture>(SKIP_BUTTON_TEXTURE_PATH);
            this.sprite.texture = texture;
        } catch (error) {
            console.error(`Failed to load skip icon: ${SKIP_BUTTON_TEXTURE_PATH}`, error);
        }
    }

    private updateProjection(timeSeconds: number) {
        if (!this.isVisible || !this.anchorObject) {
            this.sprite.visible = false;
            this.isProjectedVisible = false;
            return;
        }

        this.anchorObject.getWorldPosition(this.normalizedAnchorWorld);
        const floatOffset = Math.sin(timeSeconds * SKIP_BUTTON_FLOAT_SPEED) * SKIP_BUTTON_FLOAT_AMPLITUDE_WORLD;
        this.normalizedAnchorWorld.add(this.worldOffset);
        this.normalizedAnchorWorld.y += floatOffset;
        this.projectedPosition.copy(this.normalizedAnchorWorld).project(this.camera);

        if (
            this.projectedPosition.z < -1 ||
            this.projectedPosition.z > 1 ||
            !Number.isFinite(this.projectedPosition.x) ||
            !Number.isFinite(this.projectedPosition.y)
        ) {
            this.sprite.visible = false;
            this.isProjectedVisible = false;
            return;
        }

        this.currentScreenX = (this.projectedPosition.x * 0.5 + 0.5) * this.viewportWidth;
        this.currentScreenY = (-this.projectedPosition.y * 0.5 + 0.5) * this.viewportHeight;
        const pulse = Math.sin(timeSeconds * SKIP_BUTTON_PULSE_SPEED) * SKIP_BUTTON_PULSE_AMOUNT;
        const scale = 1 + pulse;
        this.currentScreenSize = this.clamp(
            this.viewportWidth * SKIP_BUTTON_PIXEL_RATIO,
            SKIP_BUTTON_MIN_PIXELS,
            SKIP_BUTTON_MAX_PIXELS,
        ) * scale;
        this.sprite.position.set(this.currentScreenX, this.currentScreenY);
        this.sprite.width = this.currentScreenSize;
        this.sprite.height = this.currentScreenSize;
        this.sprite.alpha = SKIP_BUTTON_OPACITY;
        this.sprite.visible = true;
        this.isProjectedVisible = true;
    }

    private isPointerOverButton(screenX: number, screenY: number) {
        const halfSize = this.currentScreenSize * 0.5;
        return (
            screenX >= this.currentScreenX - halfSize &&
            screenX <= this.currentScreenX + halfSize &&
            screenY >= this.currentScreenY - halfSize &&
            screenY <= this.currentScreenY + halfSize
        );
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isInitialized || this.isDisposed || !this.isVisible || !this.isProjectedVisible) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (!this.isPointerOverButton(event.clientX, event.clientY)) {
            return;
        }

        audioManager.playClick();
        this.onSkipRequested?.();
    };

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }
}
