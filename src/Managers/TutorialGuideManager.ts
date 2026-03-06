import * as THREE from 'three';
import { TutorialStep, type TutorialGuideManagerOptions } from '../Models/Tutorial.model';
import { TutorialFingerUI } from '../UI/TutorialFingerUI';

const PRIMARY_PLACEHOLDER_FINGER_OFFSET = new THREE.Vector3(0.1, -0.1, 0);
const MARKET_CLICK_AREA_FINGER_OFFSET = new THREE.Vector3(0, -0.2, 0);
const ANIMAL_PLACEHOLDER_FINGER_OFFSET = new THREE.Vector3(0.1, -0.2, 0);
const SKIP_DAY_FINGER_EXTRA_OFFSET = new THREE.Vector3(0.05, -0.1, 0);

export class TutorialGuideManager {
    private readonly cameraController: TutorialGuideManagerOptions['cameraController'];
    private readonly primaryPlaceHolder: TutorialGuideManagerOptions['primaryPlaceHolder'];
    private readonly skipDayAnchor: TutorialGuideManagerOptions['skipDayAnchor'];
    private readonly skipDayWorldOffset: THREE.Vector3;
    private readonly marketAnchor: TutorialGuideManagerOptions['marketAnchor'];
    private readonly animalShopPlaceHolder: TutorialGuideManagerOptions['animalShopPlaceHolder'];
    private readonly marketCameraMove: TutorialGuideManagerOptions['marketCameraMove'];
    private readonly tutorialFingerUI: TutorialFingerUI;
    private readonly skipDayFingerOffset = new THREE.Vector3();

    private step: TutorialStep = TutorialStep.primaryPlaceholder;
    private isStarted = false;

    constructor(options: TutorialGuideManagerOptions) {
        this.cameraController = options.cameraController;
        this.primaryPlaceHolder = options.primaryPlaceHolder;
        this.skipDayAnchor = options.skipDayAnchor;
        this.skipDayWorldOffset = options.skipDayWorldOffset.clone();
        this.marketAnchor = options.marketAnchor;
        this.animalShopPlaceHolder = options.animalShopPlaceHolder;
        this.marketCameraMove = options.marketCameraMove;
        this.tutorialFingerUI = new TutorialFingerUI(options.camera, options.pixiUI);
        this.skipDayFingerOffset.copy(this.skipDayWorldOffset).add(SKIP_DAY_FINGER_EXTRA_OFFSET);
    }

    initialize() {
        return this.tutorialFingerUI.initialize();
    }

    start() {
        if (this.isStarted) {
            return;
        }

        this.isStarted = true;
        this.step = TutorialStep.primaryPlaceholder;
        this.showPrimaryPlaceholderFinger();
    }

    update(deltaSeconds: number) {
        if (!this.isStarted) {
            return;
        }

        if (
            this.step === TutorialStep.primaryPlaceholder &&
            !this.primaryPlaceHolder.visible
        ) {
            this.tutorialFingerUI.hide();
        }

        if (
            this.step === TutorialStep.animalShopPlaceholder &&
            !this.animalShopPlaceHolder.visible
        ) {
            this.tutorialFingerUI.hide();
        }

        this.tutorialFingerUI.update(deltaSeconds);
    }

    render() {
        this.tutorialFingerUI.render();
    }

    updateViewport(width: number, height: number) {
        this.tutorialFingerUI.updateViewport(width, height);
    }

    notifyPrimaryPlaceholderActivated() {
        if (!this.isStep(TutorialStep.primaryPlaceholder)) {
            return;
        }

        this.step = TutorialStep.waitingForPlant;
        this.tutorialFingerUI.hide();
    }

    notifyPlantPlanned() {
        if (
            !this.isStep(TutorialStep.waitingForPlant) &&
            !this.isStep(TutorialStep.primaryPlaceholder)
        ) {
            return;
        }

        this.step = TutorialStep.skipDayButton;
        this.tutorialFingerUI.show({
            object: this.skipDayAnchor,
            worldOffset: this.skipDayFingerOffset,
        });
    }

    notifySkipDayRequested() {
        if (!this.isStep(TutorialStep.skipDayButton)) {
            return;
        }

        this.step = TutorialStep.waitingForHarvest;
        this.tutorialFingerUI.hide();
    }

    notifyHarvestCompleted() {
        if (!this.isStep(TutorialStep.waitingForHarvest)) {
            return;
        }

        this.step = TutorialStep.marketClickArea;
        this.cameraController.MoveCamera(this.marketCameraMove);
        this.showMarketFinger();
    }

    notifyMarketActivated() {
        if (!this.isStep(TutorialStep.marketClickArea)) {
            return;
        }

        this.step = TutorialStep.waitingForMarketClose;
        this.tutorialFingerUI.hide();
    }

    notifyMarketClosed(isAnimalShopAvailable: boolean) {
        if (!this.isStep(TutorialStep.waitingForMarketClose)) {
            return;
        }

        if (!isAnimalShopAvailable) {
            this.step = TutorialStep.marketClickArea;
            this.cameraController.MoveCamera(this.marketCameraMove);
            this.showMarketFinger();
            return;
        }

        this.step = TutorialStep.animalShopPlaceholder;
        this.showAnimalShopPlaceholderFinger();
    }

    notifyAnimalShopPlaceholderActivated() {
        if (!this.isStep(TutorialStep.animalShopPlaceholder)) {
            return;
        }

        this.step = TutorialStep.completed;
        this.tutorialFingerUI.hide();
    }

    dispose() {
        this.tutorialFingerUI.dispose();
    }

    private showPrimaryPlaceholderFinger() {
        if (!this.primaryPlaceHolder.visible) {
            this.tutorialFingerUI.hide();
            return;
        }

        this.tutorialFingerUI.show({
            object: this.primaryPlaceHolder,
            worldOffset: PRIMARY_PLACEHOLDER_FINGER_OFFSET,
        });
    }

    private showMarketFinger() {
        this.tutorialFingerUI.show({
            object: this.marketAnchor,
            worldOffset: MARKET_CLICK_AREA_FINGER_OFFSET,
        });
    }

    private showAnimalShopPlaceholderFinger() {
        if (!this.animalShopPlaceHolder.visible) {
            this.tutorialFingerUI.hide();
            return;
        }

        this.tutorialFingerUI.show({
            object: this.animalShopPlaceHolder,
            worldOffset: ANIMAL_PLACEHOLDER_FINGER_OFFSET,
        });
    }

    private isStep(targetStep: TutorialStep) {
        return this.step === targetStep;
    }
}
