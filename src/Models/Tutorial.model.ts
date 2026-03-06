import type * as THREE from 'three';
import type { CameraController } from '../Systems/CameraController';
import type { PixiUI } from '../Systems/PixiUI';
import type { MoveCameraParams } from './CameraController.model';

export const TutorialStep = {
    primaryPlaceholder: 'primaryPlaceholder',
    waitingForPlant: 'waitingForPlant',
    skipDayButton: 'skipDayButton',
    waitingForHarvest: 'waitingForHarvest',
    marketClickArea: 'marketClickArea',
    waitingForMarketClose: 'waitingForMarketClose',
    animalShopPlaceholder: 'animalShopPlaceholder',
    completed: 'completed',
} as const;
export type TutorialStep = (typeof TutorialStep)[keyof typeof TutorialStep];

export interface TutorialFingerAnchor {
    readonly object: THREE.Object3D;
    readonly worldOffset?: THREE.Vector3;
}

export interface TutorialGuideManagerOptions {
    readonly camera: THREE.PerspectiveCamera;
    readonly pixiUI: PixiUI;
    readonly cameraController: CameraController;
    readonly primaryPlaceHolder: THREE.Object3D;
    readonly skipDayAnchor: THREE.Object3D;
    readonly skipDayWorldOffset: THREE.Vector3;
    readonly marketAnchor: THREE.Object3D;
    readonly animalShopPlaceHolder: THREE.Object3D;
    readonly marketCameraMove: MoveCameraParams;
}
