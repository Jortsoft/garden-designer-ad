import * as THREE from 'three';
import { Ground } from '../Entities/Ground';
import { Land } from '../Entities/Land';
import { PlaceHolder } from '../Entities/PlaceHolder';
import { Vegetable, type VegetableGrowthLevel } from '../Entities/Vegetable';
import { PlantId } from '../Models/PlaceVegetable.model';
import { DebugManager } from './DebugManager';
import { GroundPlacementDebugManager } from './GroundPlacementDebugManager';
import { LightingManager } from './LightingManager';
import { PlaceHolderActivationManager } from './PlaceHolderActivationManager';
import { PostProcessingManager } from './PostProcessingManager';
import { CameraController } from '../Systems/CameraController';
import { WindWaveSystem } from '../Effects/WindWaveEffect';
import { PlaceVegetablesUI } from '../UI/PlaceVegetablesUI';
import { SkipDayUI } from '../UI/SkipDayUI';
import { SickleUI } from '../UI/SickleUI';
import { FarmResourcesUI } from '../UI/FarmResourcesUI';

const VEGETABLE_MODEL_PATHS_BY_LEVEL: Record<PlantId, Record<VegetableGrowthLevel, string>> = {
    [PlantId.corn]: {
        1: 'assets/gltf/corns/corn_level1.glb',
        2: 'assets/gltf/corns/corn_level2.glb',
        3: 'assets/gltf/corns/corn_level3.glb',
    },
    [PlantId.grape]: {
        1: 'assets/gltf/grapes/grape_level1.glb',
        2: 'assets/gltf/grapes/grape_level2.glb',
        3: 'assets/gltf/grapes/grape_level3.glb',
    },
    [PlantId.strawberry]: {
        1: 'assets/gltf/strawberys/strawbery_level1.glb',
        2: 'assets/gltf/strawberys/strawbery_level2.glb',
        3: 'assets/gltf/strawberys/strawbery_level3.glb',
    },
};
const PLANTING_CAMERA_MOVE = {
    x: 0.590,
    y: 0.565,
    z: 2.254,
    durationSeconds: 0.55,
} as const;
const SKIP_DAY_DURATION_SECONDS = 3;
const SKIP_DAY_TIME_SCALE = 5;
const HARVEST_RESOURCE_GAIN = 6;
const SKIP_DAY_LEVEL_2_PROGRESS = 0.5;
const SKIP_DAY_NIGHT_SUN_Y = 0.12;
const SKIP_DAY_SUN_ORBIT_RADIUS_X = 5.4;
const SKIP_DAY_SUN_ORBIT_START_ANGLE = Math.PI * 0.5;
const SKIP_DAY_SUN_ROTATION_RADIANS = Math.PI * 2;
const SKIP_DAY_NIGHT_SUN_INTENSITY_MULTIPLIER = 0.15;
const SKIP_DAY_NIGHT_AMBIENT_INTENSITY_MULTIPLIER = 0.24;
const SKIP_DAY_NIGHT_EXPOSURE_MULTIPLIER = 0.45;
const SKIP_DAY_NIGHT_VIGNETTE_BOOST = 0.2;
const SKIP_DAY_NIGHT_BLEND_POWER = 1.3;
// Tune skip button position above Land here (x, y, z in world units).
const SKIP_BUTTON_WORLD_OFFSET = new THREE.Vector3(0.06, 0.15, 0);

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
    private readonly skipDayUI: SkipDayUI;
    private readonly sickleUI: SickleUI;
    private readonly farmResourcesUI: FarmResourcesUI;
    private selectedPlantId: PlantId | null = null;
    private isPlantSelectionActive = false;
    private isSkipDayCycleActive = false;
    private isHarvestAnimationActive = false;
    private skipDayElapsedSeconds = 0;
    private skipDayPlantId: PlantId | null = null;
    private harvestPlantId: PlantId | null = null;
    private skipDayBaseSunX = 0;
    private skipDayBaseSunY = 0;
    private skipDayBaseSunIntensity = 0;
    private skipDayBaseAmbientIntensity = 0;
    private skipDayBaseExposure = 0;
    private skipDayBaseVignetteIntensity = 0;
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
        this.skipDayUI = new SkipDayUI(inputElement, this.camera);
        this.sickleUI = new SickleUI(inputElement, this.camera);
        this.farmResourcesUI = new FarmResourcesUI(inputElement, renderer);
        this.skipDayUI.attachTo(this.land, SKIP_BUTTON_WORLD_OFFSET);
        this.sickleUI.attachTo(this.land, SKIP_BUTTON_WORLD_OFFSET);
        this.placeVegetablesUI.setOnPlantSelected(this.handlePlantSelected);
        this.placeVegetablesUI.setOnPlanRequested(this.handlePlanRequested);
        this.skipDayUI.setOnSkipRequested(this.handleSkipDayRequested);
        this.sickleUI.setOnHarvestRequested(this.handleHarvestRequested);
        this.registerVegetables(renderer.capabilities.getMaxAnisotropy());
        const isInputBlockedByOverlay = (screenX: number, screenY: number) =>
            this.isSkipDayCycleActive ||
            this.isHarvestAnimationActive ||
            this.debugManager.isScreenPointBlocked(screenX, screenY) ||
            this.placeVegetablesUI.isScreenPointBlocked(screenX, screenY) ||
            this.skipDayUI.isScreenPointBlocked(screenX, screenY) ||
            this.sickleUI.isScreenPointBlocked(screenX, screenY);
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
                if (
                    this.isSkipDayCycleActive ||
                    this.isHarvestAnimationActive ||
                    this.harvestPlantId !== null
                ) {
                    return;
                }

                this.isPlantSelectionActive = true;
                this.skipDayPlantId = null;
                this.harvestPlantId = null;
                this.skipDayUI.hide();
                this.sickleUI.hide();
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
        this.root.add(this.skipDayUI.getObject3D());
        this.root.add(this.sickleUI.getObject3D());
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
            this.skipDayUI.initialize(),
            this.sickleUI.initialize(),
            this.farmResourcesUI.initialize(),
        ]);
    }

    update(deltaSeconds: number) {
        const simulationDeltaSeconds = deltaSeconds * this.getSimulationTimeScale();

        if (!this.isSkipDayCycleActive && !this.isHarvestAnimationActive) {
            this.cameraController.update(simulationDeltaSeconds);
        }
        this.placeHolder.update(simulationDeltaSeconds);
        this.windWaveSystem.update(simulationDeltaSeconds);
        this.updateSkipDayCycle(deltaSeconds);
        for (const vegetable of this.vegetables.values()) {
            vegetable.update(simulationDeltaSeconds);
        }
        this.placeVegetablesUI.update(simulationDeltaSeconds);
        this.skipDayUI.update(simulationDeltaSeconds);
        this.sickleUI.update(simulationDeltaSeconds);
        this.farmResourcesUI.update(deltaSeconds);
        this.debugManager.update(deltaSeconds);
    }

    render() {
        this.postProcessingManager.render();
        this.debugManager.render();
        this.placeVegetablesUI.render();
        this.skipDayUI.render();
        this.sickleUI.render();
        this.farmResourcesUI.render();
    }

    updateViewport(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.postProcessingManager.setSize(width, height);
        this.debugManager.updateViewport(width, height);
        this.placeVegetablesUI.updateViewport(width, height);
        this.skipDayUI.updateViewport(width, height);
        this.sickleUI.updateViewport(width, height);
        this.farmResourcesUI.updateViewport(width, height);
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
        this.skipDayUI.setOnSkipRequested(null);
        this.skipDayUI.dispose();
        this.sickleUI.setOnHarvestRequested(null);
        this.sickleUI.dispose();
        this.farmResourcesUI.dispose();
        this.root.clear();
        this.scene.remove(this.root);
        this.scene.remove(this.camera);
    }

    private registerVegetables(maxTextureAnisotropy: number) {
        for (const plantId of Object.values(PlantId)) {
            const modelPathsByLevel = VEGETABLE_MODEL_PATHS_BY_LEVEL[plantId];

            if (!modelPathsByLevel) {
                continue;
            }

            const vegetable = new Vegetable({
                plantId,
                modelPathsByLevel,
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
        if (!selectedVegetable) {
            return;
        }

        this.isPlantSelectionActive = false;
        this.placeVegetablesUI.hide();
        this.placeHolder.visible = false;
        selectedVegetable.setGrowthLevel(1);
        this.skipDayPlantId = this.selectedPlantId;
        this.harvestPlantId = null;
        this.skipDayUI.setWorldOffset(SKIP_BUTTON_WORLD_OFFSET);
        this.sickleUI.hide();
        this.skipDayUI.show();
        this.applyVegetablePlacementState();
        selectedVegetable.playGrowAnimation();
    };

    private readonly handleSkipDayRequested = () => {
        if (this.isSkipDayCycleActive || !this.skipDayPlantId) {
            return;
        }

        this.startSkipDayCycle();
    };

    private readonly handleHarvestRequested = () => {
        if (this.isSkipDayCycleActive || this.isHarvestAnimationActive || !this.harvestPlantId) {
            return;
        }

        const harvestVegetable = this.vegetables.get(this.harvestPlantId) ?? null;
        if (!harvestVegetable) {
            this.harvestPlantId = null;
            this.sickleUI.hide();
            return;
        }

        this.isHarvestAnimationActive = true;
        this.sickleUI.hide();
        this.debugManager.setInteractionLocked(true);
        harvestVegetable.playHarvestAnimation(() => {
            const harvestedPlantId = harvestVegetable.plantId;
            const rewardStartWorldPositions = harvestVegetable.getSlotWorldPositions();
            this.harvestPlantId = null;
            this.skipDayPlantId = null;
            if (this.selectedPlantId === harvestedPlantId) {
                this.selectedPlantId = null;
            }
            this.isPlantSelectionActive = false;
            harvestVegetable.setShown(false);
            harvestVegetable.setPreviewMode(false);
            this.applyVegetablePlacementState();

            void this.farmResourcesUI
                .playResourceGainAnimation(
                    harvestedPlantId,
                    HARVEST_RESOURCE_GAIN,
                    rewardStartWorldPositions,
                    this.camera,
                )
                .finally(() => {
                    this.isHarvestAnimationActive = false;
                    this.debugManager.setInteractionLocked(false);
                });
        });
    };

    private applyVegetablePlacementState() {
        for (const [entryPlantId, vegetable] of this.vegetables.entries()) {
            const isSelectedPlant = this.selectedPlantId === entryPlantId;
            const isInSelectionPreview = isSelectedPlant && this.isPlantSelectionActive;

            if (isInSelectionPreview) {
                vegetable.setGrowthLevel(3);
            }

            vegetable.setShown(isSelectedPlant);
            vegetable.setPreviewMode(isInSelectionPreview);
        }
    }

    private startSkipDayCycle() {
        this.isSkipDayCycleActive = true;
        this.skipDayElapsedSeconds = 0;
        this.skipDayUI.hide();
        this.sickleUI.hide();
        this.debugManager.setInteractionLocked(true);
        this.skipDayBaseSunX = this.lightingManager.getValue('sunX');
        this.skipDayBaseSunY = this.lightingManager.getValue('sunY');
        this.skipDayBaseSunIntensity = this.lightingManager.getValue('sunIntensity');
        this.skipDayBaseAmbientIntensity = this.lightingManager.getValue('ambientIntensity');
        this.skipDayBaseExposure = this.postProcessingManager.getValue('exposure');
        this.skipDayBaseVignetteIntensity = this.postProcessingManager.getValue('vignetteIntensity');
        this.applySkipDayLighting(0);
    }

    private updateSkipDayCycle(deltaSeconds: number) {
        if (!this.isSkipDayCycleActive) {
            return;
        }

        this.skipDayElapsedSeconds = Math.min(
            this.skipDayElapsedSeconds + Math.max(0, deltaSeconds),
            SKIP_DAY_DURATION_SECONDS,
        );

        const cycleProgress = SKIP_DAY_DURATION_SECONDS <= Number.EPSILON
            ? 1
            : THREE.MathUtils.clamp(this.skipDayElapsedSeconds / SKIP_DAY_DURATION_SECONDS, 0, 1);

        this.applySkipDayLighting(cycleProgress);

        const selectedVegetable = this.skipDayPlantId
            ? (this.vegetables.get(this.skipDayPlantId) ?? null)
            : null;

        if (selectedVegetable) {
            if (cycleProgress >= 1) {
                selectedVegetable.setGrowthLevel(3);
            } else if (cycleProgress >= SKIP_DAY_LEVEL_2_PROGRESS) {
                selectedVegetable.setGrowthLevel(2);
            } else {
                selectedVegetable.setGrowthLevel(1);
            }
        }

        if (cycleProgress < 1) {
            return;
        }

        this.completeSkipDayCycle();
    }

    private applySkipDayLighting(cycleProgress: number) {
        const progress = THREE.MathUtils.clamp(cycleProgress, 0, 1);
        const orbitMinY = Math.min(this.skipDayBaseSunY, SKIP_DAY_NIGHT_SUN_Y);
        const orbitMaxY = Math.max(this.skipDayBaseSunY, SKIP_DAY_NIGHT_SUN_Y);
        const orbitCenterY = (orbitMinY + orbitMaxY) * 0.5;
        const orbitRadiusY = Math.max((orbitMaxY - orbitMinY) * 0.5, 0.001);
        const orbitAngle =
            SKIP_DAY_SUN_ORBIT_START_ANGLE -
            progress * SKIP_DAY_SUN_ROTATION_RADIANS;
        const sunX =
            this.skipDayBaseSunX +
            Math.cos(orbitAngle) * SKIP_DAY_SUN_ORBIT_RADIUS_X;
        const sunY = orbitCenterY + Math.sin(orbitAngle) * orbitRadiusY;
        const daylightAmount = THREE.MathUtils.clamp(
            (sunY - orbitMinY) / Math.max(orbitMaxY - orbitMinY, 0.001),
            0,
            1,
        );
        const nightBlend = Math.pow(1 - daylightAmount, SKIP_DAY_NIGHT_BLEND_POWER);
        const sunIntensity = THREE.MathUtils.lerp(
            this.skipDayBaseSunIntensity,
            this.skipDayBaseSunIntensity * SKIP_DAY_NIGHT_SUN_INTENSITY_MULTIPLIER,
            nightBlend,
        );
        const ambientIntensity = THREE.MathUtils.lerp(
            this.skipDayBaseAmbientIntensity,
            this.skipDayBaseAmbientIntensity * SKIP_DAY_NIGHT_AMBIENT_INTENSITY_MULTIPLIER,
            nightBlend,
        );
        const exposure = THREE.MathUtils.lerp(
            this.skipDayBaseExposure,
            this.skipDayBaseExposure * SKIP_DAY_NIGHT_EXPOSURE_MULTIPLIER,
            nightBlend,
        );
        const vignette = THREE.MathUtils.lerp(
            this.skipDayBaseVignetteIntensity,
            this.skipDayBaseVignetteIntensity + SKIP_DAY_NIGHT_VIGNETTE_BOOST,
            nightBlend,
        );

        this.lightingManager.setValue('sunX', sunX);
        this.lightingManager.setValue('sunY', sunY);
        this.lightingManager.setValue('sunIntensity', sunIntensity);
        this.lightingManager.setValue('ambientIntensity', ambientIntensity);
        this.postProcessingManager.setValue('exposure', exposure);
        this.postProcessingManager.setValue('vignetteIntensity', vignette);
    }

    private completeSkipDayCycle() {
        const completedPlantId = this.skipDayPlantId;

        this.isSkipDayCycleActive = false;
        this.skipDayElapsedSeconds = 0;
        this.debugManager.setInteractionLocked(false);
        this.lightingManager.setValue('sunX', this.skipDayBaseSunX);
        this.lightingManager.setValue('sunY', this.skipDayBaseSunY);
        this.lightingManager.setValue('sunIntensity', this.skipDayBaseSunIntensity);
        this.lightingManager.setValue('ambientIntensity', this.skipDayBaseAmbientIntensity);
        this.postProcessingManager.setValue('exposure', this.skipDayBaseExposure);
        this.postProcessingManager.setValue('vignetteIntensity', this.skipDayBaseVignetteIntensity);
        this.skipDayPlantId = null;
        this.skipDayUI.hide();

        if (completedPlantId) {
            const completedVegetable = this.vegetables.get(completedPlantId) ?? null;

            if (completedVegetable) {
                completedVegetable.setGrowthLevel(3);
                this.harvestPlantId = completedPlantId;
                this.sickleUI.setWorldOffset(SKIP_BUTTON_WORLD_OFFSET);
                this.sickleUI.show();
            }
        }
    }

    private getSimulationTimeScale() {
        if (!this.isSkipDayCycleActive) {
            return 1;
        }

        return SKIP_DAY_TIME_SCALE;
    }
}
