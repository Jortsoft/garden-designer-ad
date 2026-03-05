import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { Land } from '../Entities/Land';
import { PlaceHolder } from '../Entities/PlaceHolder';
import { Vegetable } from '../Entities/Vegetable';
import { PlantId } from '../Models/PlaceVegetable.model';
import { DebugManager } from './DebugManager';
import { GroundPlacementDebugManager } from './GroundPlacementDebugManager';
import { LightingManager } from './LightingManager';
import { PlaceHolderActivationManager } from './PlaceHolderActivationManager';
import { PostProcessingManager } from './PostProcessingManager';
import { CameraController } from '../Systems/CameraController';
import { WindWaveSystem } from '../Effects/WindWaveEffect';
import { PlaceVegetablesUI } from '../UI/PlaceVegetablesUI';

const VEGETABLE_MODEL_PATHS: Record<PlantId, string> = {
    [PlantId.corn]: 'assets/gltf/corns/corn_level3.glb',
    [PlantId.grape]: 'assets/gltf/grapes/grape_level3.glb',
    [PlantId.strawberry]: 'assets/gltf/strawberys/strawbery_level3.glb',
};
const PLANTING_CAMERA_MOVE = {
    x: 0.590,
    y: 0.565,
    z: 2.254,
    durationSeconds: 0.55,
} as const;

export class WorldManager {
    private readonly root = new THREE.Group();
    private readonly ground: Ground;
    private readonly land: Land;
    private readonly placeHolder: PlaceHolder;
    private readonly vegetables = new Map<PlantId, Vegetable>();
    private readonly windWaveSystem: WindWaveSystem;
    private readonly scene: THREE.Scene;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly cameraController: CameraController;
    private readonly debugManager: DebugManager;
    private readonly groundPlacementDebugManager: GroundPlacementDebugManager;
    private readonly placeHolderActivationManager: PlaceHolderActivationManager;
    private readonly placeVegetablesUI: PlaceVegetablesUI;
    private selectedPlantId: PlantId | null = null;
    private isPlantSelectionActive = false;
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
        this.placeVegetablesUI.setOnPlantSelected(this.handlePlantSelected);
        this.placeVegetablesUI.setOnPlanRequested(this.handlePlanRequested);
        this.registerVegetables(renderer.capabilities.getMaxAnisotropy());
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
            () => {
                this.isPlantSelectionActive = true;
                this.placeVegetablesUI.show();
                this.cameraController.MoveCamera(PLANTING_CAMERA_MOVE);
            },
            isInputBlockedByOverlay,
        );
        this.root.add(this.ground);
        this.root.add(this.land);
        for (const vegetable of this.vegetables.values()) {
            this.root.add(vegetable);
        }
        this.root.add(this.placeHolder);
        this.root.add(this.windWaveSystem);
        this.scene.add(this.camera);
        this.scene.add(this.root);
    }

    async initialize() {
        this.lightingManager.initialize();
        this.debugManager.initialize();
        this.cameraController.initialize();
        this.groundPlacementDebugManager.initialize(this.root);
        this.placeHolderActivationManager.initialize();
        this.windWaveSystem.initialize();

        await Promise.all([
            this.ground.load(),
            this.land.load(),
        ]);

        const landSlotOffsets = this.land.getSlotOffsets();
        for (const vegetable of this.vegetables.values()) {
            vegetable.setSlotOffsets(landSlotOffsets);
        }

        await Promise.all([
            ...Array.from(this.vegetables.values(), (vegetable) => vegetable.load()),
            this.placeHolder.load(),
            this.placeVegetablesUI.initialize(),
        ]);
    }

    update(deltaSeconds: number) {
        this.cameraController.update(deltaSeconds);
        this.placeHolder.update(deltaSeconds);
        this.windWaveSystem.update(deltaSeconds);
        for (const vegetable of this.vegetables.values()) {
            vegetable.update(deltaSeconds);
        }
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
        for (const vegetable of this.vegetables.values()) {
            vegetable.dispose();
        }
        this.vegetables.clear();
        this.placeHolder.dispose();
        this.placeVegetablesUI.setOnPlantSelected(null);
        this.placeVegetablesUI.setOnPlanRequested(null);
        this.placeVegetablesUI.dispose();
        this.root.clear();
        this.scene.remove(this.root);
        this.scene.remove(this.camera);
    }

    private registerVegetables(maxTextureAnisotropy: number) {
        for (const plantId of Object.values(PlantId)) {
            const modelPath = VEGETABLE_MODEL_PATHS[plantId];

            if (!modelPath) {
                continue;
            }

            const vegetable = new Vegetable({
                plantId,
                modelPath,
                maxTextureAnisotropy,
                isVisibleInitially: false,
            });

            this.vegetables.set(plantId, vegetable);
        }
    }

    private readonly handlePlantSelected = (plantId: PlantId) => {
        this.selectedPlantId = plantId;
        this.applyVegetablePlacementState();
    };

    private readonly handlePlanRequested = () => {
        if (!this.selectedPlantId) {
            return;
        }

        const selectedVegetable = this.vegetables.get(this.selectedPlantId) ?? null;
        this.isPlantSelectionActive = false;
        this.placeVegetablesUI.hide();
        this.applyVegetablePlacementState();
        selectedVegetable?.playGrowAnimation();
    };

    private applyVegetablePlacementState() {
        for (const [entryPlantId, vegetable] of this.vegetables.entries()) {
            const isSelectedPlant = this.selectedPlantId === entryPlantId;

            vegetable.setShown(isSelectedPlant);
            vegetable.setPreviewMode(isSelectedPlant && this.isPlantSelectionActive);
        }
    };
}
