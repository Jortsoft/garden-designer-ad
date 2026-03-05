import * as THREE from 'three';
import { PlaceHolder } from '../Entities/PlaceHolder';

const CLICK_MOVE_THRESHOLD = 6;

type ScreenPointBlocker = (screenX: number, screenY: number) => boolean;

export class PlaceHolderActivationManager {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly placeHolder: PlaceHolder;
    private readonly inputElement: HTMLElement;
    private readonly shouldBlockInput: ScreenPointBlocker;
    private readonly onActivate: () => void;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointerDownPosition = new THREE.Vector2();
    private readonly normalizedPointer = new THREE.Vector2();

    private activePointerId: number | null = null;
    private activePointerType: 'mouse' | 'touch' | null = null;
    private hasPointerMoved = false;

    constructor(
        camera: THREE.PerspectiveCamera,
        placeHolder: PlaceHolder,
        inputElement: HTMLElement,
        onActivate: () => void,
        shouldBlockInput: ScreenPointBlocker = () => false,
    ) {
        this.camera = camera;
        this.placeHolder = placeHolder;
        this.inputElement = inputElement;
        this.onActivate = onActivate;
        this.shouldBlockInput = shouldBlockInput;
    }

    initialize() {
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerCancel);
        window.addEventListener('blur', this.handleWindowBlur);
    }

    dispose() {
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerCancel);
        window.removeEventListener('blur', this.handleWindowBlur);
        this.resetPointerState();
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'touch') {
            return;
        }

        if (this.shouldBlockInput(event.clientX, event.clientY)) {
            return;
        }

        if (this.activePointerId !== null) {
            this.hasPointerMoved = true;
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        this.activePointerId = event.pointerId;
        this.activePointerType = event.pointerType;
        this.hasPointerMoved = false;
        this.pointerDownPosition.set(event.clientX, event.clientY);
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (
            this.activePointerId !== event.pointerId ||
            this.activePointerType !== event.pointerType ||
            this.hasPointerMoved
        ) {
            return;
        }

        if (
            this.pointerDownPosition.distanceToSquared(
                this.normalizedPointer.set(event.clientX, event.clientY),
            ) > CLICK_MOVE_THRESHOLD * CLICK_MOVE_THRESHOLD
        ) {
            this.hasPointerMoved = true;
        }
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (
            this.activePointerId !== event.pointerId
        ) {
            return;
        }

        if (this.activePointerType !== event.pointerType) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const canActivate =
            !this.hasPointerMoved &&
            !this.shouldBlockInput(event.clientX, event.clientY);

        this.resetPointerState();

        if (!canActivate) {
            return;
        }

        this.tryActivateFromScreenPoint(event.clientX, event.clientY);
    };

    private readonly handlePointerCancel = (event: PointerEvent) => {
        if (this.activePointerId === event.pointerId) {
            this.resetPointerState();
        }
    };

    private readonly handleWindowBlur = () => {
        this.resetPointerState();
    };

    private resetPointerState() {
        this.activePointerId = null;
        this.activePointerType = null;
        this.hasPointerMoved = false;
    }

    private tryActivateFromScreenPoint(screenX: number, screenY: number) {
        const bounds = this.inputElement.getBoundingClientRect();

        if (bounds.width <= 0 || bounds.height <= 0) {
            return;
        }

        this.normalizedPointer.set(
            ((screenX - bounds.left) / bounds.width) * 2 - 1,
            -((screenY - bounds.top) / bounds.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.normalizedPointer, this.camera);

        if (!this.placeHolder.intersectsInteractionRay(this.raycaster.ray)) {
            return;
        }

        this.onActivate();
    }
}
