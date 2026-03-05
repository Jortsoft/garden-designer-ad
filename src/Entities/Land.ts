import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const LAND_MODEL_PATH = 'assets/gltf/land.glb';
const LAND_POSITION = new THREE.Vector3(0.536, 0.081, 1.741);
const LAND_SCALE = 0.02;
const LAND_ROTATION_DEGREES = new THREE.Vector3(0, 90, 0);
const LAND_SLOT_COUNT = 6;
const DEFAULT_SLOT_OFFSETS = [new THREE.Vector3(0, 0, 0)] as const;

export class Land extends THREE.Group {
    private readonly loader = new GLTFLoader();
    private readonly maxTextureAnisotropy: number;
    private loadPromise: Promise<void> | null = null;
    private model: THREE.Object3D | null = null;
    private slotOffsets = DEFAULT_SLOT_OFFSETS.map((entry) => entry.clone());
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
                    this.slotOffsets = this.computeSlotOffsets(this.model);
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
        this.slotOffsets = DEFAULT_SLOT_OFFSETS.map((entry) => entry.clone());
        this.isLoaded = false;
        this.loadPromise = null;
    }

    getSlotOffsets() {
        return this.slotOffsets.map((entry) => entry.clone());
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

    private computeSlotOffsets(model: THREE.Object3D) {
        const candidateNodes = this.getSlotCandidateNodes(model);

        if (candidateNodes.length === 0) {
            return DEFAULT_SLOT_OFFSETS.map((entry) => entry.clone());
        }

        this.updateWorldMatrix(true, true);
        model.updateWorldMatrix(true, true);

        const slotCenters = candidateNodes
            .map((node) => {
                const bounds = new THREE.Box3().setFromObject(node);

                if (bounds.isEmpty()) {
                    return null;
                }

                const worldCenter = new THREE.Vector3();
                bounds.getCenter(worldCenter);
                const localCenter = this.worldToLocal(worldCenter);
                localCenter.y = 0;

                return localCenter;
            })
            .filter((entry): entry is THREE.Vector3 => entry !== null);

        if (slotCenters.length === 0) {
            return DEFAULT_SLOT_OFFSETS.map((entry) => entry.clone());
        }

        return slotCenters
            .map((center) => new THREE.Vector3(center.x + 1, 0.5, center.z - 3))
            .sort((a, b) => (a.z === b.z ? a.x - b.x : a.z - b.z));
    }

    private getSlotCandidateNodes(model: THREE.Object3D) {
        const topLevelNodes = model.children.filter((child) => this.nodeHasRenderableMesh(child));

        if (topLevelNodes.length >= LAND_SLOT_COUNT) {
            return this.limitNodesByFootprint(topLevelNodes);
        }

        const meshNodes: THREE.Object3D[] = [];

        model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshNodes.push(child);
            }
        });

        if (meshNodes.length >= LAND_SLOT_COUNT) {
            return this.limitNodesByFootprint(meshNodes);
        }

        if (topLevelNodes.length > 0) {
            return this.limitNodesByFootprint(topLevelNodes);
        }

        return this.limitNodesByFootprint(meshNodes);
    }

    private limitNodesByFootprint(nodes: THREE.Object3D[]) {
        const descriptors = nodes
            .map((node) => {
                const bounds = new THREE.Box3().setFromObject(node);

                if (bounds.isEmpty()) {
                    return null;
                }

                const size = new THREE.Vector3();
                bounds.getSize(size);

                return {
                    node,
                    footprint: Math.max(size.x, 0.0001) * Math.max(size.z, 0.0001),
                };
            })
            .filter((entry): entry is { node: THREE.Object3D; footprint: number } => entry !== null)
            .sort((a, b) => b.footprint - a.footprint);

        return descriptors
            .slice(0, LAND_SLOT_COUNT)
            .map((entry) => entry.node);
    }

    private nodeHasRenderableMesh(node: THREE.Object3D) {
        if (node instanceof THREE.Mesh) {
            return true;
        }

        let hasMesh = false;

        node.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                hasMesh = true;
            }
        });

        return hasMesh;
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
