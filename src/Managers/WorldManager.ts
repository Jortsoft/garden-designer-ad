import * as THREE from 'three';
import { Animal } from '../Entities/Animal';
import { AnimalHome } from '../Entities/AnimalHome';
import { Ground } from '../Entities/Ground';
import { Land } from '../Entities/Land';
import { Market } from '../Entities/Market';
import { PlaceHolder } from '../Entities/PlaceHolder';
import { Vegetable } from '../Entities/Vegetable';
import { getAnimalPrice, type AnimalId } from '../Models/Animal.model';
import {
    MARKET_SELL_PRICE_PER_UNIT,
    type MarketScreenPoint,
    type MarketResourceCounts,
} from '../Models/Market.model';
import { PlantId } from '../Models/PlaceVegetable.model';
import type { VegetableGrowthLevel } from '../Models/Vegetable.model';
import { DebugManager } from './DebugManager';
import { GroundPlacementDebugManager } from './GroundPlacementDebugManager';
import { LightingManager } from './LightingManager';
import { MarketActivationManager } from './MarketActivationManager';
import { PlaceHolderActivationManager } from './PlaceHolderActivationManager';
import { PostProcessingManager } from './PostProcessingManager';
import { TutorialGuideManager } from './TutorialGuideManager';
import { CameraController } from '../Systems/CameraController';
import { GameState } from '../Systems/GameState';
import { PixiUI } from '../Systems/PixiUI';
import { WindWaveSystem } from '../Effects/WindWaveEffect';
import { PlaceVegetablesUI } from '../UI/PlaceVegetablesUI';
import { SkipDayUI } from '../UI/SkipDayUI';
import { SickleUI } from '../UI/SickleUI';
import { FarmResourcesUI } from '../UI/FarmResourcesUI';
import { AnimalShopUI } from '../UI/AnimalShopUI';
import { MarketModalUI } from '../UI/MarketModalUI';
import { EndCardUI } from '../UI/EndCardUI';
import { GameConfig } from './GameConfig';

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
const MARKET_TUTORIAL_CAMERA_MOVE = {
    x: 1.19,
    y: 0.565,
    z: 2.22,
    durationSeconds: 0.65,
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
const END_CARD_DELAY_SECONDS = 3;
const END_CARD_BLUR_PIXELS = 8;
const SKIP_BUTTON_WORLD_OFFSET = new THREE.Vector3(0.06, 0.15, 0);
const ANIMAL_SHOP_PLACEHOLDER_POSITION = new THREE.Vector3(1.092, 0.09, 2.117);
const ANIMAL_HOME_MODEL_SCALE = 0.02;
const ANIMAL_MODEL_SCALE = 0.02;

export class WorldManager {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly root = new THREE.Group();
    private readonly ground: Ground;
    private readonly land: Land;
    private readonly market: Market;
    private readonly placeHolder: PlaceHolder;
    private readonly animalShopPlaceHolder: PlaceHolder;
    private readonly animalHome: AnimalHome;
    private readonly animal: Animal;
    private readonly vegetables = new Map<PlantId, Vegetable>();
    private readonly windWaveSystem: WindWaveSystem;
    private readonly scene: THREE.Scene;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly pixiUI: PixiUI;
    private readonly cameraController: CameraController;
    private readonly debugManager: DebugManager;
    private readonly groundPlacementDebugManager: GroundPlacementDebugManager;
    private readonly marketActivationManager: MarketActivationManager;
    private readonly placeHolderActivationManager: PlaceHolderActivationManager;
    private readonly animalShopPlaceHolderActivationManager: PlaceHolderActivationManager;
    private readonly placeVegetablesUI: PlaceVegetablesUI;
    private readonly animalShopUI: AnimalShopUI;
    private readonly marketModalUI: MarketModalUI;
    private readonly skipDayUI: SkipDayUI;
    private readonly sickleUI: SickleUI;
    private readonly farmResourcesUI: FarmResourcesUI;
    private readonly endCardUI: EndCardUI;
    private readonly tutorialGuideManager: TutorialGuideManager;
    private readonly gameState = new GameState();
    private skipDayElapsedSeconds = 0;
    private skipDayBaseSunX = 0;
    private skipDayBaseSunY = 0;
    private skipDayBaseSunIntensity = 0;
    private skipDayBaseAmbientIntensity = 0;
    private skipDayBaseExposure = 0;
    private skipDayBaseVignetteIntensity = 0;
    private isEndCardScheduled = false;
    private endCardDelayElapsedSeconds = 0;
    private isEndCardVisible = false;
    readonly camera: THREE.PerspectiveCamera;

    constructor(
        scene: THREE.Scene,
        inputElement: HTMLElement,
        renderer: THREE.WebGLRenderer,
        pixiUI: PixiUI,
    ) {
        this.scene = scene;
        this.renderer = renderer;
        this.pixiUI = pixiUI;
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 160);
        this.ground = new Ground(renderer.capabilities.getMaxAnisotropy());
        this.land = new Land(renderer.capabilities.getMaxAnisotropy());
        this.market = new Market();
        this.placeHolder = new PlaceHolder(renderer.capabilities.getMaxAnisotropy());
        this.animalShopPlaceHolder = new PlaceHolder(
            renderer.capabilities.getMaxAnisotropy(),
            {
                name: 'AnimalShopPlaceHolder',
                position: ANIMAL_SHOP_PLACEHOLDER_POSITION,
                isVisibleInitially: false,
            },
        );
        this.animalHome = new AnimalHome(renderer.capabilities.getMaxAnisotropy(), {
            position: ANIMAL_SHOP_PLACEHOLDER_POSITION,
            scale: ANIMAL_HOME_MODEL_SCALE,
            isVisibleInitially: false,
        });
        this.animal = new Animal(renderer.capabilities.getMaxAnisotropy(), {
            position: ANIMAL_SHOP_PLACEHOLDER_POSITION,
            scale: ANIMAL_MODEL_SCALE,
            isVisibleInitially: false,
        });
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
            this.pixiUI,
        );
        this.placeVegetablesUI = new PlaceVegetablesUI(inputElement, this.pixiUI);
        this.animalShopUI = new AnimalShopUI(inputElement, this.pixiUI);
        this.marketModalUI = new MarketModalUI(inputElement, this.pixiUI);
        this.skipDayUI = new SkipDayUI(inputElement, this.camera, this.pixiUI);
        this.sickleUI = new SickleUI(inputElement, this.camera, this.pixiUI);
        this.farmResourcesUI = new FarmResourcesUI(inputElement, this.pixiUI);
        this.endCardUI = new EndCardUI(inputElement, this.pixiUI);
        this.skipDayUI.attachTo(this.land, SKIP_BUTTON_WORLD_OFFSET);
        this.sickleUI.attachTo(this.land, SKIP_BUTTON_WORLD_OFFSET);
        this.placeVegetablesUI.setOnPlantSelected(this.handlePlantSelected);
        this.placeVegetablesUI.setOnPlanRequested(this.handlePlanRequested);
        this.animalShopUI.setOnCloseRequested(this.handleAnimalShopClosed);
        this.animalShopUI.setOnBuyRequested(this.handleAnimalShopBuyRequested);
        this.marketModalUI.setOnCloseRequested(this.handleMarketModalClosed);
        this.marketModalUI.setOnSellRequested(this.handleMarketSellRequested);
        this.skipDayUI.setOnSkipRequested(this.handleSkipDayRequested);
        this.sickleUI.setOnHarvestRequested(this.handleHarvestRequested);
        this.endCardUI.setOnDownloadRequested(this.handleDownloadGameRequested);
        this.registerVegetables(renderer.capabilities.getMaxAnisotropy());
        const isInputBlockedByOverlay = (screenX: number, screenY: number) =>
            this.gameState.isInputFlowBlocked() ||
            this.debugManager.isScreenPointBlocked(screenX, screenY) ||
            this.placeVegetablesUI.isScreenPointBlocked(screenX, screenY) ||
            this.animalShopUI.isScreenPointBlocked(screenX, screenY) ||
            this.marketModalUI.isScreenPointBlocked(screenX, screenY) ||
            this.skipDayUI.isScreenPointBlocked(screenX, screenY) ||
            this.sickleUI.isScreenPointBlocked(screenX, screenY) ||
            this.endCardUI.isScreenPointBlocked(screenX, screenY);
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
        this.marketActivationManager = new MarketActivationManager(
            this.camera,
            this.market,
            inputElement,
            this.handleMarketActivated,
            isInputBlockedByOverlay,
            this.gameState,
        );
        this.placeHolderActivationManager = new PlaceHolderActivationManager(
            this.camera,
            this.placeHolder,
            inputElement,
            () => {
                this.gameState.isPlantSelectionActive = true;
                this.gameState.clearHarvestAndSkipTargets();
                this.skipDayUI.hide();
                this.sickleUI.hide();
                this.placeVegetablesUI.show();
                this.cameraController.MoveCamera(PLANTING_CAMERA_MOVE);
                this.tutorialGuideManager.notifyPrimaryPlaceholderActivated();
            },
            isInputBlockedByOverlay,
            this.gameState,
        );
        this.animalShopPlaceHolderActivationManager = new PlaceHolderActivationManager(
            this.camera,
            this.animalShopPlaceHolder,
            inputElement,
            this.handleAnimalShopPlaceHolderActivated,
            (screenX: number, screenY: number) =>
                isInputBlockedByOverlay(screenX, screenY) ||
                !this.gameState.canActivateAnimalShopPlaceholder() ||
                !this.animalShopPlaceHolder.visible,
            null,
        );
        this.tutorialGuideManager = new TutorialGuideManager({
            camera: this.camera,
            pixiUI: this.pixiUI,
            cameraController: this.cameraController,
            primaryPlaceHolder: this.placeHolder,
            skipDayAnchor: this.land,
            skipDayWorldOffset: SKIP_BUTTON_WORLD_OFFSET,
            marketAnchor: this.market,
            animalShopPlaceHolder: this.animalShopPlaceHolder,
            marketCameraMove: MARKET_TUTORIAL_CAMERA_MOVE,
        });
        this.root.add(this.ground);
        this.root.add(this.land);
        this.root.add(this.market);
        for (const vegetable of this.vegetables.values()) {
            this.root.add(vegetable);
        }
        this.root.add(this.animalHome);
        this.root.add(this.animal);
        this.root.add(this.skipDayUI.getObject3D());
        this.root.add(this.sickleUI.getObject3D());
        this.root.add(this.placeHolder);
        this.root.add(this.animalShopPlaceHolder);
        this.root.add(this.windWaveSystem);
        this.scene.add(this.camera);
        this.scene.add(this.root);
    }

    async initialize() {
        await this.pixiUI.initialize(
            window.innerWidth,
            window.innerHeight,
        );
        this.lightingManager.initialize();
        this.debugManager.initialize();
        this.cameraController.initialize();
        this.groundPlacementDebugManager.initialize(this.root);
        this.marketActivationManager.initialize();
        this.placeHolderActivationManager.initialize();
        this.animalShopPlaceHolderActivationManager.initialize();
        this.windWaveSystem.initialize();

        await Promise.all([
            this.ground.load(),
            this.land.load(),
            this.market.load(),
        ]);

        const landSlotOffsets = this.land.getSlotOffsets();
        for (const vegetable of this.vegetables.values()) {
            vegetable.setSlotOffsets(landSlotOffsets);
        }

        await Promise.all([
            ...Array.from(this.vegetables.values(), (vegetable) => vegetable.load()),
            this.placeHolder.load(),
            this.animalShopPlaceHolder.load(),
            this.animalHome.load(),
            this.animal.load(),
            this.placeVegetablesUI.initialize(),
            this.animalShopUI.initialize(),
            this.marketModalUI.initialize(),
            this.skipDayUI.initialize(),
            this.sickleUI.initialize(),
            this.farmResourcesUI.initialize(),
            this.endCardUI.initialize(),
            this.tutorialGuideManager.initialize(),
        ]);
        this.farmResourcesUI.setMoney(this.gameState.money);
        this.updateAnimalShopAvailability();
        this.tutorialGuideManager.start();
    }

    update(deltaSeconds: number) {
        const simulationDeltaSeconds = deltaSeconds * this.getSimulationTimeScale();

        if (!this.gameState.isInputFlowBlocked()) {
            this.cameraController.update(simulationDeltaSeconds);
        }
        this.placeHolder.update(simulationDeltaSeconds);
        this.animalShopPlaceHolder.update(simulationDeltaSeconds);
        this.animalHome.update(simulationDeltaSeconds);
        this.animal.update(simulationDeltaSeconds);
        this.windWaveSystem.update(simulationDeltaSeconds);
        this.updateSkipDayCycle(deltaSeconds);
        for (const vegetable of this.vegetables.values()) {
            vegetable.update(simulationDeltaSeconds);
        }
        this.placeVegetablesUI.update(simulationDeltaSeconds);
        this.animalShopUI.update(deltaSeconds);
        this.marketModalUI.update(deltaSeconds);
        this.skipDayUI.update(simulationDeltaSeconds);
        this.sickleUI.update(simulationDeltaSeconds);
        this.farmResourcesUI.update(deltaSeconds);
        this.endCardUI.update(deltaSeconds);
        this.tutorialGuideManager.update(deltaSeconds);
        this.debugManager.update(deltaSeconds);
        this.updateEndCardFlow(deltaSeconds);
    }

    render() {
        this.postProcessingManager.render();
        this.debugManager.render();
        this.placeVegetablesUI.render();
        this.animalShopUI.render();
        this.marketModalUI.render();
        this.skipDayUI.render();
        this.sickleUI.render();
        this.farmResourcesUI.render();
        this.endCardUI.render();
        this.tutorialGuideManager.render();
        this.pixiUI.render();
    }

    updateViewport(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.postProcessingManager.setSize(width, height);
        this.debugManager.updateViewport(width, height);
        this.pixiUI.resize(width, height);
        this.placeVegetablesUI.updateViewport(width, height);
        this.animalShopUI.updateViewport(width, height);
        this.marketModalUI.updateViewport(width, height);
        this.skipDayUI.updateViewport(width, height);
        this.sickleUI.updateViewport(width, height);
        this.farmResourcesUI.updateViewport(width, height);
        this.endCardUI.updateViewport(width, height);
        this.tutorialGuideManager.updateViewport(width, height);
    }

    dispose() {
        this.cameraController.dispose();
        this.groundPlacementDebugManager.dispose();
        this.marketActivationManager.dispose();
        this.placeHolderActivationManager.dispose();
        this.animalShopPlaceHolderActivationManager.dispose();
        this.debugManager.dispose();
        this.postProcessingManager.dispose();
        this.lightingManager.dispose();
        this.windWaveSystem.dispose();
        this.market.dispose();
        this.land.dispose();
        this.animalHome.dispose();
        this.animal.dispose();
        for (const vegetable of this.vegetables.values()) {
            vegetable.dispose();
        }
        this.vegetables.clear();
        this.placeHolder.dispose();
        this.animalShopPlaceHolder.dispose();
        this.placeVegetablesUI.setOnPlantSelected(null);
        this.placeVegetablesUI.setOnPlanRequested(null);
        this.placeVegetablesUI.dispose();
        this.animalShopUI.setOnCloseRequested(null);
        this.animalShopUI.setOnBuyRequested(null);
        this.animalShopUI.dispose();
        this.marketModalUI.setOnCloseRequested(null);
        this.marketModalUI.setOnSellRequested(null);
        this.marketModalUI.dispose();
        this.skipDayUI.setOnSkipRequested(null);
        this.skipDayUI.dispose();
        this.sickleUI.setOnHarvestRequested(null);
        this.sickleUI.dispose();
        this.farmResourcesUI.dispose();
        this.endCardUI.setOnDownloadRequested(null);
        this.endCardUI.dispose();
        this.tutorialGuideManager.dispose();
        this.clearEndCardBlur();
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
        this.gameState.selectedPlantId = plantId;
        this.applyVegetablePlacementState();
    };

    private readonly handlePlanRequested = () => {
        if (!this.gameState.selectedPlantId) {
            return;
        }

        const selectedVegetable = this.vegetables.get(this.gameState.selectedPlantId) ?? null;
        if (!selectedVegetable) {
            return;
        }

        this.gameState.isPlantSelectionActive = false;
        this.placeVegetablesUI.hide();
        this.placeHolder.visible = false;
        selectedVegetable.setGrowthLevel(1);
        this.gameState.skipDayPlantId = this.gameState.selectedPlantId;
        this.gameState.harvestPlantId = null;
        this.skipDayUI.setWorldOffset(SKIP_BUTTON_WORLD_OFFSET);
        this.sickleUI.hide();
        this.skipDayUI.show();
        this.tutorialGuideManager.notifyPlantPlanned();
        this.applyVegetablePlacementState();
        selectedVegetable.playGrowAnimation();
    };

    private readonly handleSkipDayRequested = () => {
        if (this.gameState.isSkipDayCycleActive || !this.gameState.skipDayPlantId) {
            return;
        }

        this.startSkipDayCycle();
        this.tutorialGuideManager.notifySkipDayRequested();
    };

    private readonly handleHarvestRequested = () => {
        if (
            this.gameState.isSkipDayCycleActive ||
            this.gameState.isHarvestAnimationActive ||
            !this.gameState.harvestPlantId
        ) {
            return;
        }

        const harvestVegetable = this.vegetables.get(this.gameState.harvestPlantId) ?? null;
        if (!harvestVegetable) {
            this.gameState.harvestPlantId = null;
            this.sickleUI.hide();
            return;
        }

        this.gameState.isHarvestAnimationActive = true;
        this.sickleUI.hide();
        this.debugManager.setInteractionLocked(true);
        harvestVegetable.playHarvestAnimation(() => {
            const harvestedPlantId = harvestVegetable.plantId;
            const rewardStartWorldPositions = harvestVegetable.getSlotWorldPositions();
            this.gameState.harvestPlantId = null;
            this.gameState.skipDayPlantId = null;
            if (this.gameState.selectedPlantId === harvestedPlantId) {
                this.gameState.selectedPlantId = null;
            }
            this.gameState.isPlantSelectionActive = false;
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
                    this.gameState.isHarvestAnimationActive = false;
                    this.debugManager.setInteractionLocked(false);
                    this.tutorialGuideManager.notifyHarvestCompleted();
                });
        });
    };

    private readonly handleMarketActivated = () => {
        if (this.gameState.isInputFlowBlocked()) {
            return;
        }

        this.gameState.isMarketModalOpen = true;
        this.debugManager.setInteractionLocked(true);
        this.marketModalUI.show(this.getCurrentResourceCounts());
        this.tutorialGuideManager.notifyMarketActivated();
    };

    private readonly handleAnimalShopPlaceHolderActivated = () => {
        if (!this.gameState.canActivateAnimalShopPlaceholder()) {
            return;
        }

        this.gameState.isAnimalShopOpen = true;
        this.debugManager.setInteractionLocked(true);
        this.animalShopUI.setMoney(this.gameState.money);
        this.animalShopUI.show();
        this.tutorialGuideManager.notifyAnimalShopPlaceholderActivated();
    };

    private readonly handleAnimalShopClosed = () => {
        this.gameState.isAnimalShopOpen = false;
        this.debugManager.setInteractionLocked(false);
    };

    private readonly handleAnimalShopBuyRequested = (animalId: AnimalId) => {
        if (!this.gameState.isAnimalShopOpen || this.gameState.isAnimalHomePlaced) {
            return;
        }

        const animalPrice = getAnimalPrice(animalId);
        if (this.gameState.money < animalPrice) {
            this.animalShopUI.setMoney(this.gameState.money);
            return;
        }

        this.gameState.money -= animalPrice;
        this.farmResourcesUI.setMoney(this.gameState.money);
        this.gameState.isAnimalHomePlaced = true;
        const animalSpawnPosition = this.animalShopPlaceHolder.position;
        this.animalHome.position.copy(animalSpawnPosition);
        this.animal.position.copy(animalSpawnPosition);
        this.animal.setSelectedAnimal(animalId);
        this.animalHome.playSpawnAnimation();
        this.animal.playSpawnAnimation(0.08);
        this.scheduleEndCard();
        this.updateAnimalShopAvailability();
    };

    private readonly handleMarketModalClosed = () => {
        this.gameState.isMarketModalOpen = false;
        this.debugManager.setInteractionLocked(false);
        this.tutorialGuideManager.notifyMarketClosed(this.animalShopPlaceHolder.visible);
    };

    private readonly handleMarketSellRequested = (
        selection: Readonly<MarketResourceCounts>,
        _totalUnits: number,
        _totalMoney: number,
        sourceScreenPoint: Readonly<MarketScreenPoint>,
    ) => {
        if (!this.gameState.isMarketModalOpen) {
            return;
        }

        let totalSoldUnits = 0;
        for (const plantId of Object.values(PlantId)) {
            const requestedUnits = Math.max(0, Math.round(selection[plantId] ?? 0));

            if (requestedUnits <= 0) {
                continue;
            }

            const currentUnits = this.farmResourcesUI.getResourceCount(plantId);
            const unitsToSell = Math.min(requestedUnits, currentUnits);

            if (unitsToSell <= 0) {
                continue;
            }

            this.farmResourcesUI.setResourceCount(plantId, currentUnits - unitsToSell);
            totalSoldUnits += unitsToSell;
        }

        if (totalSoldUnits <= 0) {
            this.marketModalUI.setAvailableResources(this.getCurrentResourceCounts());
            return;
        }

        const gainedMoney = totalSoldUnits * MARKET_SELL_PRICE_PER_UNIT;
        this.gameState.money += gainedMoney;
        void this.farmResourcesUI.playMoneyGainAnimation(
            gainedMoney,
            sourceScreenPoint,
            totalSoldUnits,
        );
        this.marketModalUI.setAvailableResources(this.getCurrentResourceCounts());
        this.updateAnimalShopAvailability();
    };

    private applyVegetablePlacementState() {
        for (const [entryPlantId, vegetable] of this.vegetables.entries()) {
            const isSelectedPlant = this.gameState.selectedPlantId === entryPlantId;
            const isInSelectionPreview = isSelectedPlant && this.gameState.isPlantSelectionActive;

            if (isInSelectionPreview) {
                vegetable.setGrowthLevel(3);
            }

            vegetable.setShown(isSelectedPlant);
            vegetable.setPreviewMode(isInSelectionPreview);
        }
    }

    private getCurrentResourceCounts(): MarketResourceCounts {
        return {
            [PlantId.corn]: this.farmResourcesUI.getResourceCount(PlantId.corn),
            [PlantId.grape]: this.farmResourcesUI.getResourceCount(PlantId.grape),
            [PlantId.strawberry]: this.farmResourcesUI.getResourceCount(PlantId.strawberry),
        };
    }

    private updateAnimalShopAvailability() {
        const hasAnimalShopAccess =
            this.gameState.money > 0 &&
            !this.gameState.isAnimalHomePlaced;
        this.animalShopPlaceHolder.visible = hasAnimalShopAccess;
        if (!hasAnimalShopAccess) {
            this.animalShopUI.hide(this.gameState.isAnimalShopOpen);
        }
    }

    private startSkipDayCycle() {
        this.gameState.isSkipDayCycleActive = true;
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
        if (!this.gameState.isSkipDayCycleActive) {
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

        const selectedVegetable = this.gameState.skipDayPlantId
            ? (this.vegetables.get(this.gameState.skipDayPlantId) ?? null)
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
        const completedPlantId = this.gameState.skipDayPlantId;

        this.gameState.isSkipDayCycleActive = false;
        this.skipDayElapsedSeconds = 0;
        this.debugManager.setInteractionLocked(false);
        this.lightingManager.setValue('sunX', this.skipDayBaseSunX);
        this.lightingManager.setValue('sunY', this.skipDayBaseSunY);
        this.lightingManager.setValue('sunIntensity', this.skipDayBaseSunIntensity);
        this.lightingManager.setValue('ambientIntensity', this.skipDayBaseAmbientIntensity);
        this.postProcessingManager.setValue('exposure', this.skipDayBaseExposure);
        this.postProcessingManager.setValue('vignetteIntensity', this.skipDayBaseVignetteIntensity);
        this.gameState.skipDayPlantId = null;
        this.skipDayUI.hide();

        if (completedPlantId) {
            const completedVegetable = this.vegetables.get(completedPlantId) ?? null;

            if (completedVegetable) {
                completedVegetable.setGrowthLevel(3);
                this.gameState.harvestPlantId = completedPlantId;
                this.sickleUI.setWorldOffset(SKIP_BUTTON_WORLD_OFFSET);
                this.sickleUI.show();
            }
        }
    }

    private getSimulationTimeScale() {
        if (!this.gameState.isSkipDayCycleActive) {
            return 1;
        }

        return SKIP_DAY_TIME_SCALE;
    }

    private readonly handleDownloadGameRequested = () => {
        window.location.href = GameConfig.downloadGameUrl;
    };

    private scheduleEndCard() {
        if (this.isEndCardScheduled || this.isEndCardVisible) {
            return;
        }

        this.isEndCardScheduled = true;
        this.endCardDelayElapsedSeconds = 0;
    }

    private updateEndCardFlow(deltaSeconds: number) {
        if (!this.isEndCardScheduled || this.isEndCardVisible) {
            return;
        }

        this.endCardDelayElapsedSeconds = Math.min(
            this.endCardDelayElapsedSeconds + Math.max(0, deltaSeconds),
            END_CARD_DELAY_SECONDS,
        );

        if (this.endCardDelayElapsedSeconds < END_CARD_DELAY_SECONDS) {
            return;
        }

        this.isEndCardScheduled = false;
        this.isEndCardVisible = true;
        this.endCardUI.show();
        this.renderer.domElement.style.transition = 'filter 260ms ease';
        this.renderer.domElement.style.filter = `blur(${END_CARD_BLUR_PIXELS}px)`;
    }

    private clearEndCardBlur() {
        this.renderer.domElement.style.filter = '';
        this.renderer.domElement.style.transition = '';
    }
}
