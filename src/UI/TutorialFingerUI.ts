import * as THREE from 'three';
import { Assets, Sprite, Texture } from 'pixi.js';
import type { PixiUI } from '../Systems/PixiUI';
import type { TutorialFingerAnchor } from '../Models/Tutorial.model';

const TUTORIAL_FINGER_TEXTURE_PATH = 'assets/images/finger.png';
const FINGER_MIN_SIZE = 94;
const FINGER_MAX_SIZE = 136;
const FINGER_SCREEN_RATIO = 0.1;
const FINGER_FLOAT_AMPLITUDE = 0.016;
const FINGER_FLOAT_SPEED = 2.6;
const FINGER_TAP_SPEED = 4.4;
const FINGER_TAP_SCALE_AMOUNT = 0.08;
const FINGER_ROTATION_RADIANS = THREE.MathUtils.degToRad(9);
const FINGER_ALPHA = 0.72;
const DEFAULT_WORLD_OFFSET = new THREE.Vector3(0, 0, 0);

export class TutorialFingerUI {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly pixiUI: PixiUI;
    private readonly sprite = new Sprite(Texture.WHITE);
    private readonly anchorWorldPosition = new THREE.Vector3();
    private readonly projectedPosition = new THREE.Vector3();
    private readonly worldOffset = DEFAULT_WORLD_OFFSET.clone();

    private anchorObject: THREE.Object3D | null = null;
    private viewportWidth = 1;
    private viewportHeight = 1;
    private currentScreenX = 0;
    private currentScreenY = 0;
    private currentSize = FINGER_MIN_SIZE;
    private animationTimeSeconds = 0;
    private isVisible = false;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;

    constructor(camera: THREE.PerspectiveCamera, pixiUI: PixiUI) {
        this.camera = camera;
        this.pixiUI = pixiUI;
        this.sprite.anchor.set(0.5, 0.86);
        this.sprite.alpha = FINGER_ALPHA;
        this.sprite.visible = false;
        this.sprite.zIndex = 120;
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
        this.updateViewport(
            window.innerWidth,
            window.innerHeight,
        );
        this.loadPromise = this.loadTexture();

        return this.loadPromise;
    }

    show(anchor: TutorialFingerAnchor) {
        if (this.isDisposed) {
            return;
        }

        this.anchorObject = anchor.object;
        this.worldOffset.copy(anchor.worldOffset ?? DEFAULT_WORLD_OFFSET);
        this.isVisible = true;
        this.animationTimeSeconds = 0;
        this.updateProjection(0);
    }

    hide() {
        this.isVisible = false;
        this.anchorObject = null;
        this.sprite.visible = false;
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

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.anchorObject = null;
        this.pixiUI.root.removeChild(this.sprite);
        this.sprite.destroy();
    }

    private async loadTexture() {
        try {
            const texture = await Assets.load<Texture>(TUTORIAL_FINGER_TEXTURE_PATH);
            this.sprite.texture = texture;
        } catch (error) {
            console.error(`Failed to load tutorial finger icon: ${TUTORIAL_FINGER_TEXTURE_PATH}`, error);
        }
    }

    private updateProjection(timeSeconds: number) {
        if (!this.isVisible || !this.anchorObject) {
            this.sprite.visible = false;
            return;
        }

        this.anchorObject.getWorldPosition(this.anchorWorldPosition);
        const floatOffset = Math.sin(timeSeconds * FINGER_FLOAT_SPEED) * FINGER_FLOAT_AMPLITUDE;
        this.anchorWorldPosition.add(this.worldOffset);
        this.anchorWorldPosition.y += floatOffset;
        this.projectedPosition.copy(this.anchorWorldPosition).project(this.camera);

        if (
            this.projectedPosition.z < -1 ||
            this.projectedPosition.z > 1 ||
            !Number.isFinite(this.projectedPosition.x) ||
            !Number.isFinite(this.projectedPosition.y)
        ) {
            this.sprite.visible = false;
            return;
        }

        this.currentScreenX = (this.projectedPosition.x * 0.5 + 0.5) * this.viewportWidth;
        this.currentScreenY = (-this.projectedPosition.y * 0.5 + 0.5) * this.viewportHeight;
        const tapWave = Math.sin(timeSeconds * FINGER_TAP_SPEED);
        const tapScale = 1 + tapWave * FINGER_TAP_SCALE_AMOUNT;
        this.currentSize = this.clamp(
            this.viewportWidth * FINGER_SCREEN_RATIO,
            FINGER_MIN_SIZE,
            FINGER_MAX_SIZE,
        ) * tapScale;
        this.sprite.position.set(this.currentScreenX, this.currentScreenY);
        this.sprite.width = this.currentSize;
        this.sprite.height = this.currentSize;
        this.sprite.rotation = -FINGER_ROTATION_RADIANS + tapWave * FINGER_ROTATION_RADIANS * 0.24;
        this.sprite.alpha = FINGER_ALPHA;
        this.sprite.visible = true;
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }
}
