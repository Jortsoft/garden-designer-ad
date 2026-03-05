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
const HARVEST_ANIMATION_DURATION = 0.78;
const HARVEST_ANIMATION_STAGGER = 0.06;
const HARVEST_CUT_DROP = 0.06;
const HARVEST_PULL_HEIGHT = 0.22;
const HARVEST_LEAN_ANGLE = 0.5;
const HARVEST_END_SCALE = 0.04;
const WIND_SWAY_ROTATION_X = 0.035;
const WIND_SWAY_ROTATION_Z = 0.07;
const WIND_SWAY_POSITION_X = 0.014;
const WIND_SWAY_POSITION_Z = 0.009;
const WIND_SWAY_POSITION_Y = 0.004;
const WIND_SWAY_FREQ_A = 1.6;
const WIND_SWAY_FREQ_B = 2.35;

const GROWTH_LEVELS = [1, 2, 3] as const;
export type VegetableGrowthLevel = (typeof GROWTH_LEVELS)[number];

interface Vector3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface VegetableOptions {
    readonly plantId: PlantId;
    readonly modelPathsByLevel: Record<VegetableGrowthLevel, string>;
    readonly maxTextureAnisotropy: number;
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly slotOffsets?: readonly Vector3Like[];
    readonly initialGrowthLevel?: VegetableGrowthLevel;
    readonly isVisibleInitially?: boolean;
}

export class Vegetable extends THREE.Group {
    readonly plantId: PlantId;

    private readonly loader = new GLTFLoader();
    private readonly modelPathsByLevel: Record<VegetableGrowthLevel, string>;
    private readonly maxTextureAnisotropy: number;
    private readonly preparedMaterials = new WeakSet<THREE.Material>();
    private readonly slotInstanceRoots: THREE.Group[] = [];
    private readonly slotBasePositions: THREE.Vector3[] = [];
    private readonly sourceModelsByLevel = new Map<VegetableGrowthLevel, THREE.Object3D>();
    private readonly previewTimeUniform = { value: 0 };
    private readonly previewActiveUniform = { value: 0 };
    private readonly previewMinOpacityUniform = { value: PREVIEW_OPACITY_MIN };
    private readonly previewMaxOpacityUniform = { value: PREVIEW_OPACITY_MAX };
    private readonly previewPulseSpeedUniform = { value: PREVIEW_OPACITY_PULSE_SPEED };
    private loadPromise: Promise<void> | null = null;
    private slotOffsets: THREE.Vector3[];
    private activeGrowthLevel: VegetableGrowthLevel;
    private isLoaded = false;
    private isLoading = false;
    private isPreviewMode = false;
    private isGrowAnimationActive = false;
    private isHarvestAnimationActive = false;
    private growElapsedSeconds = 0;
    private harvestElapsedSeconds = 0;
    private windTimeSeconds = Math.random() * 100;
    private isWindSwayActive = false;
    private onHarvestAnimationCompleted: (() => void) | null = null;

    constructor(options: VegetableOptions) {
        super();
        this.plantId = options.plantId;
        this.name = `Vegetable-${options.plantId}`;
        this.modelPathsByLevel = options.modelPathsByLevel;
        this.maxTextureAnisotropy = options.maxTextureAnisotropy;
        this.activeGrowthLevel = options.initialGrowthLevel ?? 3;

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
        this.loadPromise = Promise.all(
            GROWTH_LEVELS.map(async (level) => ({
                level,
                model: await this.loadModel(this.modelPathsByLevel[level]),
            })),
        )
            .then((entries) => {
                for (const entry of entries) {
                    this.prepareModel(entry.model);
                    this.sourceModelsByLevel.set(entry.level, entry.model);
                }

                this.rebuildSlotInstances();
                this.isLoaded = true;
                this.isLoading = false;
            })
            .catch((error) => {
                this.isLoading = false;
                console.error(`Failed to load vegetable models: ${this.plantId}`, error);
                throw error;
            });

        return this.loadPromise;
    }

    setShown(isShown: boolean) {
        this.visible = isShown;

        if (!isShown) {
            this.previewActiveUniform.value = 0;
            this.stopGrowAnimation();
            this.stopHarvestAnimation(false);
            this.stopWindSway();
        } else if (this.isPreviewMode) {
            this.previewActiveUniform.value = 1;
        }
    }

    setSlotOffsets(slotOffsets: readonly Vector3Like[]) {
        this.slotOffsets = this.normalizeSlotOffsets(slotOffsets);

        if (!this.isLoaded) {
            return;
        }

        this.rebuildSlotInstances();
    }

    getSlotWorldPositions() {
        this.updateWorldMatrix(true, false);

        if (this.slotBasePositions.length === 0) {
            return [this.getWorldPosition(new THREE.Vector3())];
        }

        return this.slotBasePositions.map((basePosition) =>
            this.localToWorld(basePosition.clone()),
        );
    }

    setGrowthLevel(level: VegetableGrowthLevel) {
        if (this.activeGrowthLevel === level) {
            return;
        }

        this.activeGrowthLevel = level;
        this.stopGrowAnimation();
        this.stopHarvestAnimation(false);

        if (!this.isLoaded) {
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

        this.stopHarvestAnimation(false);
        this.isGrowAnimationActive = true;
        this.growElapsedSeconds = 0;
        this.previewActiveUniform.value = 0;
        this.applyGrowAnimationFrame(0);
    }

    playHarvestAnimation(onCompleted?: () => void) {
        if (!this.isLoaded || this.slotInstanceRoots.length === 0) {
            onCompleted?.();
            return;
        }

        this.stopGrowAnimation();
        this.stopWindSway();
        this.isPreviewMode = false;
        this.previewActiveUniform.value = 0;
        this.isHarvestAnimationActive = true;
        this.harvestElapsedSeconds = 0;
        this.onHarvestAnimationCompleted = onCompleted ?? null;
        this.applyHarvestAnimationFrame(0);
    }

    update(deltaSeconds: number) {
        if (!this.isLoaded) {
            return;
        }

        if (this.isGrowAnimationActive) {
            this.growElapsedSeconds += Math.max(0, deltaSeconds);
            this.applyGrowAnimationFrame(this.growElapsedSeconds);
        }

        if (this.isHarvestAnimationActive) {
            this.harvestElapsedSeconds += Math.max(0, deltaSeconds);
            this.applyHarvestAnimationFrame(this.harvestElapsedSeconds);
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
            !this.isGrowAnimationActive &&
            !this.isHarvestAnimationActive;

        if (!shouldApplyWindSway) {
            this.stopWindSway();
            return;
        }

        this.applyWindSwayFrame(deltaSeconds);
    }

    dispose() {
        if (this.sourceModelsByLevel.size === 0) {
            return;
        }

        this.clear();

        for (const sourceModel of this.sourceModelsByLevel.values()) {
            sourceModel.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) {
                    return;
                }

                child.geometry.dispose();
                this.disposeMaterial(child.material);
            });
        }

        this.sourceModelsByLevel.clear();
        this.slotInstanceRoots.length = 0;
        this.slotBasePositions.length = 0;
        this.isLoaded = false;
        this.isLoading = false;
        this.loadPromise = null;
        this.isPreviewMode = false;
        this.isGrowAnimationActive = false;
        this.isHarvestAnimationActive = false;
        this.growElapsedSeconds = 0;
        this.harvestElapsedSeconds = 0;
        this.isWindSwayActive = false;
        this.onHarvestAnimationCompleted = null;
        this.previewTimeUniform.value = 0;
        this.previewActiveUniform.value = 0;
    }

    private loadModel(modelPath: string) {
        return new Promise<THREE.Object3D>((resolve, reject) => {
            this.loader.load(
                modelPath,
                (gltf) => resolve(gltf.scene),
                undefined,
                (error) => reject(error),
            );
        });
    }

    private normalizeSlotOffsets(slotOffsets?: readonly Vector3Like[]) {
        if (!slotOffsets || slotOffsets.length === 0) {
            return [new THREE.Vector3(0, 0, 0)];
        }

        return slotOffsets.map((entry) => new THREE.Vector3(entry.x, entry.y, entry.z));
    }

    private rebuildSlotInstances() {
        const sourceModel = this.sourceModelsByLevel.get(this.activeGrowthLevel);

        if (!sourceModel) {
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
                    ? sourceModel
                    : sourceModel.clone(true);
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
            this.setSlotRootOpacity(slotRoot, 1);
        }
    }

    private stopGrowAnimation() {
        this.isGrowAnimationActive = false;
        this.growElapsedSeconds = 0;
        this.resetSlotTransforms();
    }

    private applyHarvestAnimationFrame(elapsedSeconds: number) {
        let isAnimating = false;

        for (let index = 0; index < this.slotInstanceRoots.length; index += 1) {
            const slotRoot = this.slotInstanceRoots[index];
            const basePosition = this.slotBasePositions[index];
            const localElapsed = elapsedSeconds - index * HARVEST_ANIMATION_STAGGER;

            if (!basePosition) {
                continue;
            }

            if (localElapsed <= 0) {
                isAnimating = true;
                slotRoot.position.copy(basePosition);
                slotRoot.scale.setScalar(1);
                slotRoot.rotation.set(0, 0, 0);
                this.setSlotRootOpacity(slotRoot, 1);
                continue;
            }

            const progress = THREE.MathUtils.clamp(
                localElapsed / HARVEST_ANIMATION_DURATION,
                0,
                1,
            );

            if (progress < 1) {
                isAnimating = true;
            }

            const cutProgress = THREE.MathUtils.clamp(progress / 0.35, 0, 1);
            const pullProgress = THREE.MathUtils.clamp((progress - 0.2) / 0.8, 0, 1);
            const cutImpact = Math.sin(cutProgress * Math.PI);
            const pullUp = this.easeOutCubic(pullProgress) * HARVEST_PULL_HEIGHT;
            const shrinkProgress = this.easeInCubic(progress);
            const scale = THREE.MathUtils.lerp(1, HARVEST_END_SCALE, shrinkProgress);
            const opacity = THREE.MathUtils.lerp(1, 0, shrinkProgress);
            const lean = -HARVEST_LEAN_ANGLE * (0.4 + 0.6 * cutProgress);

            slotRoot.position.copy(basePosition);
            slotRoot.position.y += pullUp - cutImpact * HARVEST_CUT_DROP;
            slotRoot.scale.setScalar(scale);
            slotRoot.rotation.set(0, 0, lean);
            this.setSlotRootOpacity(slotRoot, opacity);
        }

        if (isAnimating) {
            return;
        }

        this.stopHarvestAnimation(true);
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

    private stopHarvestAnimation(shouldNotifyComplete: boolean) {
        this.isHarvestAnimationActive = false;
        this.harvestElapsedSeconds = 0;
        this.resetSlotTransforms();

        const onCompleted = this.onHarvestAnimationCompleted;
        this.onHarvestAnimationCompleted = null;

        if (shouldNotifyComplete) {
            onCompleted?.();
        }
    }

    private easeOutBack(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const shifted = t - 1;

        return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
    }

    private easeOutCubic(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        const inverse = 1 - t;

        return 1 - inverse * inverse * inverse;
    }

    private easeInCubic(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);

        return t * t * t;
    }

    private setSlotRootOpacity(slotRoot: THREE.Object3D, opacity: number) {
        const clampedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);

        slotRoot.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) {
                return;
            }

            this.setMaterialOpacity(child.material, clampedOpacity);
        });
    }

    private setMaterialOpacity(
        material: THREE.Material | THREE.Material[],
        opacity: number,
    ) {
        if (Array.isArray(material)) {
            for (const entry of material) {
                this.setMaterialOpacity(entry, opacity);
            }

            return;
        }

        material.opacity = opacity;
    }
}
