import * as THREE from 'three';
import {
    SHARED_UI_VISIBILITY_ANIMATION,
    UIVisibilityAnimationController,
    type UIVisibilityAnimationFrame,
} from '../Animations/AnimationUI';
import { PlantId, isPlantId } from '../Models/PlaceVegetable.model';
import type {
    PlantButton,
    PlantOptionDefinition,
    RoundedFrameTextureOptions,
    SelectionVisualOptions,
} from '../Models/PlaceVegetable.model';
import { OverlayContainerUI } from './OverlayContainerUI';

const PLANT_OPTIONS: readonly PlantOptionDefinition[] = [
    { id: PlantId.corn, texturePath: 'assets/images/corn.png' },
    { id: PlantId.grape, texturePath: 'assets/images/grape.png' },
    { id: PlantId.strawberry, texturePath: 'assets/images/strawberry.png' },
] as const;

const PANEL_MAX_WIDTH = 560;
const PANEL_MIN_WIDTH = 290;
const PANEL_MAX_HEIGHT = 204;
const PANEL_MIN_HEIGHT = 130;
const PANEL_MARGIN_BOTTOM = 12;
const PANEL_MARGIN_BOTTOM_MAX = 24;
const BUTTON_BASE_COLOR = '#f1d7b3';
const BUTTON_SELECTION_COLOR = '#ffdca0';
const BUTTON_ACTIVE_COLOR = '#e6bc86';
const SELECTION_BLEND_SPEED = 11;
const SELECTION_POP_DURATION = 0.26;
const SELECTION_PULSE_SPEED = 7.2;
const BUTTON_FRAME_TEXTURE_SIZE = 320;
const OVERLAY_CONTAINER_OPTIONS = {
    title: 'Choose plant',
    theme: {
        backgroundColor: 'rgba(181, 152, 117, 0.94)',
        borderColor: 'rgba(226, 187, 137, 0.9)',
        titleColor: '#ffffff',
        titleStrokeColor: 'rgba(13, 19, 23, 0.92)',
        titleShadowColor: 'rgba(0, 65, 120, 0.34)',
    },
} as const;

export class PlaceVegetablesUI {
    private readonly inputElement: HTMLElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly raycaster = new THREE.Raycaster();
    private readonly normalizedPointer = new THREE.Vector2();
    private readonly overlayScene = new THREE.Scene();
    private readonly overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 10);
    private readonly overlayContainer: OverlayContainerUI;
    private readonly buttonFrameTexture: THREE.CanvasTexture;
    private readonly selectionFrameTexture: THREE.CanvasTexture;
    private readonly buttons: PlantButton[] = [];
    private readonly defaultButtonColor = new THREE.Color(BUTTON_BASE_COLOR);
    private readonly activeButtonColor = new THREE.Color(BUTTON_ACTIVE_COLOR);
    private readonly visibilityAnimation = new UIVisibilityAnimationController(
        SHARED_UI_VISIBILITY_ANIMATION,
    );

    private selectedPlantId: PlantId = PlantId.corn;
    private visibilityFrame: UIVisibilityAnimationFrame = this.visibilityAnimation.getFrame();
    private viewportWidth = 1;
    private viewportHeight = 1;
    private panelScreenX = 0;
    private panelScreenY = 0;
    private panelScreenWidth = 0;
    private panelScreenHeight = 0;
    private panelWidth = 1;
    private panelHeight = 1;
    private panelCenterY = 0;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;

    constructor(inputElement: HTMLElement, renderer: THREE.WebGLRenderer) {
        this.inputElement = inputElement;
        this.renderer = renderer;
        this.overlayCamera.position.z = 1;
        this.visibilityAnimation.hide(true);
        this.visibilityFrame = this.visibilityAnimation.getFrame();
        this.overlayContainer = new OverlayContainerUI(
            this.overlayScene,
            OVERLAY_CONTAINER_OPTIONS,
        );

        this.buttonFrameTexture = this.createRoundedFrameTexture({
            fillColor: 'rgba(245, 218, 180, 1)',
            fillBottomColor: 'rgba(225, 184, 132, 1)',
            borderColor: 'rgba(196, 141, 84, 0.98)',
            innerStrokeColor: 'rgba(255, 241, 216, 0.78)',
            outerShadowColor: 'rgba(91, 58, 21, 0.28)',
            borderWidth: 16,
            gloss: true,
        });
        this.selectionFrameTexture = this.createRoundedFrameTexture({
            fillColor: 'rgba(255, 224, 148, 1)',
            fillBottomColor: 'rgba(237, 177, 95, 1)',
            borderColor: 'rgba(255, 252, 239, 1)',
            innerStrokeColor: 'rgba(255, 255, 255, 0.98)',
            outerShadowColor: 'rgba(255, 165, 57, 0.42)',
            borderWidth: 18,
            gloss: true,
            feather: 0.11,
        });

        this.createPlantButtons();
        this.applySelectionVisuals({ snapToSelection: true });
        this.updateViewport(1, 1);
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.loadPromise = this.loadPlantTextures();
        this.refreshVisibilityState(0);

        return this.loadPromise;
    }

    render() {
        if (!this.isInitialized || this.isDisposed || !this.visibilityFrame.isRenderable) {
            return;
        }

        const previousAutoClear = this.renderer.autoClear;

        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.overlayScene, this.overlayCamera);
        this.renderer.autoClear = previousAutoClear;
    }

    update(deltaSeconds: number) {
        if (!this.isInitialized || this.isDisposed) {
            return;
        }

        this.refreshVisibilityState(deltaSeconds);

        if (!this.visibilityFrame.isRenderable) {
            return;
        }

        this.animateButtons(deltaSeconds);
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);

        this.overlayCamera.left = -this.viewportWidth * 0.5;
        this.overlayCamera.right = this.viewportWidth * 0.5;
        this.overlayCamera.top = this.viewportHeight * 0.5;
        this.overlayCamera.bottom = -this.viewportHeight * 0.5;
        this.overlayCamera.updateProjectionMatrix();

        this.layoutOverlay();
    }

    isScreenPointBlocked(screenX: number, screenY: number) {
        if (
            !this.isInitialized ||
            this.isDisposed ||
            !this.visibilityFrame.isInteractive
        ) {
            return false;
        }

        return (
            screenX >= this.panelScreenX &&
            screenX <= this.panelScreenX + this.panelScreenWidth &&
            screenY >= this.panelScreenY &&
            screenY <= this.panelScreenY + this.panelScreenHeight
        );
    }

    getSelectedPlantId() {
        return this.selectedPlantId;
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.visibilityAnimation.show();
        this.refreshVisibilityState(0);
        this.animateButtons(0);
    }

    hide() {
        if (this.isDisposed) {
            return;
        }

        this.visibilityAnimation.hide();
        this.refreshVisibilityState(0);
        this.animateButtons(0);
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);

        this.overlayContainer.dispose();
        this.buttonFrameTexture.dispose();
        this.selectionFrameTexture.dispose();

        for (const button of this.buttons) {
            button.hitMesh.geometry.dispose();
            button.hitMesh.material.dispose();
            this.overlayScene.remove(button.hitMesh);

            button.iconMesh.geometry.dispose();
            button.iconMesh.material.dispose();
            this.overlayScene.remove(button.iconMesh);

            button.selectionMesh.geometry.dispose();
            button.selectionMesh.material.dispose();
            this.overlayScene.remove(button.selectionMesh);

            button.iconTexture?.dispose();
        }
    }

    private createPlantButtons() {
        for (const option of PLANT_OPTIONS) {
            const selectionMaterial = new THREE.MeshBasicMaterial({
                color: BUTTON_SELECTION_COLOR,
                map: this.selectionFrameTexture,
                transparent: true,
                opacity: 0.42,
                depthTest: false,
                depthWrite: false,
            });
            selectionMaterial.toneMapped = false;

            const selectionMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                selectionMaterial,
            );
            selectionMesh.renderOrder = 1110;
            this.overlayScene.add(selectionMesh);

            const hitMaterial = new THREE.MeshBasicMaterial({
                color: BUTTON_BASE_COLOR,
                map: this.buttonFrameTexture,
                transparent: true,
                opacity: 0.92,
                depthTest: false,
                depthWrite: false,
            });
            hitMaterial.toneMapped = false;

            const hitMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                hitMaterial,
            );
            hitMesh.userData.plantId = option.id;
            hitMesh.renderOrder = 1111;
            this.overlayScene.add(hitMesh);

            const iconMaterial = new THREE.MeshBasicMaterial({
                color: '#ffffff',
                transparent: true,
                opacity: 1,
                depthTest: false,
                depthWrite: false,
            });
            iconMaterial.toneMapped = false;

            const iconMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                iconMaterial,
            );
            iconMesh.renderOrder = 1112;
            this.overlayScene.add(iconMesh);

            this.buttons.push({
                id: option.id,
                hitMesh,
                iconMesh,
                selectionMesh,
                iconTexture: null,
                baseButtonSize: 1,
                baseIconSize: 1,
                baseX: 0,
                baseY: 0,
                selectionBlend: option.id === this.selectedPlantId ? 1 : 0,
                pulseTime: 0,
                popElapsed: SELECTION_POP_DURATION,
                popDuration: 0,
            });
        }
    }

    private async loadPlantTextures() {
        await Promise.all(
            PLANT_OPTIONS.map(async (option) => {
                const button = this.buttons.find((entry) => entry.id === option.id);

                if (!button) {
                    return;
                }

                try {
                    const texture = await this.textureLoader.loadAsync(option.texturePath);

                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.needsUpdate = true;

                    button.iconTexture = texture;
                    button.iconMesh.material.map = texture;
                    button.iconMesh.material.needsUpdate = true;
                } catch (error) {
                    console.error(`Failed to load plant icon: ${option.texturePath}`, error);
                }
            }),
        );
    }

    private layoutOverlay() {
        const panelWidth = THREE.MathUtils.clamp(
            this.viewportWidth * 0.92,
            PANEL_MIN_WIDTH,
            PANEL_MAX_WIDTH,
        );
        const panelHeight = THREE.MathUtils.clamp(
            this.viewportHeight * 0.26,
            PANEL_MIN_HEIGHT,
            PANEL_MAX_HEIGHT,
        );
        const marginBottom = THREE.MathUtils.clamp(
            this.viewportHeight * 0.02,
            PANEL_MARGIN_BOTTOM,
            PANEL_MARGIN_BOTTOM_MAX,
        );
        const panelCenterY = -this.viewportHeight * 0.5 + marginBottom + panelHeight * 0.5;

        this.panelWidth = panelWidth;
        this.panelHeight = panelHeight;
        this.panelCenterY = panelCenterY;
        this.overlayContainer.layout(panelWidth, panelHeight, 0, panelCenterY);

        const horizontalPadding = panelWidth * 0.1;
        const buttonsAreaWidth = panelWidth - horizontalPadding * 2;
        const buttonSpacing = Math.min(buttonsAreaWidth * 0.07, 28);
        const buttonSize = Math.min(
            (buttonsAreaWidth - buttonSpacing * 2) / 3,
            panelHeight * 0.52,
            126,
        );
        const totalButtonsWidth = buttonSize * 3 + buttonSpacing * 2;
        const startButtonX = -totalButtonsWidth * 0.5 + buttonSize * 0.5;
        const buttonY = panelCenterY - panelHeight * 0.12;

        for (let index = 0; index < this.buttons.length; index += 1) {
            const button = this.buttons[index];
            const buttonX = startButtonX + index * (buttonSize + buttonSpacing);
            const iconSize = buttonSize * 0.68;

            button.baseButtonSize = buttonSize;
            button.baseIconSize = iconSize;
            button.baseX = buttonX;
            button.baseY = buttonY;
        }

        this.refreshVisibilityState(0);
        this.animateButtons(0);
    }

    private applySelectionVisuals(options?: SelectionVisualOptions) {
        const shouldSnapToSelection = options?.snapToSelection ?? false;
        const shouldTriggerPop = options?.triggerPop ?? false;

        for (const button of this.buttons) {
            const isSelected = button.id === this.selectedPlantId;
            const targetBlend = isSelected ? 1 : 0;

            if (shouldSnapToSelection) {
                button.selectionBlend = targetBlend;
            }

            if (shouldTriggerPop && isSelected) {
                button.popElapsed = 0;
                button.popDuration = SELECTION_POP_DURATION;
            }

            if (!isSelected) {
                button.pulseTime = 0;
            }
        }

        this.animateButtons(0);
    }

    private refreshVisibilityState(deltaSeconds: number) {
        this.visibilityAnimation.update(deltaSeconds);
        this.visibilityFrame = this.visibilityAnimation.getFrame();

        const animatedPanelCenterY = this.panelCenterY + this.visibilityFrame.offsetY;

        this.overlayContainer.setVisible(this.visibilityFrame.isRenderable);
        this.overlayContainer.setOpacity(this.visibilityFrame.opacity);
        this.overlayContainer.setTransform(0, animatedPanelCenterY, this.visibilityFrame.scale);
        this.updatePanelScreenBounds(animatedPanelCenterY);
    }

    private updatePanelScreenBounds(panelCenterY: number) {
        this.panelScreenWidth = this.panelWidth * this.visibilityFrame.scale;
        this.panelScreenHeight = this.panelHeight * this.visibilityFrame.scale;
        this.panelScreenX = (this.viewportWidth - this.panelScreenWidth) * 0.5;
        this.panelScreenY =
            this.viewportHeight * 0.5 - (panelCenterY + this.panelScreenHeight * 0.5);
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isInitialized || this.isDisposed) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (!this.isScreenPointBlocked(event.clientX, event.clientY)) {
            return;
        }

        const plantId = this.pickPlantAtScreenPoint(event.clientX, event.clientY);

        if (!plantId) {
            return;
        }

        this.selectedPlantId = plantId;
        this.applySelectionVisuals({ triggerPop: true });
    };

    private pickPlantAtScreenPoint(screenX: number, screenY: number) {
        const bounds = this.inputElement.getBoundingClientRect();

        if (bounds.width <= 0 || bounds.height <= 0) {
            return null;
        }

        this.normalizedPointer.set(
            ((screenX - bounds.left) / bounds.width) * 2 - 1,
            -((screenY - bounds.top) / bounds.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.normalizedPointer, this.overlayCamera);

        const intersections = this.raycaster.intersectObjects(
            this.buttons.map((button) => button.hitMesh),
            false,
        );

        if (intersections.length === 0) {
            return null;
        }

        const selectedId = intersections[0]?.object.userData?.plantId;

        if (isPlantId(selectedId)) {
            return selectedId;
        }

        return null;
    }

    private createRoundedFrameTexture(options: RoundedFrameTextureOptions) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = BUTTON_FRAME_TEXTURE_SIZE;
        canvas.height = BUTTON_FRAME_TEXTURE_SIZE;

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        if (!context) {
            texture.needsUpdate = true;
            return texture;
        }

        const size = BUTTON_FRAME_TEXTURE_SIZE;
        const padding = Math.round(size * (options.feather ?? 0.08));
        const radius = Math.round(size * 0.22);
        const rectX = padding;
        const rectY = padding;
        const rectWidth = size - padding * 2;
        const rectHeight = size - padding * 2;

        context.clearRect(0, 0, size, size);

        context.save();
        context.shadowColor = options.outerShadowColor ?? 'rgba(0, 0, 0, 0.22)';
        context.shadowBlur = Math.round(size * 0.08);
        context.shadowOffsetY = Math.round(size * 0.02);
        this.drawRoundedRect(
            context,
            rectX + Math.round(size * 0.01),
            rectY + Math.round(size * 0.02),
            rectWidth - Math.round(size * 0.02),
            rectHeight - Math.round(size * 0.02),
            radius,
        );
        context.fillStyle = 'rgba(0, 0, 0, 0.32)';
        context.fill();
        context.restore();

        const fillBottomColor: string | undefined = options.fillBottomColor;
        const fillGradient = fillBottomColor
            ? context.createLinearGradient(0, rectY, 0, rectY + rectHeight)
            : null;

        if (fillGradient) {
            fillGradient.addColorStop(0, options.fillColor);
            fillGradient.addColorStop(1, fillBottomColor as string);
        }

        this.drawRoundedRect(
            context,
            rectX,
            rectY,
            rectWidth,
            rectHeight,
            radius,
        );
        context.fillStyle = fillGradient ?? options.fillColor;
        context.fill();
        context.lineWidth = options.borderWidth;
        context.strokeStyle = options.borderColor;
        context.stroke();

        if (options.innerStrokeColor) {
            context.lineWidth = Math.max(2, Math.round(options.borderWidth * 0.3));
            context.strokeStyle = options.innerStrokeColor;
            this.drawRoundedRect(
                context,
                rectX + options.borderWidth * 0.56,
                rectY + options.borderWidth * 0.56,
                rectWidth - options.borderWidth * 1.12,
                rectHeight - options.borderWidth * 1.12,
                Math.max(16, Math.round(radius * 0.84)),
            );
            context.stroke();
        }

        if (options.gloss) {
            const glossGradient = context.createLinearGradient(
                0,
                rectY,
                0,
                rectY + rectHeight * 0.56,
            );
            glossGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            glossGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            context.fillStyle = glossGradient;
            this.drawRoundedRect(
                context,
                rectX + options.borderWidth,
                rectY + options.borderWidth,
                rectWidth - options.borderWidth * 2,
                rectHeight * 0.56,
                Math.max(16, Math.round(radius * 0.85)),
            );
            context.fill();
        }

        texture.needsUpdate = true;

        return texture;
    }

    private drawRoundedRect(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
    ) {
        const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));

        context.beginPath();
        context.moveTo(x + clampedRadius, y);
        context.lineTo(x + width - clampedRadius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
        context.lineTo(x + width, y + height - clampedRadius);
        context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
        context.lineTo(x + clampedRadius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
        context.lineTo(x, y + clampedRadius);
        context.quadraticCurveTo(x, y, x + clampedRadius, y);
        context.closePath();
    }

    private animateButtons(deltaSeconds: number) {
        const hasFrameDelta = deltaSeconds > 0;
        const blendFactor = hasFrameDelta
            ? 1 - Math.exp(-SELECTION_BLEND_SPEED * deltaSeconds)
            : 1;
        const uiOpacity = this.visibilityFrame.opacity;
        const uiScale = this.visibilityFrame.scale;
        const uiVerticalOffset = this.visibilityFrame.offsetY;
        const isUIRenderable = this.visibilityFrame.isRenderable;

        for (const button of this.buttons) {
            const isSelected = button.id === this.selectedPlantId;
            const targetBlend = isSelected ? 1 : 0;

            button.selectionBlend = THREE.MathUtils.lerp(
                button.selectionBlend,
                targetBlend,
                blendFactor,
            );

            if (isSelected && hasFrameDelta) {
                button.pulseTime += deltaSeconds;
            }

            if (hasFrameDelta && button.popElapsed < button.popDuration) {
                button.popElapsed = Math.min(
                    button.popElapsed + deltaSeconds,
                    button.popDuration,
                );
            }

            const popProgress =
                button.popDuration <= 0
                    ? 1
                    : THREE.MathUtils.clamp(
                        button.popElapsed / button.popDuration,
                        0,
                        1,
                    );
            const popAmount = Math.sin(popProgress * Math.PI) * (1 - popProgress) * 0.24;
            const pulseAmount = isSelected
                ? Math.sin(button.pulseTime * SELECTION_PULSE_SPEED) * 0.016
                : 0;
            const buttonScale =
                1 + button.selectionBlend * 0.08 + popAmount * 0.9 + pulseAmount * 0.5;
            const iconScale =
                1 + button.selectionBlend * 0.1 + popAmount * 1.2 + pulseAmount * 0.9;
            const verticalLift = popAmount * button.baseButtonSize * 0.15;

            button.selectionMesh.visible = isUIRenderable && button.selectionBlend > 0.01;
            button.selectionMesh.scale.set(
                button.baseButtonSize *
                1.12 *
                (1 + popAmount * 0.45 + pulseAmount * 0.5) *
                uiScale,
                button.baseButtonSize *
                1.12 *
                (1 + popAmount * 0.45 + pulseAmount * 0.5) *
                uiScale,
                1,
            );
            button.selectionMesh.position.set(
                button.baseX,
                button.baseY + verticalLift + uiVerticalOffset,
                0,
            );
            button.selectionMesh.material.opacity =
                (0.08 + button.selectionBlend * 0.46) *
                (isSelected ? 0.95 + Math.sin(button.pulseTime * 6.3) * 0.05 : 1) *
                uiOpacity;

            button.hitMesh.visible = isUIRenderable;
            button.hitMesh.scale.set(
                button.baseButtonSize * buttonScale * uiScale,
                button.baseButtonSize * buttonScale * uiScale,
                1,
            );
            button.hitMesh.position.set(
                button.baseX,
                button.baseY + verticalLift + uiVerticalOffset,
                0,
            );
            button.hitMesh.material.color
                .copy(this.defaultButtonColor)
                .lerp(this.activeButtonColor, button.selectionBlend);
            button.hitMesh.material.opacity = (0.88 + button.selectionBlend * 0.12) * uiOpacity;

            button.iconMesh.visible = isUIRenderable;
            button.iconMesh.scale.set(
                button.baseIconSize * iconScale * uiScale,
                button.baseIconSize * iconScale * uiScale,
                1,
            );
            button.iconMesh.position.set(
                button.baseX,
                button.baseY + verticalLift + uiVerticalOffset,
                0,
            );
            button.iconMesh.material.opacity = (0.9 + button.selectionBlend * 0.1) * uiOpacity;
        }
    }
}
