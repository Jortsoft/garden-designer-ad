import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    ANIMAL_MODEL_PATHS,
    AnimalId,
    type AnimalId as AnimalIdType,
    type AnimalOptions,
} from '../Models/Animal.model';

const DEFAULT_POSITION = new THREE.Vector3(1.092, 0.09, 2.117);
const DEFAULT_SCALE = 0.02;
const DEFAULT_ROTATION_DEGREES = new THREE.Vector3(0, 90, 0);
const SPAWN_ANIMATION_DURATION_SECONDS = 0.58;
const SPAWN_START_SCALE_MULTIPLIER = 0.08;
const SPAWN_RISE_HEIGHT = 0.09;
const SPAWN_SQUASH_AMOUNT = 0.1;

interface LoadedAnimalModel {
    readonly id: AnimalIdType;
    readonly scene: THREE.Object3D;
}

export class Animal extends THREE.Group {
    private readonly loader = new GLTFLoader();
    private readonly maxTextureAnisotropy: number;
    private readonly modelRoots = new Map<AnimalIdType, THREE.Object3D>();
    private readonly basePosition = new THREE.Vector3();
    private readonly baseScale = new THREE.Vector3();
    private loadPromise: Promise<void> | null = null;
    private activeAnimalId: AnimalIdType;
    private isLoaded = false;
    private isLoading = false;
    private isSpawnAnimationActive = false;
    private spawnElapsedSeconds = 0;
    private spawnDelaySeconds = 0;

    constructor(maxTextureAnisotropy: number, options: AnimalOptions = {}) {
        super();
        this.name = 'Animal';
        this.maxTextureAnisotropy = maxTextureAnisotropy;

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
        this.basePosition.copy(this.position);
        this.baseScale.copy(this.scale);
        this.activeAnimalId = options.initialAnimalId ?? AnimalId.chicken;
        this.visible = options.isVisibleInitially ?? false;
    }

    load() {
        if (this.isLoaded || this.isLoading) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isLoading = true;
        this.loadPromise = Promise.all(
            Object.values(AnimalId).map((animalId) => this.loadAnimalModel(animalId)),
        )
            .then((loadedModels) => {
                for (const loadedModel of loadedModels) {
                    this.prepareModel(loadedModel.scene);
                    this.modelRoots.set(loadedModel.id, loadedModel.scene);
                    this.add(loadedModel.scene);
                }

                this.isLoaded = true;
                this.isLoading = false;
                this.applyActiveAnimalState();
            })
            .catch((error) => {
                this.isLoading = false;
                console.error('Failed to load animal models', error);
                throw error;
            });

        return this.loadPromise;
    }

    setSelectedAnimal(animalId: AnimalIdType) {
        if (this.activeAnimalId === animalId) {
            return;
        }

        this.activeAnimalId = animalId;
        this.applyActiveAnimalState();
    }

    setShown(isShown: boolean) {
        this.visible = isShown;
        this.applyActiveAnimalState();

        if (!isShown) {
            this.stopSpawnAnimation(true);
        }
    }

    playSpawnAnimation(delaySeconds = 0) {
        this.basePosition.copy(this.position);
        this.baseScale.copy(this.scale);
        this.visible = true;
        this.spawnDelaySeconds = Math.max(0, delaySeconds);
        this.isSpawnAnimationActive = true;
        this.spawnElapsedSeconds = 0;
        this.applyActiveAnimalState();
        this.applySpawnAnimationFrame(0);
    }

    update(deltaSeconds: number) {
        if (!this.isSpawnAnimationActive) {
            return;
        }

        const safeDeltaSeconds = Math.max(0, deltaSeconds);
        if (this.spawnDelaySeconds > 0) {
            this.spawnDelaySeconds = Math.max(0, this.spawnDelaySeconds - safeDeltaSeconds);
            if (this.spawnDelaySeconds > 0) {
                return;
            }
        }

        this.spawnElapsedSeconds += safeDeltaSeconds;
        this.applySpawnAnimationFrame(this.spawnElapsedSeconds);
    }

    dispose() {
        for (const root of this.modelRoots.values()) {
            root.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) {
                    return;
                }

                child.geometry.dispose();
                this.disposeMaterial(child.material);
            });
        }

        this.clear();
        this.modelRoots.clear();
        this.isLoaded = false;
        this.isLoading = false;
        this.isSpawnAnimationActive = false;
        this.spawnElapsedSeconds = 0;
        this.spawnDelaySeconds = 0;
        this.loadPromise = null;
    }

    private loadAnimalModel(animalId: AnimalIdType) {
        const modelPath = ANIMAL_MODEL_PATHS[animalId];

        return new Promise<LoadedAnimalModel>((resolve, reject) => {
            this.loader.load(
                modelPath,
                (gltf) => {
                    resolve({
                        id: animalId,
                        scene: gltf.scene,
                    });
                },
                undefined,
                (error) => {
                    reject(error);
                },
            );
        });
    }

    private applyActiveAnimalState() {
        if (!this.isLoaded) {
            return;
        }

        for (const [animalId, modelRoot] of this.modelRoots.entries()) {
            modelRoot.visible = this.visible && animalId === this.activeAnimalId;
        }
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
        model.position.x -= center.x;
        model.position.z -= center.z;

        const groundedBounds = new THREE.Box3().setFromObject(model);
        if (Number.isFinite(groundedBounds.min.y)) {
            model.position.y -= groundedBounds.min.y;
        }
    }

    private prepareMaterial(material: THREE.Material | THREE.Material[]) {
        if (Array.isArray(material)) {
            for (const entry of material) {
                this.prepareMaterial(entry);
            }

            return;
        }

        if (material instanceof THREE.MeshStandardMaterial) {
            material.dithering = true;
            this.prepareTexture(material.map, true);
            this.prepareTexture(material.normalMap);
            this.prepareTexture(material.roughnessMap);
            this.prepareTexture(material.metalnessMap);
            this.prepareTexture(material.aoMap);
            this.prepareTexture(material.emissiveMap, true);
            material.needsUpdate = true;
        }
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
            this.disposeTexture(material.map);
            this.disposeTexture(material.normalMap);
            this.disposeTexture(material.roughnessMap);
            this.disposeTexture(material.metalnessMap);
            this.disposeTexture(material.aoMap);
            this.disposeTexture(material.emissiveMap);
        }

        material.dispose();
    }

    private disposeTexture(texture: THREE.Texture | null) {
        texture?.dispose();
    }

    private applySpawnAnimationFrame(elapsedSeconds: number) {
        const progress = THREE.MathUtils.clamp(
            elapsedSeconds / Math.max(SPAWN_ANIMATION_DURATION_SECONDS, Number.EPSILON),
            0,
            1,
        );
        const easedProgress = this.easeOutBack(progress);
        const scaleMultiplier = THREE.MathUtils.lerp(
            SPAWN_START_SCALE_MULTIPLIER,
            1,
            easedProgress,
        );
        const squashWave = Math.sin(progress * Math.PI) * SPAWN_SQUASH_AMOUNT;
        const xzScale = scaleMultiplier * (1 + squashWave * 0.38);
        const yScale = scaleMultiplier * (1 - squashWave);
        const yRise = (1 - this.easeOutCubic(progress)) * SPAWN_RISE_HEIGHT;

        this.position.set(
            this.basePosition.x,
            this.basePosition.y - yRise,
            this.basePosition.z,
        );
        this.scale.set(
            this.baseScale.x * xzScale,
            this.baseScale.y * yScale,
            this.baseScale.z * xzScale,
        );

        if (progress >= 1) {
            this.stopSpawnAnimation(true);
        }
    }

    private stopSpawnAnimation(applyFinalFrame: boolean) {
        this.isSpawnAnimationActive = false;
        this.spawnElapsedSeconds = 0;
        this.spawnDelaySeconds = 0;

        if (!applyFinalFrame) {
            return;
        }

        this.position.copy(this.basePosition);
        this.scale.copy(this.baseScale);
    }

    private easeOutBack(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const oneMinus = t - 1;
        return 1 + c3 * oneMinus * oneMinus * oneMinus + c1 * oneMinus * oneMinus;
    }

    private easeOutCubic(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        return 1 - Math.pow(1 - t, 3);
    }
}
