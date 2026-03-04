import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameConfig } from '../Managers/GameConfig';

const GROUND_MODEL_PATH = 'assets/gltf/ground2.glb';
const TARGET_GROUND_SIZE = 6;

export class Ground extends THREE.Group {
  private readonly loader = new GLTFLoader();
  private readonly maxTextureAnisotropy: number;
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;
  private isLoading = false;

  constructor(maxTextureAnisotropy: number) {
    super();
    this.name = 'Ground';
    this.maxTextureAnisotropy = maxTextureAnisotropy;
  }

  load() {
    if (this.isLoaded || this.isLoading) {
      return this.loadPromise ?? Promise.resolve();
    }

    this.isLoading = true;
    this.loadPromise = new Promise((resolve, reject) => {
      this.loader.load(
        GROUND_MODEL_PATH,
        (gltf) => {
          const groundModel = gltf.scene;

          this.prepareModel(groundModel);
          this.add(groundModel);
          this.isLoaded = true;
          this.isLoading = false;
          resolve();
        },
        undefined,
        (error) => {
          this.isLoading = false;
          console.error(`Failed to load ground model: ${GROUND_MODEL_PATH}`, error);
          reject(error);
        },
      );
    });

    return this.loadPromise;
  }

  private prepareModel(model: THREE.Object3D) {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = GameConfig.enableShadow;
        child.receiveShadow = GameConfig.enableShadow;

        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }

        this.prepareMaterial(child.material);
      }
    });

    const initialBounds = new THREE.Box3().setFromObject(model);
    if (initialBounds.isEmpty()) {
      return;
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    initialBounds.getSize(size);
    initialBounds.getCenter(center);

    const largestAxis = Math.max(size.x, size.y, size.z) || 1;
    const scaleFactor = TARGET_GROUND_SIZE / largestAxis;

    model.position.sub(center);
    model.scale.setScalar(scaleFactor);

    const normalizedBounds = new THREE.Box3().setFromObject(model);
    if (Number.isFinite(normalizedBounds.min.y)) {
      model.position.y -= normalizedBounds.min.y;
    }
  }

  private prepareMaterial(
    material: THREE.Material | THREE.Material[],
  ) {
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

  private prepareTexture(
    texture: THREE.Texture | null,
    isColorTexture = false,
  ) {
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
}
