import {
    Assets,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
} from 'pixi.js';
import {
    SHARED_UI_VISIBILITY_ANIMATION,
    UIVisibilityAnimationController,
} from '../Animations/AnimationUI';
import { audioManager } from '../Managers/AudioManager';
import {
    AnimalId,
    getAnimalPrice,
    type AnimalOptionDefinition,
    type AnimalShopOptionState,
    type AnimalShopRect,
} from '../Models/Animal.model';
import { PixiUI } from '../Systems/PixiUI';

const ANIMAL_OPTIONS: readonly AnimalOptionDefinition[] = [
    {
        id: AnimalId.chicken,
        label: 'Chicken',
        iconPath: 'assets/images/chicken_icon.png',
        price: getAnimalPrice(AnimalId.chicken),
    },
    {
        id: AnimalId.cow,
        label: 'Cow',
        iconPath: 'assets/images/cow.png',
        price: getAnimalPrice(AnimalId.cow),
    },
] as const;

const MODAL_WIDTH_MIN = 300;
const MODAL_WIDTH_MAX = 430;
const MODAL_HEIGHT_MIN = 250;
const MODAL_HEIGHT_MAX = 330;
const BACKDROP_ALPHA = 0.56;
const OPTION_GAP = 16;
const OPTION_HEIGHT = 120;
const ICON_SIZE = 54;
const CLOSE_SIZE = 42;
const BUY_BUTTON_HEIGHT = 54;
const MOBILE_TEXT_BREAKPOINT = 760;
const MOBILE_TEXT_MIN_SCALE = 0.72;

export class AnimalShopUI {
    private readonly inputElement: HTMLElement;
    private readonly pixiUI: PixiUI;
    private readonly root = new Container();
    private readonly modalContent = new Container();
    private readonly backdrop = new Graphics();
    private readonly panel = new Graphics();
    private readonly closeButton = new Graphics();
    private readonly closeLabel = new Text({
        text: 'X',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 24,
            fill: '#fff8e8',
            fontWeight: '800',
            stroke: { color: '#5b2f14', width: 4 },
        },
    });
    private readonly titleLabel = new Text({
        text: 'Animal Shop',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 36,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#6b3f1b', width: 5 },
        },
    });
    private readonly buyButton = new Graphics();
    private readonly buyButtonLabel = new Text({
        text: 'Buy',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 32,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#5b2f14', width: 4 },
        },
    });
    private readonly options: AnimalShopOptionState[] = [];
    private readonly visibilityAnimation = new UIVisibilityAnimationController(
        SHARED_UI_VISIBILITY_ANIMATION,
    );

    private viewportWidth = 1;
    private viewportHeight = 1;
    private panelBounds: AnimalShopRect = { x: 0, y: 0, width: 0, height: 0 };
    private closeBounds: AnimalShopRect = { x: 0, y: 0, width: 0, height: 0 };
    private buyBounds: AnimalShopRect = { x: 0, y: 0, width: 0, height: 0 };
    private selectedAnimalId: AnimalId = AnimalId.chicken;
    private currentMoney = 0;
    private isOpen = false;
    private shouldNotifyCloseOnHidden = false;
    private isRenderableByAnimation = false;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;
    private onCloseRequested: (() => void) | null = null;
    private onBuyRequested: ((animalId: AnimalId) => void) | null = null;

    constructor(inputElement: HTMLElement, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.pixiUI = pixiUI;
        this.root.visible = true;
        this.root.zIndex = 82;
        this.root.sortableChildren = true;
        this.modalContent.zIndex = 1;
        this.modalContent.sortableChildren = true;
        this.backdrop.zIndex = 0;
        this.panel.zIndex = 1;
        this.titleLabel.zIndex = 2;
        this.closeButton.zIndex = 3;
        this.closeLabel.zIndex = 4;
        this.buyButton.zIndex = 3;
        this.buyButtonLabel.zIndex = 4;
        this.titleLabel.anchor.set(0.5, 0.5);
        this.closeLabel.anchor.set(0.5, 0.5);
        this.buyButtonLabel.anchor.set(0.5, 0.5);
        this.root.addChild(this.backdrop);
        this.root.addChild(this.modalContent);
        this.modalContent.addChild(this.panel);
        this.modalContent.addChild(this.titleLabel);
        this.modalContent.addChild(this.closeButton);
        this.modalContent.addChild(this.closeLabel);
        this.modalContent.addChild(this.buyButton);
        this.modalContent.addChild(this.buyButtonLabel);
        this.createOptions();
        this.refreshBuyButtonLabel();
        this.visibilityAnimation.hide(true);
        this.applyVisibilityFrame();
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

    update(deltaSeconds: number) {
        if (this.isDisposed || !this.isInitialized) {
            return;
        }

        this.visibilityAnimation.update(Math.max(0, deltaSeconds));
        this.applyVisibilityFrame();

        if (
            this.shouldNotifyCloseOnHidden &&
            !this.isOpen &&
            !this.isRenderableByAnimation
        ) {
            this.shouldNotifyCloseOnHidden = false;
            this.onCloseRequested?.();
        }
    }

    render() {
        // Rendered by shared PixiUI.
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.layout();
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.selectedAnimalId = AnimalId.chicken;
        this.refreshBuyButtonLabel();
        this.isOpen = true;
        this.shouldNotifyCloseOnHidden = false;
        this.root.visible = true;
        this.visibilityAnimation.show(false);
        this.applyVisibilityFrame();
        this.layout();
    }

    hide(notifyOnHidden = false) {
        this.isOpen = false;
        this.shouldNotifyCloseOnHidden = this.shouldNotifyCloseOnHidden || notifyOnHidden;
        this.visibilityAnimation.hide(false);
        this.applyVisibilityFrame();
    }

    setMoney(value: number) {
        const nextValue = Math.max(0, Math.round(value));
        if (this.currentMoney === nextValue) {
            return;
        }

        this.currentMoney = nextValue;
        this.refreshBuyButtonLabel();
        this.layout();
    }

    isScreenPointBlocked(_screenX: number, _screenY: number) {
        return this.isRenderableByAnimation;
    }

    setOnCloseRequested(handler: (() => void) | null) {
        this.onCloseRequested = handler;
    }

    setOnBuyRequested(handler: ((animalId: AnimalId) => void) | null) {
        this.onBuyRequested = handler;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onCloseRequested = null;
        this.onBuyRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.pixiUI.root.removeChild(this.root);
        this.root.destroy({ children: true });
    }

    private createOptions() {
        for (const definition of ANIMAL_OPTIONS) {
            const container = new Graphics();
            container.zIndex = 2;
            const icon = new Sprite(Texture.WHITE);
            icon.anchor.set(0.5, 0.5);
            icon.zIndex = 3;
            const label = new Text({
                text: `${definition.label} $${definition.price}`,
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 26,
                    fill: '#fff6dd',
                    fontWeight: '800',
                    stroke: { color: '#5f3616', width: 4 },
                },
            });
            label.anchor.set(0.5, 0.5);
            label.zIndex = 3;
            this.modalContent.addChild(container);
            this.modalContent.addChild(icon);
            this.modalContent.addChild(label);
            this.options.push({
                id: definition.id,
                price: definition.price,
                container,
                icon,
                label,
                hitArea: { x: 0, y: 0, width: 0, height: 0 },
                iconTexture: null,
            });
        }
    }

    private async loadTextures() {
        await Promise.all(
            ANIMAL_OPTIONS.map(async (definition) => {
                const option = this.options.find((entry) => entry.id === definition.id);
                if (!option) {
                    return;
                }

                try {
                    const texture = await Assets.load<Texture>(definition.iconPath);
                    option.iconTexture = texture;
                    option.icon.texture = texture;
                } catch (error) {
                    console.error(`Failed to load animal icon: ${definition.iconPath}`, error);
                }
            }),
        );
    }

    private layout() {
        this.applyResponsiveTypography();

        const panelWidth = this.clamp(this.viewportWidth * 0.64, MODAL_WIDTH_MIN, MODAL_WIDTH_MAX);
        const panelHeight = this.clamp(this.viewportHeight * 0.52, MODAL_HEIGHT_MIN, MODAL_HEIGHT_MAX);
        const panelX = this.viewportWidth * 0.5 - panelWidth * 0.5;
        const panelY = this.viewportHeight * 0.5 - panelHeight * 0.5;

        this.panelBounds.x = panelX;
        this.panelBounds.y = panelY;
        this.panelBounds.width = panelWidth;
        this.panelBounds.height = panelHeight;

        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.viewportWidth, this.viewportHeight);
        this.backdrop.fill({ color: 0x0a0806, alpha: BACKDROP_ALPHA });

        this.panel.clear();
        this.panel.roundRect(
            panelX,
            panelY,
            panelWidth,
            panelHeight,
            Math.max(16, panelHeight * 0.1),
        );
        this.panel.fill({ color: 0xb59875, alpha: 0.96 });
        this.panel.stroke({ color: 0xe2bb89, alpha: 0.92, width: 4 });

        this.titleLabel.position.set(this.viewportWidth * 0.5, panelY + 40);

        this.closeBounds.x = panelX + panelWidth - CLOSE_SIZE - 16;
        this.closeBounds.y = panelY + 14;
        this.closeBounds.width = CLOSE_SIZE;
        this.closeBounds.height = CLOSE_SIZE;
        this.closeButton.clear();
        this.closeButton.roundRect(
            this.closeBounds.x,
            this.closeBounds.y,
            this.closeBounds.width,
            this.closeBounds.height,
            12,
        );
        this.closeButton.fill({ color: 0x6f3a1b, alpha: 0.95 });
        this.closeButton.stroke({ color: 0xfff6df, alpha: 0.9, width: 2 });
        this.closeLabel.position.set(
            this.closeBounds.x + this.closeBounds.width * 0.5,
            this.closeBounds.y + this.closeBounds.height * 0.5,
        );

        const optionsWidth = panelWidth - 40;
        const optionWidth = (optionsWidth - OPTION_GAP) * 0.5;
        const optionY = panelY + 74;
        for (let index = 0; index < this.options.length; index += 1) {
            const option = this.options[index];
            option.hitArea.x = panelX + 20 + index * (optionWidth + OPTION_GAP);
            option.hitArea.y = optionY;
            option.hitArea.width = optionWidth;
            option.hitArea.height = OPTION_HEIGHT;

            const isSelected = this.selectedAnimalId === option.id;
            option.container.clear();
            option.container.roundRect(
                option.hitArea.x,
                option.hitArea.y,
                option.hitArea.width,
                option.hitArea.height,
                16,
            );
            option.container.fill({
                color: isSelected ? 0x6aa63f : 0x8b6948,
                alpha: isSelected ? 0.95 : 0.84,
            });
            option.container.stroke({
                color: isSelected ? 0xfff4d2 : 0xd2b187,
                alpha: 0.9,
                width: isSelected ? 3 : 2,
            });

            option.icon.position.set(
                option.hitArea.x + option.hitArea.width * 0.5,
                option.hitArea.y + 42,
            );
            option.icon.width = ICON_SIZE;
            option.icon.height = ICON_SIZE;
            option.label.position.set(
                option.hitArea.x + option.hitArea.width * 0.5,
                option.hitArea.y + option.hitArea.height - 24,
            );
        }

        this.buyBounds.x = panelX + panelWidth * 0.5 - (panelWidth - 60) * 0.5;
        this.buyBounds.y = panelY + panelHeight - BUY_BUTTON_HEIGHT - 22;
        this.buyBounds.width = panelWidth - 60;
        this.buyBounds.height = BUY_BUTTON_HEIGHT;
        const canAffordSelectedAnimal = this.canAffordSelectedAnimal();
        this.buyButton.clear();
        this.buyButton.roundRect(
            this.buyBounds.x,
            this.buyBounds.y,
            this.buyBounds.width,
            this.buyBounds.height,
            16,
        );
        this.buyButton.fill({
            color: canAffordSelectedAnimal ? 0x57a32f : 0x6e634f,
            alpha: canAffordSelectedAnimal ? 0.97 : 0.88,
        });
        this.buyButton.stroke({
            color: canAffordSelectedAnimal ? 0xfff8e5 : 0xcdbb9d,
            alpha: 0.9,
            width: 3,
        });
        this.buyButtonLabel.alpha = canAffordSelectedAnimal ? 1 : 0.78;
        this.buyButtonLabel.position.set(
            this.buyBounds.x + this.buyBounds.width * 0.5,
            this.buyBounds.y + this.buyBounds.height * 0.5,
        );

        this.applyVisibilityFrame();
    }

    private applyResponsiveTypography() {
        const textScale = this.getTextScale();
        this.titleLabel.style.fontSize = Math.round(36 * textScale);
        this.closeLabel.style.fontSize = Math.round(24 * textScale);
        this.buyButtonLabel.style.fontSize = Math.round(32 * textScale);
        for (const option of this.options) {
            option.label.style.fontSize = Math.round(26 * textScale);
        }
    }

    private getTextScale() {
        if (this.viewportWidth >= MOBILE_TEXT_BREAKPOINT) {
            return 1;
        }

        const normalized = this.clamp(this.viewportWidth / MOBILE_TEXT_BREAKPOINT, 0, 1);
        return this.clamp(this.lerp(MOBILE_TEXT_MIN_SCALE, 1, normalized), MOBILE_TEXT_MIN_SCALE, 1);
    }

    private refreshBuyButtonLabel() {
        const selectedOption = this.getSelectedOption();
        if (!selectedOption) {
            this.buyButtonLabel.text = 'Buy';
            return;
        }

        const priceText = `$${selectedOption.price}`;
        this.buyButtonLabel.text = this.canAffordSelectedAnimal()
            ? `Buy ${priceText}`
            : `Need ${priceText}`;
    }

    private applyVisibilityFrame() {
        const frame = this.visibilityAnimation.getFrame();
        this.isRenderableByAnimation = frame.isRenderable;
        this.root.visible = true;
        this.backdrop.alpha = frame.opacity;
        this.modalContent.alpha = frame.opacity;
        this.modalContent.pivot.set(this.viewportWidth * 0.5, this.viewportHeight * 0.5);
        this.modalContent.position.set(
            this.viewportWidth * 0.5,
            this.viewportHeight * 0.5 + frame.offsetY,
        );
        this.modalContent.scale.set(frame.scale);
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isRenderableByAnimation || this.isDisposed) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const visibilityFrame = this.visibilityAnimation.getFrame();
        if (!visibilityFrame.isInteractive) {
            return;
        }

        const screenX = event.clientX;
        const screenY = event.clientY;

        if (this.isPointInside(screenX, screenY, this.closeBounds)) {
            audioManager.playClick();
            this.hide(true);
            return;
        }

        for (const option of this.options) {
            if (!this.isPointInside(screenX, screenY, option.hitArea)) {
                continue;
            }

            if (this.selectedAnimalId !== option.id) {
                audioManager.playClick();
                this.selectedAnimalId = option.id;
                this.refreshBuyButtonLabel();
                this.layout();
            }
            return;
        }

        if (this.isPointInside(screenX, screenY, this.buyBounds)) {
            if (!this.canAffordSelectedAnimal()) {
                return;
            }

            audioManager.playClick();
            this.onBuyRequested?.(this.selectedAnimalId);
            this.hide(true);
            return;
        }

        if (!this.isPointInside(screenX, screenY, this.panelBounds)) {
            audioManager.playClick();
            this.hide(true);
        }
    };

    private isPointInside(screenX: number, screenY: number, bounds: Readonly<AnimalShopRect>) {
        return (
            screenX >= bounds.x &&
            screenX <= bounds.x + bounds.width &&
            screenY >= bounds.y &&
            screenY <= bounds.y + bounds.height
        );
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    private lerp(from: number, to: number, t: number) {
        return from + (to - from) * this.clamp(t, 0, 1);
    }

    private getSelectedOption() {
        return this.options.find((option) => option.id === this.selectedAnimalId) ?? null;
    }

    private canAffordSelectedAnimal() {
        const selectedOption = this.getSelectedOption();
        if (!selectedOption) {
            return false;
        }

        return this.currentMoney >= selectedOption.price;
    }
}
