import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlantId } from '../Models/PlaceVegetable.model';
import { applyVegetablePreviewShader } from '../Shaders/VegetablePreview.shader';

const DEFAULT_POSITION = new THREE.Vector3(0.536, 0.087, 1.741);
const DEFAULT_ROTATION_DEGREES = new THREE.Vector3(0, 90, 0);
const DEFAULT_SCALE = 0.02;
const PREVIEW_OPACITY_MIN = 0.2;
const PREVIEW_OPACITY_MAX = 1;
const PREVIEW_OPACITY_PULSE_SPEED = 10;
const GROW_ANIMATION_DURATION = 0.6;
const GROW_ANIMATION_STAGGER = 0.08;
const GROW_START_SCALE = 0.18;
const GROW_BOUNCE_HEIGHT = 0.16;
const GROW_WOBBLE_ANGLE = 0.13;
const GROW_WOBBLE_FREQUENCY = 4.5;
const WIND_SWAY_ROTATION_X = 0.035;
const WIND_SWAY_ROTATION_Z = 0.07;
const WIND_SWAY_POSITION_X = 0.014;
const WIND_SWAY_POSITION_Z = 0.009;
const WIND_SWAY_POSITION_Y = 0.004;
const WIND_SWAY_FREQ_A = 1.6;
const WIND_SWAY_FREQ_B = 2.35;

interface Vector3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface VegetableOptions {
    readonly plantId: PlantId;
    readonly modelPath: string;
    readonly maxTextureAnisotropy: number;
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly slotOffsets?: readonly Vector3Like[];
    readonly isVisibleInitially?: boolean;
}

export class Vegetable extends THREE.Group {
    readonly plantId: PlantId;

    private readonly loader = new GLTFLoader();
    private readonly modelPath: string;
    private readonly maxTextureAnisotropy: number;
    private readonly preparedMaterials = new WeakSet<THREE.Material>();
    private readonly slotInstanceRoots: THREE.Group[] = [];
    private readonly slotBasePositions: THREE.Vector3[] = [];
    private readonly previewTimeUniform = { value: 0 };
    private readonly previewActiveUniform = { value: 0 };
    private readonly previewMinOpacityUniform = { value: PREVIEW_OPACITY_MIN };
    private readonly previewMaxOpacityUniform = { value: PREVIEW_OPACITY_MAX };
    private readonly previewPulseSpeedUniform = { value: PREVIEW_OPACITY_PULSE_SPEED };
    private loadPromise: Promise<void> | null = null;
    private sourceModel: THREE.Object3D | null = null;
    private slotOffsets: THREE.Vector3[];
    private isLoaded = false;
    private isLoading = false;
    private isPreviewMode = false;
    private isGrowAnimationActive = false;
    private growElapsedSeconds = 0;
    private windTimeSeconds = Math.random() * 100;
    private isWindSwayActive = false;

    constructor(options: VegetableOptions) {
        super();
        this.plantId = options.plantId;
        this.name = `Vegetable-${options.plantId}`;
        this.modelPath = options.modelPath;
        this.maxTextureAnisotropy = options.maxTextureAnisotropy;

        const position = options.position ?? DEFAULT_POSITION;
        const rotationDegrees = options.rotationDegrees ?? DEFAULT_ROTATION_DEGREES;
        const scale = options.scale ?? DEFAULT_SCALE;

        this.position.set(position.x, position.y, position.z);
        this.scale.setScalar(Math.max(0.001, scale));
        this.rotation.set(
            THREE.MathUtils.degToRad(rotationDegrees.x),
            THREE.MathUtils.degToRad(rotationDegrees.y),
            THREE.MathUtils.degToRad(rotationDegrees.z),
        );
        this.slotOffsets = this.normalizeSlotOffsets(options.slotOffsets);
        this.visible = options.isVisibleInitially ?? false;
    }

    load() {
        if (this.isLoaded || this.isLoading) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isLoading = true;
        this.loadPromise = new Promise((resolve, reject) => {
            this.loader.load(
                this.modelPath,
                (gltf) => {
                    this.sourceModel = gltf.scene;
                    this.prepareModel(this.sourceModel);
                    this.rebuildSlotInstances();
                    this.isLoaded = true;
                    this.isLoading = false;
                    resolve();
                },
                undefined,
                (error) => {
                    this.isLoading = false;
                    console.error(`Failed to load vegetable model: ${this.modelPath}`, error);
                    reject(error);
                },
            );
        });

        return this.loadPromise;
    }

    setShown(isShown: boolean) {
        this.visible = isShown;

        if (!isShown) {
            this.previewActiveUniform.value = 0;
            this.stopGrowAnimation();
            this.stopWindSway();
        } else if (this.isPreviewMode) {
            this.previewActiveUniform.value = 1;
        }
    }

    setSlotOffsets(slotOffsets: readonly Vector3Like[]) {
        this.slotOffsets = this.normalizeSlotOffsets(slotOffsets);

        if (!this.isLoaded || !this.sourceModel) {
            return;
        }

        this.rebuildSlotInstances();
    }

    setPreviewMode(isPreviewMode: boolean) {
        this.isPreviewMode = isPreviewMode;

        if (isPreviewMode) {
            this.stopGrowAnimation();
            this.stopWindSway();
            this.previewTimeUniform.value = 0;
            this.previewActiveUniform.value = 1;
            return;
        }

        this.previewTimeUniform.value = 0;
        this.previewActiveUniform.value = 0;
    }

    playGrowAnimation() {
        if (!this.isLoaded || this.slotInstanceRoots.length === 0) {
            return;
        }

        this.isGrowAnimationActive = true;
        this.growElapsedSeconds = 0;
        this.previewActiveUniform.value = 0;
        this.applyGrowAnimationFrame(0);
    }

    update(deltaSeconds: number) {
        if (!this.isLoaded) {
            return;
        }

        if (this.isGrowAnimationActive) {
            this.growElapsedSeconds += Math.max(0, deltaSeconds);
            this.applyGrowAnimationFrame(this.growElapsedSeconds);
        }

        if (!this.visible || !this.isPreviewMode) {
            this.previewActiveUniform.value = 0;
        } else {
            this.previewTimeUniform.value += Math.max(0, deltaSeconds);
            this.previewActiveUniform.value = 1;
        }

        const shouldApplyWindSway =
            this.visible &&
            !this.isPreviewMode &&
            !this.isGrowAnimationActive;

        if (!shouldApplyWindSway) {
            this.stopWindSway();
            return;
        }

        this.applyWindSwayFrame(deltaSeconds);
    }

    dispose() {
        if (!this.sourceModel) {
            return;
        }

        this.sourceModel.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) {
                return;
            }

            child.geometry.dispose();
            this.disposeMaterial(child.material);
        });

        this.clear();
        this.slotInstanceRoots.length = 0;
        this.slotBasePositions.length = 0;
        this.sourceModel = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.loadPromise = null;
        this.isPreviewMode = false;
        this.isGrowAnimationActive = false;
        this.growElapsedSeconds = 0;
        this.isWindSwayActive = false;
        this.previewTimeUniform.value = 0;
        this.previewActiveUniform.value = 0;
    }

    private normalizeSlotOffsets(slotOffsets?: readonly Vector3Like[]) {
        if (!slotOffsets || slotOffsets.length === 0) {
            return [new THREE.Vector3(0, 0, 0)];
        }

        return slotOffsets.map((entry) => new THREE.Vector3(entry.x, entry.y, entry.z));
    }

    private rebuildSlotInstances() {
        if (!this.sourceModel) {
            return;
        }

        for (const slotInstanceRoot of this.slotInstanceRoots) {
            slotInstanceRoot.clear();
            this.remove(slotInstanceRoot);
        }
        this.slotInstanceRoots.length = 0;
        this.slotBasePositions.length = 0;

        for (let slotIndex = 0; slotIndex < this.slotOffsets.length; slotIndex += 1) {
            const slotOffset = this.slotOffsets[slotIndex];
            const slotInstanceRoot = new THREE.Group();
            slotInstanceRoot.position.copy(slotOffset);
            slotInstanceRoot.scale.setScalar(1);
            slotInstanceRoot.rotation.set(0, 0, 0);

            const slotModel =
                slotIndex === 0
                    ? this.sourceModel
                    : this.sourceModel.clone(true);
            slotInstanceRoot.add(slotModel);
            this.slotInstanceRoots.push(slotInstanceRoot);
            this.slotBasePositions.push(slotOffset.clone());
            this.add(slotInstanceRoot);
        }

        this.resetSlotTransforms();
    }

    private prepareModel(model: THREE.Object3D) {
        model.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) {
                return;
            }

            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;

            if (!child.geometry.attributes.normal) {
                child.geometry.computeVertexNormals();
            }

            this.prepareMaterial(child.material);
        });

        this.normalizeModelPivot(model);
    }

    private normalizeModelPivot(model: THREE.Object3D) {
        const initialBounds = new THREE.Box3().setFromObject(model);

        if (initialBounds.isEmpty()) {
            return;
        }

        const center = new THREE.Vector3();
        initialBounds.getCenter(center);

        model.position.x -= center.x + 1;
        model.position.z -= center.z - 3;

        const groundedBounds = new THREE.Box3().setFromObject(model);
        if (Number.isFinite(groundedBounds.min.y)) {
            model.position.y -= groundedBounds.min.y - 0.1;
        }
    }

    private prepareMaterial(material: THREE.Material | THREE.Material[]) {
        if (Array.isArray(material)) {
            for (const entry of material) {
                this.prepareMaterial(entry);
            }

            return;
        }

        if (this.preparedMaterials.has(material)) {
            return;
        }

        this.preparedMaterials.add(material);
        material.side = THREE.DoubleSide;
        material.transparent = true;
        material.opacity = 1;
        applyVegetablePreviewShader(material, {
            time: this.previewTimeUniform,
            active: this.previewActiveUniform,
            minOpacity: this.previewMinOpacityUniform,
            maxOpacity: this.previewMaxOpacityUniform,
            pulseSpeed: this.previewPulseSpeedUniform,
        });

        if (material instanceof THREE.MeshStandardMaterial) {
            material.dithering = true;
            this.prepareTexture(material.map, true);
            this.prepareTexture(material.normalMap);
            this.prepareTexture(material.roughnessMap);
            this.prepareTexture(material.metalnessMap);
            this.prepareTexture(material.aoMap);
            this.prepareTexture(material.emissiveMap, true);
        }

        material.needsUpdate = true;
    }

    private prepareTexture(texture: THREE.Texture | null, isColorTexture = false) {
        if (!texture) {
            return;
        }

        texture.anisotropy = this.maxTextureAnisotropy;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        if (!(texture instanceof THREE.CompressedTexture)) {
            texture.generateMipmaps = true;
        }

        if (isColorTexture) {
            texture.colorSpace = THREE.SRGBColorSpace;
        }

        texture.needsUpdate = true;
    }

    private disposeMaterial(material: THREE.Material | THREE.Material[]) {
        if (Array.isArray(material)) {
            for (const entry of material) {
                this.disposeMaterial(entry);
            }

            return;
        }

        if (material instanceof THREE.MeshStandardMaterial) {
            material.map?.dispose();
            material.normalMap?.dispose();
            material.roughnessMap?.dispose();
            material.metalnessMap?.dispose();
            material.aoMap?.dispose();
            material.emissiveMap?.dispose();
        }

        material.dispose();
    }

    private applyGrowAnimationFrame(elapsedSeconds: number) {
        let isAnimating = false;

        for (let index = 0; index < this.slotInstanceRoots.length; index += 1) {
            const slotRoot = this.slotInstanceRoots[index];
            const basePosition = this.slotBasePositions[index];
            const localElapsed = elapsedSeconds - index * GROW_ANIMATION_STAGGER;

            if (!basePosition) {
                continue;
            }

            if (localElapsed <= 0) {
                isAnimating = true;
                slotRoot.position.copy(basePosition);
                slotRoot.position.y += GROW_BOUNCE_HEIGHT;
                slotRoot.scale.setScalar(GROW_START_SCALE);
                slotRoot.rotation.set(0, 0, 0);
                continue;
            }

            const progress = THREE.MathUtils.clamp(
                localElapsed / GROW_ANIMATION_DURATION,
                0,
                1,
            );

            if (progress < 1) {
                isAnimating = true;
            }

            const easedProgress = this.easeOutBack(progress);
            const growScale = THREE.MathUtils.lerp(GROW_START_SCALE, 1, easedProgress);
            const bounceLift = Math.sin(progress * Math.PI) * (1 - progress) * GROW_BOUNCE_HEIGHT;
            const wobble =
                Math.sin(progress * Math.PI * GROW_WOBBLE_FREQUENCY) *
                (1 - progress) *
                GROW_WOBBLE_ANGLE;

            slotRoot.position.copy(basePosition);
            slotRoot.position.y += bounceLift;
            slotRoot.scale.setScalar(growScale);
            slotRoot.rotation.set(0, 0, wobble);
        }

        if (isAnimating) {
            return;
        }

        this.stopGrowAnimation();
    }

    private resetSlotTransforms() {
        for (let index = 0; index < this.slotInstanceRoots.length; index += 1) {
            const slotRoot = this.slotInstanceRoots[index];
            const basePosition = this.slotBasePositions[index];

            if (!basePosition) {
                continue;
            }

            slotRoot.position.copy(basePosition);
            slotRoot.scale.setScalar(1);
            slotRoot.rotation.set(0, 0, 0);
        }
    }

    private stopGrowAnimation() {
        this.isGrowAnimationActive = false;
        this.growElapsedSeconds = 0;
        this.resetSlotTransforms();
    }

    private applyWindSwayFrame(deltaSeconds: number) {
        this.windTimeSeconds += Math.max(0, deltaSeconds);
        this.isWindSwayActive = true;

        for (let index = 0; index < this.slotInstanceRoots.length; index += 1) {
            const slotRoot = this.slotInstanceRoots[index];
            const basePosition = this.slotBasePositions[index];

            if (!basePosition) {
                continue;
            }

            const phase = this.windTimeSeconds + index * 0.73 + this.plantId.length * 0.31;
            const swayA = Math.sin(phase * WIND_SWAY_FREQ_A);
            const swayB = Math.sin(phase * WIND_SWAY_FREQ_B + 1.15);
            const swayC = Math.sin(phase * (WIND_SWAY_FREQ_A * 0.52) + 0.6);

            const rotationX = swayB * WIND_SWAY_ROTATION_X;
            const rotationZ = swayA * WIND_SWAY_ROTATION_Z + swayB * WIND_SWAY_ROTATION_Z * 0.32;
            const offsetX = swayA * WIND_SWAY_POSITION_X;
            const offsetZ = swayB * WIND_SWAY_POSITION_Z;
            const offsetY = Math.abs(swayC) * WIND_SWAY_POSITION_Y;

            slotRoot.position.set(
                basePosition.x + offsetX,
                basePosition.y + offsetY,
                basePosition.z + offsetZ,
            );
            slotRoot.rotation.set(rotationX, 0, rotationZ);
            slotRoot.scale.setScalar(1);
        }
    }

    private stopWindSway() {
        if (!this.isWindSwayActive) {
            return;
        }

        this.isWindSwayActive = false;
        this.resetSlotTransforms();
    }

    private easeOutBack(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const shifted = t - 1;

        return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
    }
}
