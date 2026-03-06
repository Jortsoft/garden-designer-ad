import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameConfig } from '../Managers/GameConfig';
import type { PlaceHolderOptions } from '../Models/PlaceHolder.model';
import { applyPlaceHolderInteractionShader } from '../Shaders/PlaceHolder.shader';

const PLACEHOLDER_MODEL_PATH = 'assets/gltf/placeholder.glb';
const PLACEHOLDER_POSITION = new THREE.Vector3(0.536, 0.09, 1.741);
const PLACEHOLDER_SCALE = 0.02;
const PLACEHOLDER_ROTATION_DEGREES = new THREE.Vector3(0, 90, 0);
const MIN_HIT_AREA_AXIS = 0.001;
const HIT_AREA_PADDING = 0.12;

export class PlaceHolder extends THREE.Group {
    private readonly loader = new GLTFLoader();
    private readonly maxTextureAnisotropy: number;
    private readonly interactionTimeUniforms: Array<{ value: number }> = [];
    private readonly preparedMaterials = new WeakSet<THREE.Material>();
    private readonly shouldShowInteractionHitOutline = GameConfig.debugMode;
    private loadPromise: Promise<void> | null = null;
    private model: THREE.Object3D | null = null;
    private interactionHitArea:
        | THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
        | null = null;
    private interactionHitOutline:
        | THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>
        | null = null;
    private readonly interactionHitBounds = new THREE.Box3();
    private readonly interactionHitPoint = new THREE.Vector3();
    private isLoaded = false;
    private isLoading = false;
    private interactionTimeSeconds = 0;

    constructor(maxTextureAnisotropy: number, options: PlaceHolderOptions = {}) {
        super();
        this.name = options.name ?? 'PlaceHolder';
        this.maxTextureAnisotropy = maxTextureAnisotropy;
        const position = options.position ?? PLACEHOLDER_POSITION;
        const rotationDegrees = options.rotationDegrees ?? PLACEHOLDER_ROTATION_DEGREES;
        const scale = options.scale ?? PLACEHOLDER_SCALE;

        this.position.set(position.x, position.y, position.z);
        this.scale.setScalar(Math.max(0.001, scale));
        this.rotation.set(
            THREE.MathUtils.degToRad(rotationDegrees.x),
            THREE.MathUtils.degToRad(rotationDegrees.y),
            THREE.MathUtils.degToRad(rotationDegrees.z),
        );
        this.visible = options.isVisibleInitially ?? true;
    }

    load() {
        if (this.isLoaded || this.isLoading) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isLoading = true;
        this.loadPromise = new Promise((resolve, reject) => {
            this.loader.load(
                PLACEHOLDER_MODEL_PATH,
                (gltf) => {
                    this.model = gltf.scene;
                    this.prepareModel(this.model);
                    this.createInteractionHitArea(this.model);
                    this.add(this.model);
                    this.isLoaded = true;
                    this.isLoading = false;
                    resolve();
                },
                undefined,
                (error) => {
                    this.isLoading = false;
                    console.error(`Failed to load placeholder model: ${PLACEHOLDER_MODEL_PATH}`, error);
                    reject(error);
                },
            );
        });

        return this.loadPromise;
    }

    update(deltaSeconds: number) {
        if (!this.isLoaded) {
            return;
        }

        this.interactionTimeSeconds += Math.max(0, deltaSeconds);
        for (const timeUniform of this.interactionTimeUniforms) {
            timeUniform.value = this.interactionTimeSeconds;
        }
    }

    intersectsInteractionRay(ray: THREE.Ray) {
        if (!this.interactionHitArea) {
            return false;
        }

        this.interactionHitBounds.setFromObject(this.interactionHitArea);

        if (this.interactionHitBounds.isEmpty()) {
            return false;
        }

        return ray.intersectBox(this.interactionHitBounds, this.interactionHitPoint) !== null;
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
        this.disposeInteractionHitDebugVisuals();
        this.model = null;
        this.interactionHitArea = null;
        this.interactionHitOutline = null;
        this.isLoaded = false;
        this.interactionTimeSeconds = 0;
        this.interactionTimeUniforms.length = 0;
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

    private createInteractionHitArea(model: THREE.Object3D) {
        if (this.interactionHitArea) {
            this.interactionHitArea.geometry.dispose();
            this.interactionHitArea.material.dispose();
            this.interactionHitArea.parent?.remove(this.interactionHitArea);
            this.interactionHitArea = null;
        }

        this.disposeInteractionHitDebugVisuals();

        const bounds = new THREE.Box3().setFromObject(model);

        if (bounds.isEmpty()) {
            return;
        }

        bounds.expandByScalar(HIT_AREA_PADDING);

        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bounds.getSize(size);
        bounds.getCenter(center);
        model.updateWorldMatrix(true, false);
        model.worldToLocal(center);

        const geometry = new THREE.BoxGeometry(
            Math.max(size.x, MIN_HIT_AREA_AXIS),
            Math.max(size.y, MIN_HIT_AREA_AXIS),
            Math.max(size.z, MIN_HIT_AREA_AXIS),
        );
        const material = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });
        material.colorWrite = false;
        material.toneMapped = false;

        const hitAreaMesh = new THREE.Mesh(geometry, material);
        hitAreaMesh.name = 'PlaceHolderHitArea';
        hitAreaMesh.position.copy(center);
        hitAreaMesh.renderOrder = 1;
        hitAreaMesh.frustumCulled = false;
        model.add(hitAreaMesh);
        this.interactionHitArea = hitAreaMesh;

        if (!this.shouldShowInteractionHitOutline) {
            return;
        }

        const outlineGeometry = new THREE.EdgesGeometry(geometry);
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: '#ff2b2b',
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false,
        });
        outlineMaterial.toneMapped = false;

        const hitOutline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        hitOutline.name = 'PlaceHolderHitAreaOutline';
        hitOutline.position.copy(center);
        hitOutline.renderOrder = hitAreaMesh.renderOrder + 1;
        hitOutline.frustumCulled = false;
        model.add(hitOutline);
        this.interactionHitOutline = hitOutline;
    }

    private disposeInteractionHitDebugVisuals() {
        if (!this.interactionHitOutline) {
            return;
        }

        this.interactionHitOutline.geometry.dispose();
        this.interactionHitOutline.material.dispose();
        this.interactionHitOutline.parent?.remove(this.interactionHitOutline);
        this.interactionHitOutline = null;
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

        if (this.preparedMaterials.has(material)) {
            return;
        }

        this.preparedMaterials.add(material);

        if (!(material instanceof THREE.MeshStandardMaterial)) {
            material.side = THREE.DoubleSide;
            material.needsUpdate = true;
            return;
        }

        const timeUniform = { value: this.interactionTimeSeconds };
        this.interactionTimeUniforms.push(timeUniform);
        applyPlaceHolderInteractionShader(material, timeUniform);
        material.side = THREE.DoubleSide;
        material.dithering = true;
        this.prepareTexture(material.map, true);
        this.prepareTexture(material.normalMap);
        this.prepareTexture(material.roughnessMap);
        this.prepareTexture(material.metalnessMap);
        this.prepareTexture(material.aoMap);
        this.prepareTexture(material.emissiveMap, true);
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
}
