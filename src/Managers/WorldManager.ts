import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { Land } from '../Entities/Land';
import { PlaceHolder } from '../Entities/PlaceHolder';
import { DebugManager } from './DebugManager';
import { GroundPlacementDebugManager } from './GroundPlacementDebugManager';
import { LightingManager } from './LightingManager';
import { PlaceHolderActivationManager } from './PlaceHolderActivationManager';
import { PostProcessingManager } from './PostProcessingManager';
import { CameraController } from '../Systems/CameraController';
import { WindWaveSystem } from '../Effects/WindWaveEffect';
import { PlaceVegetablesUI } from '../UI/PlaceVegetablesUI';

export class WorldManager {
    private readonly root = new THREE.Group();
    private readonly ground: Ground;
    private readonly land: Land;
    private readonly placeHolder: PlaceHolder;
    private readonly windWaveSystem: WindWaveSystem;
    private readonly scene: THREE.Scene;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly cameraController: CameraController;
    private readonly debugManager: DebugManager;
    private readonly groundPlacementDebugManager: GroundPlacementDebugManager;
    private readonly placeHolderActivationManager: PlaceHolderActivationManager;
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
        this.land = new Land(renderer.capabilities.getMaxAnisotropy());
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
        const isInputBlockedByOverlay = (screenX: number, screenY: number) =>
            this.debugManager.isScreenPointBlocked(screenX, screenY) ||
            this.placeVegetablesUI.isScreenPointBlocked(screenX, screenY);
        this.cameraController = new CameraController(
            this.camera,
            inputElement,
            isInputBlockedByOverlay,
        );
        this.groundPlacementDebugManager = new GroundPlacementDebugManager(
            this.camera,
            this.ground,
            inputElement,
            isInputBlockedByOverlay,
        );
        this.placeHolderActivationManager = new PlaceHolderActivationManager(
            this.camera,
            this.placeHolder,
            inputElement,
            () => this.placeVegetablesUI.show(),
            isInputBlockedByOverlay,
        );
        this.root.add(this.ground);
        this.root.add(this.land);
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
        this.placeHolderActivationManager.initialize();
        this.windWaveSystem.initialize();
        return Promise.all([
            this.ground.load(),
            this.land.load(),
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
        this.placeHolderActivationManager.dispose();
        this.debugManager.dispose();
        this.postProcessingManager.dispose();
        this.lightingManager.dispose();
        this.windWaveSystem.dispose();
        this.land.dispose();
        this.placeHolder.dispose();
        this.placeVegetablesUI.dispose();
        this.root.clear();
        this.scene.remove(this.root);
        this.scene.remove(this.camera);
    }
}
