import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { DebugManager } from './DebugManager';
import { LightingManager } from './LightingManager';
import { PostProcessingManager } from './PostProcessingManager';
import { CameraController } from '../Systems/CameraController';

export class WorldManager {
    private readonly root = new THREE.Group();
    private readonly ground: Ground;
    private readonly scene: THREE.Scene;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly cameraController: CameraController;
    private readonly debugManager: DebugManager;
    readonly camera: THREE.PerspectiveCamera;

    constructor(
        scene: THREE.Scene,
        inputElement: HTMLElement,
        renderer: THREE.WebGLRenderer,
    ) {
        this.scene = scene;
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
        this.ground = new Ground(renderer.capabilities.getMaxAnisotropy());
        this.lightingManager = new LightingManager(this.scene);
        this.postProcessingManager = new PostProcessingManager(
            renderer,
            this.scene,
            this.camera,
        );
        this.debugManager = new DebugManager(
            inputElement,
            renderer,
            this.lightingManager,
            this.postProcessingManager,
        );
        this.cameraController = new CameraController(
            this.camera,
            inputElement,
            (screenX, screenY) => this.debugManager.isScreenPointBlocked(screenX, screenY),
        );
        this.root.add(this.ground);
        this.scene.add(this.camera);
        this.scene.add(this.root);
    }

    initialize() {
        this.lightingManager.initialize();
        this.debugManager.initialize();
        this.cameraController.initialize();
        this.ground.load();
    }

    update(deltaSeconds: number) {
        this.cameraController.update(deltaSeconds);
        this.debugManager.update(deltaSeconds);
    }

    render() {
        this.postProcessingManager.render();
        this.debugManager.render();
    }

    updateViewport(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.postProcessingManager.setSize(width, height);
        this.debugManager.updateViewport(width, height);
    }

    dispose() {
        this.cameraController.dispose();
        this.debugManager.dispose();
    }
}
