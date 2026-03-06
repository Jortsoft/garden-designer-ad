import {
    Assets,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
} from 'pixi.js';
import { audioManager } from '../Managers/AudioManager';
import {
    isPlantId,
    PlantId,
    type PlaceVegetableButtonState,
    type PlantOptionDefinition,
    type PlanButtonState,
} from '../Models/PlaceVegetable.model';
import { PixiUI } from '../Systems/PixiUI';

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
const PLAN_BUTTON_MIN_WIDTH = 154;
const PLAN_BUTTON_MAX_WIDTH = 212;
const PLAN_BUTTON_MIN_HEIGHT = 56;
const PLAN_BUTTON_MAX_HEIGHT = 74;
const VISIBILITY_HIDDEN_OFFSET_Y = -56;
const VISIBILITY_HIDDEN_SCALE = 0.94;
const ENTER_DURATION = 0.34;
const EXIT_DURATION = 0.24;
const INTERACTIVE_THRESHOLD = 0.9;
const SELECTION_BLEND_SPEED = 11;
const SELECTION_PULSE_SPEED = 7.2;
const PLAN_BUTTON_PULSE_SPEED = 3.8;
const PLAN_BUTTON_PULSE_AMOUNT = 0.03;

interface Bounds2D {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class PlaceVegetablesUI {
    private readonly inputElement: HTMLElement;
    private readonly pixiUI: PixiUI;
    private readonly root = new Container();
    private readonly panel = new Graphics();
    private readonly titleLabel = new Text({
        text: 'Choose plant',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 30,
            fill: '#ffffff',
            fontWeight: '700',
            stroke: { color: '#0d1317', width: 4 },
        },
    });
    private readonly buttonsRoot = new Container();
    private readonly planButton: PlanButtonState = {
        container: new Graphics(),
        label: new Text({
            text: 'Plant',
            style: {
                fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                fontSize: 38,
                fill: '#fffaf1',
                fontWeight: '700',
                stroke: { color: '#7a4110', width: 4 },
            },
        }),
        hitArea: { x: 0, y: 0, width: 0, height: 0 },
        pulseTime: 0,
    };
    private readonly buttons: PlaceVegetableButtonState[] = [];
    private readonly loadedTextures = new Map<PlantId, Texture>();

    private selectedPlantId: PlantId = PlantId.corn;
    private viewportWidth = 1;
    private viewportHeight = 1;
    private visibility = 0;
    private visibilityTarget = 0;
    private panelWidth = 1;
    private panelHeight = 1;
    private panelCenterY = 0;
    private planButtonWidth = 1;
    private planButtonHeight = 1;
    private planButtonCenterY = 0;
    private panelBounds: Bounds2D = { x: 0, y: 0, width: 0, height: 0 };
    private planBounds: Bounds2D = { x: 0, y: 0, width: 0, height: 0 };
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;
    private onPlantSelected: ((plantId: PlantId) => void) | null = null;
    private onPlanRequested: (() => void) | null = null;

    constructor(inputElement: HTMLElement, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.pixiUI = pixiUI;
        this.root.visible = false;
        this.root.eventMode = 'none';
        this.root.zIndex = 30;
        this.root.sortableChildren = true;
        this.panel.zIndex = 0;
        this.titleLabel.anchor.set(0.5, 0.5);
        this.titleLabel.zIndex = 1;
        this.buttonsRoot.zIndex = 2;
        this.planButton.container.zIndex = 3;
        this.planButton.label.anchor.set(0.5, 0.5);
        this.planButton.label.zIndex = 4;
        this.root.addChild(this.panel);
        this.root.addChild(this.titleLabel);
        this.root.addChild(this.buttonsRoot);
        this.root.addChild(this.planButton.container);
        this.root.addChild(this.planButton.label);
        this.createButtons();
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.pixiUI.root.addChild(this.root);
        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.loadPromise = this.loadTextures();

        return this.loadPromise;
    }

    render() {
        // Rendered by shared PixiUI.
    }

    update(deltaSeconds: number) {
        if (!this.isInitialized || this.isDisposed) {
            return;
        }

        this.updateVisibility(deltaSeconds);
        if (this.visibility <= Number.EPSILON) {
            this.root.visible = false;
            return;
        }

        this.root.visible = true;
        this.animateButtons(deltaSeconds);
        this.animatePlanButton(deltaSeconds);
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.layout();
    }

    isScreenPointBlocked(screenX: number, screenY: number) {
        if (!this.isInteractive()) {
            return false;
        }

        return (
            this.isPointInsideBounds(screenX, screenY, this.panelBounds) ||
            this.isPointInsideBounds(screenX, screenY, this.planBounds)
        );
    }

    getSelectedPlantId() {
        return this.selectedPlantId;
    }

    setOnPlantSelected(handler: ((plantId: PlantId) => void) | null) {
        this.onPlantSelected = handler;
    }

    setOnPlanRequested(handler: (() => void) | null) {
        this.onPlanRequested = handler;
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.selectedPlantId = PlantId.corn;
        this.visibilityTarget = 1;
        this.visibility = 0;
        this.planButton.pulseTime = 0;
        this.onPlantSelected?.(PlantId.corn);
        this.layout();
    }

    hide() {
        if (this.isDisposed) {
            return;
        }

        this.visibilityTarget = 0;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onPlantSelected = null;
        this.onPlanRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.pixiUI.root.removeChild(this.root);
        for (const texture of this.loadedTextures.values()) {
            texture.destroy(true);
        }
        this.loadedTextures.clear();
        this.root.destroy({ children: true });
    }

    private createButtons() {
        for (const option of PLANT_OPTIONS) {
            const selection = new Graphics();
            const container = new Graphics();
            const icon = new Sprite(Texture.WHITE);
            icon.anchor.set(0.5, 0.5);
            selection.zIndex = 0;
            container.zIndex = 1;
            icon.zIndex = 2;
            this.buttonsRoot.addChild(selection);
            this.buttonsRoot.addChild(container);
            this.buttonsRoot.addChild(icon);
            this.buttons.push({
                id: option.id,
                container,
                icon,
                selection,
                hitArea: { x: 0, y: 0, width: 0, height: 0 },
                selectionBlend: option.id === this.selectedPlantId ? 1 : 0,
                pulseTime: 0,
            });
        }
    }

    private async loadTextures() {
        await Promise.all(
            PLANT_OPTIONS.map(async (option) => {
                try {
                    const texture = await Assets.load<Texture>(option.texturePath);
                    this.loadedTextures.set(option.id, texture);
                    const button = this.buttons.find((entry) => entry.id === option.id);
                    if (button) {
                        button.icon.texture = texture;
                    }
                } catch (error) {
                    console.error(`Failed to load plant icon: ${option.texturePath}`, error);
                }
            }),
        );
    }

    private layout() {
        const panelWidth = this.clamp(this.viewportWidth * 0.92, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH);
        const panelHeight = this.clamp(this.viewportHeight * 0.26, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT);
        const marginBottom = this.clamp(
            this.viewportHeight * 0.02,
            PANEL_MARGIN_BOTTOM,
            PANEL_MARGIN_BOTTOM_MAX,
        );
        const panelCenterX = this.viewportWidth * 0.5;
        const panelCenterY = this.viewportHeight - marginBottom - panelHeight * 0.5;
        const planButtonWidth = this.clamp(
            panelWidth * 0.32,
            PLAN_BUTTON_MIN_WIDTH,
            PLAN_BUTTON_MAX_WIDTH,
        );
        const planButtonHeight = this.clamp(
            panelHeight * 0.42,
            PLAN_BUTTON_MIN_HEIGHT,
            PLAN_BUTTON_MAX_HEIGHT,
        );
        const planButtonCenterY = panelCenterY - panelHeight * 0.86;

        this.panelWidth = panelWidth;
        this.panelHeight = panelHeight;
        this.panelCenterY = panelCenterY;
        this.planButtonWidth = planButtonWidth;
        this.planButtonHeight = planButtonHeight;
        this.planButtonCenterY = planButtonCenterY;

        this.panel.clear();
        this.panel.roundRect(
            panelCenterX - panelWidth * 0.5,
            panelCenterY - panelHeight * 0.5,
            panelWidth,
            panelHeight,
            Math.max(20, panelHeight * 0.22),
        );
        this.panel.fill({ color: 0xb59875, alpha: 0.94 });
        this.panel.stroke({ color: 0xe2bb89, alpha: 0.9, width: 4 });

        this.titleLabel.position.set(panelCenterX, panelCenterY - panelHeight * 0.34);

        const horizontalPadding = panelWidth * 0.1;
        const buttonsAreaWidth = panelWidth - horizontalPadding * 2;
        const buttonSpacing = Math.min(buttonsAreaWidth * 0.07, 28);
        const buttonSize = Math.min(
            (buttonsAreaWidth - buttonSpacing * 2) / 3,
            panelHeight * 0.52,
            126,
        );
        const totalButtonsWidth = buttonSize * 3 + buttonSpacing * 2;
        const startButtonX = panelCenterX - totalButtonsWidth * 0.5 + buttonSize * 0.5;
        const buttonY = panelCenterY + panelHeight * 0.12;

        for (let index = 0; index < this.buttons.length; index += 1) {
            const button = this.buttons[index];
            const buttonX = startButtonX + index * (buttonSize + buttonSpacing);
            button.hitArea.x = buttonX - buttonSize * 0.5;
            button.hitArea.y = buttonY - buttonSize * 0.5;
            button.hitArea.width = buttonSize;
            button.hitArea.height = buttonSize;
            button.icon.position.set(buttonX, buttonY);
            button.icon.width = buttonSize * 0.68;
            button.icon.height = buttonSize * 0.68;
        }

        this.planButton.hitArea.x = panelCenterX - planButtonWidth * 0.5;
        this.planButton.hitArea.y = planButtonCenterY - planButtonHeight * 0.5;
        this.planButton.hitArea.width = planButtonWidth;
        this.planButton.hitArea.height = planButtonHeight;

        this.updateVisibilityTransform();
    }

    private updateVisibility(deltaSeconds: number) {
        const duration = this.visibilityTarget > this.visibility ? ENTER_DURATION : EXIT_DURATION;
        if (duration <= Number.EPSILON || deltaSeconds <= 0) {
            this.visibility = this.visibilityTarget;
            this.updateVisibilityTransform();
            return;
        }

        const direction = this.visibilityTarget > this.visibility ? 1 : -1;
        this.visibility = this.clamp(
            this.visibility + (deltaSeconds / duration) * direction,
            0,
            1,
        );
        this.updateVisibilityTransform();
    }

    private updateVisibilityTransform() {
        const eased = this.easeOutCubic(this.visibility);
        const scale = this.lerp(VISIBILITY_HIDDEN_SCALE, 1, eased);
        const offsetY = VISIBILITY_HIDDEN_OFFSET_Y * (1 - eased);
        const alpha = eased;
        const panelCenterX = this.viewportWidth * 0.5;
        const planCenterX = this.viewportWidth * 0.5;
        const panelCenterY = this.panelCenterY + offsetY;
        const planCenterY = this.planButtonCenterY + offsetY;

        this.root.alpha = alpha;
        // Keep button graphics in local (0,0) space. Button animation/layout is handled
        // in animateButtons(), so mutating child transform here causes positional drift.
        for (const child of this.buttonsRoot.children) {
            child.position.set(0, 0);
            child.scale.set(1);
        }

        this.panel.scale.set(scale);
        this.panel.position.set(
            panelCenterX + (this.viewportWidth * 0.5 - panelCenterX) * (1 - scale),
            panelCenterY - this.panelCenterY * scale + this.panelCenterY,
        );
        this.titleLabel.scale.set(scale);
        this.titleLabel.position.y = this.panelCenterY - this.panelHeight * 0.34 * scale + offsetY;
        this.titleLabel.position.x = panelCenterX;

        this.planButton.container.position.set(0, 0);
        this.planButton.container.scale.set(1);
        this.planButton.label.scale.set(1);
        this.planButton.label.position.set(planCenterX, planCenterY);

        const panelWidth = this.panelWidth * scale;
        const panelHeight = this.panelHeight * scale;
        this.panelBounds.x = panelCenterX - panelWidth * 0.5;
        this.panelBounds.y = panelCenterY - panelHeight * 0.5;
        this.panelBounds.width = panelWidth;
        this.panelBounds.height = panelHeight;
        const planWidth = this.planButtonWidth * scale;
        const planHeight = this.planButtonHeight * scale;
        this.planBounds.x = planCenterX - planWidth * 0.5;
        this.planBounds.y = planCenterY - planHeight * 0.5;
        this.planBounds.width = planWidth;
        this.planBounds.height = planHeight;
    }

    private animateButtons(deltaSeconds: number) {
        const uiScale = this.getUIScale();
        const uiAlpha = this.visibility;
        for (const button of this.buttons) {
            const isSelected = button.id === this.selectedPlantId;
            const targetBlend = isSelected ? 1 : 0;
            const blendFactor = deltaSeconds > 0
                ? 1 - Math.exp(-SELECTION_BLEND_SPEED * deltaSeconds)
                : 1;
            button.selectionBlend = this.lerp(button.selectionBlend, targetBlend, blendFactor);
            if (isSelected) {
                button.pulseTime += Math.max(0, deltaSeconds);
            } else {
                button.pulseTime = 0;
            }

            const pulse = isSelected
                ? Math.sin(button.pulseTime * SELECTION_PULSE_SPEED) * 0.016
                : 0;
            const scale = 1 + button.selectionBlend * 0.09 + pulse;
            const bgColor = this.mixColor(0xf1d7b3, 0xe6bc86, button.selectionBlend);
            const selectionAlpha = (0.08 + button.selectionBlend * 0.46) * uiAlpha;
            const width = button.hitArea.width * scale * uiScale;
            const height = button.hitArea.height * scale * uiScale;
            const x = this.viewportWidth * 0.5 + (button.hitArea.x + button.hitArea.width * 0.5 - this.viewportWidth * 0.5) * uiScale;
            const y = this.panelCenterY + (button.hitArea.y + button.hitArea.height * 0.5 - this.panelCenterY) * uiScale + (this.panelBounds.y + this.panelBounds.height * 0.5 - this.panelCenterY);

            button.container.clear();
            button.container.roundRect(x - width * 0.5, y - height * 0.5, width, height, Math.max(14, width * 0.22));
            button.container.fill({ color: bgColor, alpha: (0.88 + button.selectionBlend * 0.12) * uiAlpha });
            button.container.stroke({ color: 0xc48d54, alpha: 0.92, width: 3 });

            button.selection.clear();
            button.selection.roundRect(x - width * 0.56, y - height * 0.56, width * 1.12, height * 1.12, Math.max(16, width * 0.28));
            button.selection.fill({ color: 0xffdca0, alpha: selectionAlpha });
            button.selection.visible = button.selectionBlend > 0.01;

            button.icon.position.set(x, y);
            const iconSize = button.hitArea.width * 0.68 * (1 + button.selectionBlend * 0.1 + pulse) * uiScale;
            button.icon.width = iconSize;
            button.icon.height = iconSize;
            button.icon.alpha = (0.9 + button.selectionBlend * 0.1) * uiAlpha;
        }
    }

    private animatePlanButton(deltaSeconds: number) {
        this.planButton.pulseTime += Math.max(0, deltaSeconds);
        const uiScale = this.getUIScale();
        const uiAlpha = this.visibility;
        const pulse = Math.sin(this.planButton.pulseTime * PLAN_BUTTON_PULSE_SPEED) * PLAN_BUTTON_PULSE_AMOUNT;
        const width = this.planButtonWidth * (1 + pulse) * uiScale;
        const height = this.planButtonHeight * (1 + pulse) * uiScale;
        const x = this.planBounds.x + this.planBounds.width * 0.5;
        const y = this.planBounds.y + this.planBounds.height * 0.5;

        this.planButton.container.clear();
        this.planButton.container.roundRect(x - width * 0.5, y - height * 0.5, width, height, Math.max(14, height * 0.26));
        this.planButton.container.fill({ color: 0xefbc5e, alpha: 0.96 * uiAlpha });
        this.planButton.container.stroke({ color: 0xfff8e6, width: 3, alpha: 0.98 * uiAlpha });
        this.planButton.label.position.set(x, y);
        this.planButton.label.alpha = uiAlpha;
    }

    private isInteractive() {
        return this.visibilityTarget > 0 && this.visibility >= INTERACTIVE_THRESHOLD;
    }

    private isPointInsideBounds(screenX: number, screenY: number, bounds: Bounds2D) {
        return (
            screenX >= bounds.x &&
            screenX <= bounds.x + bounds.width &&
            screenY >= bounds.y &&
            screenY <= bounds.y + bounds.height
        );
    }

    private getUIScale() {
        return this.lerp(VISIBILITY_HIDDEN_SCALE, 1, this.easeOutCubic(this.visibility));
    }

    private pickPlantAtScreenPoint(screenX: number, screenY: number) {
        for (const button of this.buttons) {
            if (this.isPointInsideBounds(screenX, screenY, button.hitArea)) {
                return button.id;
            }
        }

        return null;
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

        if (this.isPointInsideBounds(event.clientX, event.clientY, this.planBounds)) {
            audioManager.playClick();
            this.onPlanRequested?.();
            return;
        }

        const plantId = this.pickPlantAtScreenPoint(event.clientX, event.clientY);
        if (!plantId || !isPlantId(plantId)) {
            return;
        }

        audioManager.playClick();
        this.selectedPlantId = plantId;
        this.onPlantSelected?.(plantId);
    };

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    private lerp(from: number, to: number, t: number) {
        return from + (to - from) * this.clamp(t, 0, 1);
    }

    private easeOutCubic(value: number) {
        const t = this.clamp(value, 0, 1);
        const inverse = 1 - t;
        return 1 - inverse * inverse * inverse;
    }

    private mixColor(from: number, to: number, t: number) {
        const ratio = this.clamp(t, 0, 1);
        const fr = (from >> 16) & 0xff;
        const fg = (from >> 8) & 0xff;
        const fb = from & 0xff;
        const tr = (to >> 16) & 0xff;
        const tg = (to >> 8) & 0xff;
        const tb = to & 0xff;
        const r = Math.round(this.lerp(fr, tr, ratio));
        const g = Math.round(this.lerp(fg, tg, ratio));
        const b = Math.round(this.lerp(fb, tb, ratio));

        return (r << 16) | (g << 8) | b;
    }
}
