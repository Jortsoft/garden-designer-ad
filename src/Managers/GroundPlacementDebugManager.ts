import * as THREE from 'three';
import { GameConfig } from './GameConfig';
import { Ground } from '../Entities/Ground';
import type { ScreenPointBlocker } from '../Models/Input.model';

const CLICK_MOVE_THRESHOLD = 6;
const MARKER_RADIUS = 0.035;
const MARKER_HEIGHT_OFFSET = 0.02;

export class GroundPlacementDebugManager {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly ground: Ground;
    private readonly inputElement: HTMLElement;
    private readonly shouldBlockInput: ScreenPointBlocker;
    private readonly isEnabled = GameConfig.debugMode;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointerDownPosition = new THREE.Vector2();
    private readonly normalizedPointer = new THREE.Vector2();
    private readonly marker = new THREE.Mesh(
        new THREE.SphereGeometry(MARKER_RADIUS, 16, 16),
        new THREE.MeshBasicMaterial({ color: '#ff3b30' }),
    );
    private readonly markerPosition = new THREE.Vector3();

    private activePointerId: number | null = null;
    private hasPointerMoved = false;

    constructor(
        camera: THREE.PerspectiveCamera,
        ground: Ground,
        inputElement: HTMLElement,
        shouldBlockInput: ScreenPointBlocker = () => false,
    ) {
        this.camera = camera;
        this.ground = ground;
        this.inputElement = inputElement;
        this.shouldBlockInput = shouldBlockInput;
        this.marker.name = 'GroundDebugMarker';
        this.marker.visible = false;
        this.marker.renderOrder = 12;
        this.marker.material.toneMapped = false;
    }

    initialize(parent: THREE.Object3D) {
        if (!this.isEnabled) {
            return;
        }

        parent.add(this.marker);
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerCancel);
        window.addEventListener('blur', this.handleWindowBlur);
    }

    dispose() {
        if (!this.isEnabled) {
            return;
        }

        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerCancel);
        window.removeEventListener('blur', this.handleWindowBlur);
        this.marker.parent?.remove(this.marker);
        this.marker.geometry.dispose();
        this.marker.material.dispose();
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isEnabled || event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }

        if (this.shouldBlockInput(event.clientX, event.clientY)) {
            return;
        }

        this.activePointerId = event.pointerId;
        this.hasPointerMoved = false;
        this.pointerDownPosition.set(event.clientX, event.clientY);
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (
            !this.isEnabled ||
            event.pointerType !== 'mouse' ||
            this.activePointerId !== event.pointerId ||
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
            !this.isEnabled ||
            event.pointerType !== 'mouse' ||
            event.button !== 0 ||
            this.activePointerId !== event.pointerId
        ) {
            return;
        }

        const shouldPlaceMarker =
            !this.hasPointerMoved &&
            !this.shouldBlockInput(event.clientX, event.clientY);

        this.resetPointerState();

        if (!shouldPlaceMarker) {
            return;
        }

        this.placeMarkerAtScreenPoint(event.clientX, event.clientY);
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
        this.hasPointerMoved = false;
    }

    private placeMarkerAtScreenPoint(screenX: number, screenY: number) {
        const bounds = this.inputElement.getBoundingClientRect();

        if (bounds.width <= 0 || bounds.height <= 0) {
            return;
        }

        this.normalizedPointer.set(
            ((screenX - bounds.left) / bounds.width) * 2 - 1,
            -((screenY - bounds.top) / bounds.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.normalizedPointer, this.camera);

        const intersections = this.raycaster.intersectObject(this.ground, true);
        const groundHit = intersections.find(
            (intersection) => intersection.object !== this.marker,
        );

        if (!groundHit) {
            return;
        }

        this.markerPosition.copy(groundHit.point);
        this.markerPosition.y += MARKER_HEIGHT_OFFSET;
        this.marker.position.copy(this.markerPosition);
        this.marker.visible = true;

        console.log(
            `Debug ground point: x=${groundHit.point.x.toFixed(3)}, y=${groundHit.point.y.toFixed(3)}, z=${groundHit.point.z.toFixed(3)}`,
        );
    }
}
