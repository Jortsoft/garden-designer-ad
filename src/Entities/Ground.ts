import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GROUND_MODEL_PATH = 'assets/gltf/ground2.glb';
const TARGET_GROUND_SIZE = 6;

export class Ground extends THREE.Group {
  private readonly loader = new GLTFLoader();
  private isLoaded = false;
  private isLoading = false;

  constructor() {
    super();
    this.name = 'Ground';
  }

  load() {
    if (this.isLoaded || this.isLoading) {
      return;
    }

    this.isLoading = true;

    this.loader.load(
      GROUND_MODEL_PATH,
      (gltf) => {
        const groundModel = gltf.scene;

        this.prepareModel(groundModel);
        this.add(groundModel);
        this.isLoaded = true;
        this.isLoading = false;
      },
      undefined,
      (error) => {
        this.isLoading = false;
        console.error(`Failed to load ground model: ${GROUND_MODEL_PATH}`, error);
      },
    );
  }

  private prepareModel(model: THREE.Object3D) {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
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
}
