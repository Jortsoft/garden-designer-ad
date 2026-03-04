import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { PlaceHolder } from '../Entities/PlaceHolder';
import { DebugManager } from './DebugManager';
import { GroundPlacementDebugManager } from './GroundPlacementDebugManager';
import { LightingManager } from './LightingManager';
import { PostProcessingManager } from './PostProcessingManager';
import { CameraController } from '../Systems/CameraController';
import { WindWaveSystem } from '../Effects/WindWaveEffect';
import { PlaceVegetablesUI } from '../UI/PlaceVegetablesUI';

export class WorldManager {
    private readonly root = new THREE.Group();
    private readonly ground: Ground;
    private readonly placeHolder: PlaceHolder;
    private readonly windWaveSystem: WindWaveSystem;
    private readonly scene: THREE.Scene;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly cameraController: CameraController;
    private readonly debugManager: DebugManager;
    private readonly groundPlacementDebugManager: GroundPlacementDebugManager;
    private readonly placeVegetablesUI: PlaceVegetablesUI;
    readonly camera: THREE.PerspectiveCamera;

    constructor(
        scene: THREE.Scene,
        inputElement: HTMLElement,
        renderer: THREE.WebGLRenderer,
    ) {
        this.scene = scene;
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 160);
        this.ground = new Ground(renderer.capabilities.getMaxAnisotropy());
        this.placeHolder = new PlaceHolder(renderer.capabilities.getMaxAnisotropy());
        this.windWaveSystem = new WindWaveSystem();
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
        this.placeVegetablesUI = new PlaceVegetablesUI(inputElement, renderer);
        this.cameraController = new CameraController(
            this.camera,
            inputElement,
            (screenX, screenY) =>
                this.debugManager.isScreenPointBlocked(screenX, screenY) ||
                this.placeVegetablesUI.isScreenPointBlocked(screenX, screenY),
        );
        this.groundPlacementDebugManager = new GroundPlacementDebugManager(
            this.camera,
            this.ground,
            inputElement,
            (screenX, screenY) =>
                this.debugManager.isScreenPointBlocked(screenX, screenY) ||
                this.placeVegetablesUI.isScreenPointBlocked(screenX, screenY),
        );
        this.root.add(this.ground);
        this.root.add(this.placeHolder);
        this.root.add(this.windWaveSystem);
        this.scene.add(this.camera);
        this.scene.add(this.root);
    }

    initialize() {
        this.lightingManager.initialize();
        this.debugManager.initialize();
        this.cameraController.initialize();
        this.groundPlacementDebugManager.initialize(this.root);
        this.windWaveSystem.initialize();
        return Promise.all([
            this.ground.load(),
            this.placeHolder.load(),
            this.placeVegetablesUI.initialize(),
        ]).then(() => undefined);
    }

    update(deltaSeconds: number) {
        this.cameraController.update(deltaSeconds);
        this.placeHolder.update(deltaSeconds);
        this.windWaveSystem.update(deltaSeconds);
        this.placeVegetablesUI.update(deltaSeconds);
        this.debugManager.update(deltaSeconds);
    }

    render() {
        this.postProcessingManager.render();
        this.debugManager.render();
        this.placeVegetablesUI.render();
    }

    updateViewport(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.postProcessingManager.setSize(width, height);
        this.debugManager.updateViewport(width, height);
        this.placeVegetablesUI.updateViewport(width, height);
    }

    dispose() {
        this.cameraController.dispose();
        this.groundPlacementDebugManager.dispose();
        this.debugManager.dispose();
        this.postProcessingManager.dispose();
        this.lightingManager.dispose();
        this.windWaveSystem.dispose();
        this.placeHolder.dispose();
        this.placeVegetablesUI.dispose();
        this.root.clear();
        this.scene.remove(this.root);
        this.scene.remove(this.camera);
    }
}
