import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const LAND_MODEL_PATH = 'assets/gltf/land.glb';
const LAND_POSITION = new THREE.Vector3(0.536, 0.081, 1.741);
const LAND_SCALE = 0.02;
const LAND_ROTATION_DEGREES = new THREE.Vector3(0, 90, 0);

export class Land extends THREE.Group {
    private readonly loader = new GLTFLoader();
    private readonly maxTextureAnisotropy: number;
    private loadPromise: Promise<void> | null = null;
    private model: THREE.Object3D | null = null;
    private isLoaded = false;
    private isLoading = false;

    constructor(maxTextureAnisotropy: number) {
        super();
        this.name = 'Land';
        this.maxTextureAnisotropy = maxTextureAnisotropy;
        this.position.copy(LAND_POSITION);
        this.scale.setScalar(Math.max(0.001, LAND_SCALE));
        this.rotation.set(
            THREE.MathUtils.degToRad(LAND_ROTATION_DEGREES.x),
            THREE.MathUtils.degToRad(LAND_ROTATION_DEGREES.y),
            THREE.MathUtils.degToRad(LAND_ROTATION_DEGREES.z),
        );
    }

    load() {
        if (this.isLoaded || this.isLoading) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isLoading = true;
        this.loadPromise = new Promise((resolve, reject) => {
            this.loader.load(
                LAND_MODEL_PATH,
                (gltf) => {
                    this.model = gltf.scene;
                    this.prepareModel(this.model);
                    this.add(this.model);
                    this.isLoaded = true;
                    this.isLoading = false;
                    resolve();
                },
                undefined,
                (error) => {
                    this.isLoading = false;
                    console.error(`Failed to load land model: ${LAND_MODEL_PATH}`, error);
                    reject(error);
                },
            );
        });

        return this.loadPromise;
    }

    dispose() {
        if (!this.model) {
            return;
        }

        this.model.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) {
                return;
            }

            child.geometry.dispose();
            this.disposeMaterial(child.material);
        });

        this.clear();
        this.model = null;
        this.isLoaded = false;
        this.loadPromise = null;
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

        // Keep authored scale/rotation, but recenter the model so world position is predictable.
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
            material.map?.dispose();
            material.normalMap?.dispose();
            material.roughnessMap?.dispose();
            material.metalnessMap?.dispose();
            material.aoMap?.dispose();
            material.emissiveMap?.dispose();
        }

        material.dispose();
    }
}
