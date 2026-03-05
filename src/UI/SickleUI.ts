import * as THREE from 'three';
import { audioManager } from '../Managers/AudioManager';

const SICKLE_BUTTON_TEXTURE_PATH = 'assets/images/sicke.png';
const SICKLE_BUTTON_MIN_PIXELS = 96;
const SICKLE_BUTTON_MAX_PIXELS = 142;
const SICKLE_BUTTON_PIXEL_RATIO = 0.16;
const SICKLE_BUTTON_PULSE_SPEED = 2.8;
const SICKLE_BUTTON_PULSE_AMOUNT = 0.045;
const SICKLE_BUTTON_FLOAT_AMPLITUDE_WORLD = 0.012;
const SICKLE_BUTTON_FLOAT_SPEED = 1.45;
const SICKLE_BUTTON_OPACITY = 0.95;
const DEFAULT_WORLD_OFFSET = new THREE.Vector3(0, 0, 0);

export class SickleUI {
    private readonly inputElement: HTMLElement;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly raycaster = new THREE.Raycaster();
    private readonly normalizedPointer = new THREE.Vector2();
    private readonly anchorWorldPosition = new THREE.Vector3();
    private readonly buttonWorldPosition = new THREE.Vector3();
    private readonly worldGroup = new THREE.Group();
    private readonly buttonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

    private viewportWidth = 1;
    private viewportHeight = 1;
    private animationTimeSeconds = 0;
    private isVisible = false;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;
    private onHarvestRequested: (() => void) | null = null;
    private anchorObject: THREE.Object3D | null = null;
    private worldOffset = DEFAULT_WORLD_OFFSET.clone();

    constructor(
        inputElement: HTMLElement,
        camera: THREE.PerspectiveCamera,
    ) {
        this.inputElement = inputElement;
        this.camera = camera;

        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: SICKLE_BUTTON_OPACITY,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        material.toneMapped = false;

        this.buttonMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            material,
        );
        this.buttonMesh.visible = false;
        this.buttonMesh.frustumCulled = false;
        this.worldGroup.visible = false;
        this.worldGroup.add(this.buttonMesh);
        this.applyButtonTransform(0);
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.loadPromise = this.loadTexture();
        this.applyButtonTransform(0);

        return this.loadPromise;
    }

    getObject3D() {
        return this.worldGroup;
    }

    attachTo(anchorObject: THREE.Object3D, worldOffset?: THREE.Vector3) {
        this.anchorObject = anchorObject;
        this.setWorldOffset(worldOffset ?? DEFAULT_WORLD_OFFSET);
    }

    setWorldOffset(worldOffset: THREE.Vector3) {
        this.worldOffset.copy(worldOffset);
        this.applyButtonTransform(this.animationTimeSeconds);
    }

    setOnHarvestRequested(handler: (() => void) | null) {
        this.onHarvestRequested = handler;
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.isVisible = true;
        this.animationTimeSeconds = 0;
        this.worldGroup.visible = true;
        this.buttonMesh.visible = true;
        this.applyButtonTransform(0);
    }

    hide() {
        this.isVisible = false;
        this.buttonMesh.visible = false;
        this.worldGroup.visible = false;
    }

    update(deltaSeconds: number) {
        if (!this.isInitialized || this.isDisposed || !this.isVisible) {
            return;
        }

        this.animationTimeSeconds += Math.max(0, deltaSeconds);
        this.applyButtonTransform(this.animationTimeSeconds);
    }

    render() {
        // World-space button is rendered with the main scene.
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.applyButtonTransform(this.animationTimeSeconds);
    }

    isScreenPointBlocked(screenX: number, screenY: number) {
        if (!this.isInitialized || this.isDisposed || !this.isVisible) {
            return false;
        }

        return this.isPointerOverButton(screenX, screenY);
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onHarvestRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.buttonMesh.geometry.dispose();
        this.buttonMesh.material.map?.dispose();
        this.buttonMesh.material.dispose();
        this.worldGroup.remove(this.buttonMesh);
        this.worldGroup.parent?.remove(this.worldGroup);
        this.anchorObject = null;
    }

    private async loadTexture() {
        try {
            const texture = await this.textureLoader.loadAsync(SICKLE_BUTTON_TEXTURE_PATH);

            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
            this.buttonMesh.material.map = texture;
            this.buttonMesh.material.needsUpdate = true;
        } catch (error) {
            console.error(`Failed to load sickle icon: ${SICKLE_BUTTON_TEXTURE_PATH}`, error);
        }
    }

    private applyButtonTransform(timeSeconds: number) {
        this.updateWorldPosition(timeSeconds);
        this.worldGroup.position.copy(this.buttonWorldPosition);
        this.worldGroup.quaternion.copy(this.camera.quaternion);
        this.worldGroup.updateWorldMatrix(false, false);

        const pulse = Math.sin(timeSeconds * SICKLE_BUTTON_PULSE_SPEED) * SICKLE_BUTTON_PULSE_AMOUNT;
        const scale = 1 + pulse;
        const baseSizeWorld = this.getWorldSizeForPixels(this.getTargetPixelSize());
        const buttonSize = Math.max(baseSizeWorld * scale, 0.001);

        this.buttonMesh.scale.set(buttonSize, buttonSize, 1);
        this.buttonMesh.material.opacity = SICKLE_BUTTON_OPACITY;
    }

    private updateWorldPosition(timeSeconds: number) {
        if (this.anchorObject) {
            this.anchorObject.getWorldPosition(this.anchorWorldPosition);
        } else {
            this.anchorWorldPosition.set(0, 0, 0);
        }

        const floatOffset = Math.sin(timeSeconds * SICKLE_BUTTON_FLOAT_SPEED) * SICKLE_BUTTON_FLOAT_AMPLITUDE_WORLD;
        this.buttonWorldPosition.copy(this.anchorWorldPosition).add(this.worldOffset);
        this.buttonWorldPosition.y += floatOffset;
    }

    private getTargetPixelSize() {
        return THREE.MathUtils.clamp(
            this.viewportWidth * SICKLE_BUTTON_PIXEL_RATIO,
            SICKLE_BUTTON_MIN_PIXELS,
            SICKLE_BUTTON_MAX_PIXELS,
        );
    }

    private getWorldSizeForPixels(pixelSize: number) {
        const distance = Math.max(
            this.camera.position.distanceTo(this.buttonWorldPosition),
            0.001,
        );
        const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
        const visibleHeightAtDistance = 2 * distance * Math.tan(fovRadians * 0.5);
        const worldUnitsPerPixel =
            visibleHeightAtDistance /
            Math.max(this.viewportHeight, 1) /
            Math.max(this.camera.zoom, 0.001);

        return Math.max(pixelSize * worldUnitsPerPixel, 0.001);
    }

    private isPointerOverButton(screenX: number, screenY: number) {
        const bounds = this.inputElement.getBoundingClientRect();

        if (bounds.width <= 0 || bounds.height <= 0) {
            return false;
        }

        this.normalizedPointer.set(
            ((screenX - bounds.left) / bounds.width) * 2 - 1,
            -((screenY - bounds.top) / bounds.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.normalizedPointer, this.camera);

        const intersections = this.raycaster.intersectObject(this.buttonMesh, false);

        return intersections.length > 0;
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isInitialized || this.isDisposed || !this.isVisible) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (!this.isPointerOverButton(event.clientX, event.clientY)) {
            return;
        }

        audioManager.playHarvest();
        this.onHarvestRequested?.();
    };
}
