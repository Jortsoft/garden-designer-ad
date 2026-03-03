import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { DebugManager } from './DebugManager';

export class WorldManager {
  private readonly root = new THREE.Group();
  private readonly ground = new Ground();
  private readonly scene: THREE.Scene;
  private readonly debugManager: DebugManager;
  readonly camera: THREE.PerspectiveCamera;

    constructor(scene: THREE.Scene, inputElement: HTMLElement) {
        this.scene = scene;
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
        this.debugManager = new DebugManager(this.camera, inputElement);
        this.root.add(this.ground);
        this.scene.add(this.camera);
        this.scene.add(this.root);
    }

  initialize() {
    this.configureCamera();
    this.configureLighting();
    this.debugManager.initialize();
    this.ground.load();
  }

  update(deltaSeconds: number) {
    this.debugManager.update(deltaSeconds);
  }

    updateViewport(aspect: number) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.debugManager.updateViewport();
    }

  dispose() {
    this.debugManager.dispose();
  }

  private configureCamera() {
    this.camera.position.set(0, 3.5, 7);
    this.camera.lookAt(0, 0.75, 0);
  }

  private configureLighting() {
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight('#ffffff', 1.6);
    directionalLight.position.set(4, 6, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }
}
