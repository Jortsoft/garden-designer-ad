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
    MARKET_SELL_PRICE_PER_UNIT,
    type MarketRect,
    type MarketResourceCounts,
    type MarketResourceDefinition,
    type MarketResourceRowState,
    type MarketScreenPoint,
} from '../Models/Market.model';
import { PlantId } from '../Models/PlaceVegetable.model';
import { PixiUI } from '../Systems/PixiUI';

const RESOURCE_DEFINITIONS: readonly MarketResourceDefinition[] = [
    { id: PlantId.corn, iconPath: 'assets/images/corn.png', label: 'Corn' },
    { id: PlantId.grape, iconPath: 'assets/images/grape.png', label: 'Grape' },
    { id: PlantId.strawberry, iconPath: 'assets/images/strawberry.png', label: 'Strawberry' },
] as const;

const MODAL_WIDTH_MIN = 340;
const MODAL_WIDTH_MAX = 620;
const MODAL_HEIGHT_MIN = 340;
const MODAL_HEIGHT_MAX = 540;
const BACKDROP_ALPHA = 0.56;
const ROW_HEIGHT = 76;
const ICON_SIZE = 42;
const ADJUST_BUTTON_SIZE = 38;
const SELL_BUTTON_WIDTH = 230;
const SELL_BUTTON_HEIGHT = 58;
const MOBILE_TEXT_BREAKPOINT = 760;
const MOBILE_TEXT_MIN_SCALE = 0.7;

export class MarketModalUI {
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
        text: 'Market',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 40,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#6b3f1b', width: 5 },
        },
    });
    private readonly totalLabel = new Text({
        text: 'Total: $0',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 26,
            fill: '#fff6df',
            fontWeight: '800',
            stroke: { color: '#5b3318', width: 4 },
        },
    });
    private readonly sellButton = new Graphics();
    private readonly sellButtonLabel = new Text({
        text: 'Sell $0',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 34,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#5b2f14', width: 4 },
        },
    });
    private readonly rows: MarketResourceRowState[] = [];
    private readonly visibilityAnimation = new UIVisibilityAnimationController(
        SHARED_UI_VISIBILITY_ANIMATION,
    );

    private viewportWidth = 1;
    private viewportHeight = 1;
    private panelBounds: MarketRect = { x: 0, y: 0, width: 0, height: 0 };
    private closeButtonBounds: MarketRect = { x: 0, y: 0, width: 0, height: 0 };
    private sellButtonBounds: MarketRect = { x: 0, y: 0, width: 0, height: 0 };
    private isOpen = false;
    private shouldNotifyCloseOnHidden = false;
    private isRenderableByAnimation = false;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;
    private onCloseRequested: (() => void) | null = null;
    private onSellRequested: ((selection: Readonly<MarketResourceCounts>, totalUnits: number, totalMoney: number, sourceScreenPoint: Readonly<MarketScreenPoint>) => void) | null = null;

    constructor(inputElement: HTMLElement, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.pixiUI = pixiUI;
        this.root.visible = true;
        this.root.zIndex = 80;
        this.root.sortableChildren = true;
        this.modalContent.zIndex = 1;
        this.modalContent.sortableChildren = true;
        this.backdrop.zIndex = 0;
        this.panel.zIndex = 1;
        this.titleLabel.zIndex = 2;
        this.totalLabel.zIndex = 2;
        this.closeButton.zIndex = 3;
        this.closeLabel.zIndex = 4;
        this.sellButton.zIndex = 3;
        this.sellButtonLabel.zIndex = 4;
        this.titleLabel.anchor.set(0.5, 0.5);
        this.totalLabel.anchor.set(0.5, 0.5);
        this.closeLabel.anchor.set(0.5, 0.5);
        this.sellButtonLabel.anchor.set(0.5, 0.5);
        this.root.addChild(this.backdrop);
        this.root.addChild(this.modalContent);
        this.modalContent.addChild(this.panel);
        this.modalContent.addChild(this.titleLabel);
        this.modalContent.addChild(this.totalLabel);
        this.modalContent.addChild(this.closeButton);
        this.modalContent.addChild(this.closeLabel);
        this.modalContent.addChild(this.sellButton);
        this.modalContent.addChild(this.sellButtonLabel);
        this.createRows();
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

    show(resourceCounts: Readonly<MarketResourceCounts>) {
        if (this.isDisposed) {
            return;
        }

        for (const row of this.rows) {
            row.selectedCount = 0;
        }
        this.setAvailableResources(resourceCounts);
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

    setAvailableResources(resourceCounts: Readonly<MarketResourceCounts>) {
        for (const row of this.rows) {
            row.availableCount = Math.max(0, Math.round(resourceCounts[row.id] ?? 0));
            row.selectedCount = this.clamp(row.selectedCount, 0, row.availableCount);
        }

        this.refreshRowLabels();
        this.refreshSellInfo();

        if (this.isOpen) {
            this.layout();
        }
    }

    setOnCloseRequested(handler: (() => void) | null) {
        this.onCloseRequested = handler;
    }

    setOnSellRequested(
        handler: ((selection: Readonly<MarketResourceCounts>, totalUnits: number, totalMoney: number, sourceScreenPoint: Readonly<MarketScreenPoint>) => void) | null,
    ) {
        this.onSellRequested = handler;
    }

    isScreenPointBlocked(_screenX: number, _screenY: number) {
        return this.isRenderableByAnimation;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onCloseRequested = null;
        this.onSellRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.pixiUI.root.removeChild(this.root);
        this.root.destroy({ children: true });
    }

    private createRows() {
        for (const definition of RESOURCE_DEFINITIONS) {
            const icon = new Sprite(Texture.WHITE);
            icon.anchor.set(0.5, 0.5);
            icon.zIndex = 2;
            const nameLabel = new Text({
                text: definition.label,
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 24,
                    fill: '#fff6dd',
                    fontWeight: '800',
                    stroke: { color: '#5f3616', width: 4 },
                },
            });
            nameLabel.anchor.set(0, 0.5);
            nameLabel.zIndex = 2;
            const availableLabel = new Text({
                text: 'x0',
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 24,
                    fill: '#ffeaa9',
                    fontWeight: '800',
                    stroke: { color: '#5c3415', width: 4 },
                },
            });
            availableLabel.anchor.set(0, 0.5);
            availableLabel.zIndex = 2;
            const minusButton = new Graphics();
            minusButton.zIndex = 2;
            const minusLabel = new Text({
                text: '-',
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 34,
                    fill: '#fff8e8',
                    fontWeight: '900',
                },
            });
            minusLabel.anchor.set(0.5, 0.5);
            minusLabel.zIndex = 3;
            const plusButton = new Graphics();
            plusButton.zIndex = 2;
            const plusLabel = new Text({
                text: '+',
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 34,
                    fill: '#fff8e8',
                    fontWeight: '900',
                },
            });
            plusLabel.anchor.set(0.5, 0.5);
            plusLabel.zIndex = 3;
            const selectedLabel = new Text({
                text: '0',
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 30,
                    fill: '#ffffff',
                    fontWeight: '900',
                    stroke: { color: '#4f2e15', width: 4 },
                },
            });
            selectedLabel.anchor.set(0.5, 0.5);
            selectedLabel.zIndex = 3;
            this.modalContent.addChild(icon);
            this.modalContent.addChild(nameLabel);
            this.modalContent.addChild(availableLabel);
            this.modalContent.addChild(minusButton);
            this.modalContent.addChild(minusLabel);
            this.modalContent.addChild(plusButton);
            this.modalContent.addChild(plusLabel);
            this.modalContent.addChild(selectedLabel);
            this.rows.push({
                id: definition.id,
                icon,
                nameLabel,
                availableLabel,
                minusButton,
                minusLabel,
                plusButton,
                plusLabel,
                selectedLabel,
                minusHitArea: { x: 0, y: 0, width: 0, height: 0 },
                plusHitArea: { x: 0, y: 0, width: 0, height: 0 },
                iconTexture: null,
                availableCount: 0,
                selectedCount: 0,
            });
        }
    }

    private async loadTextures() {
        await Promise.all(
            RESOURCE_DEFINITIONS.map(async (definition) => {
                const row = this.rows.find((entry) => entry.id === definition.id);

                if (!row) {
                    return;
                }

                try {
                    const texture = await Assets.load<Texture>(definition.iconPath);
                    row.iconTexture = texture;
                    row.icon.texture = texture;
                } catch (error) {
                    console.error(`Failed to load market icon: ${definition.iconPath}`, error);
                }
            }),
        );
    }

    private layout() {
        this.applyResponsiveTypography();

        const panelWidth = this.clamp(this.viewportWidth * 0.86, MODAL_WIDTH_MIN, MODAL_WIDTH_MAX);
        const panelHeight = this.clamp(this.viewportHeight * 0.76, MODAL_HEIGHT_MIN, MODAL_HEIGHT_MAX);
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
            Math.max(18, panelHeight * 0.08),
        );
        this.panel.fill({ color: 0xb59875, alpha: 0.96 });
        this.panel.stroke({ color: 0xe2bb89, alpha: 0.92, width: 4 });

        this.titleLabel.position.set(this.viewportWidth * 0.5, panelY + 42);

        const closeSize = 42;
        this.closeButtonBounds.x = panelX + panelWidth - closeSize - 18;
        this.closeButtonBounds.y = panelY + 18;
        this.closeButtonBounds.width = closeSize;
        this.closeButtonBounds.height = closeSize;
        this.closeButton.clear();
        this.closeButton.roundRect(
            this.closeButtonBounds.x,
            this.closeButtonBounds.y,
            this.closeButtonBounds.width,
            this.closeButtonBounds.height,
            12,
        );
        this.closeButton.fill({ color: 0x6f3a1b, alpha: 0.95 });
        this.closeButton.stroke({ color: 0xfff6df, alpha: 0.9, width: 2 });
        this.closeLabel.position.set(
            this.closeButtonBounds.x + this.closeButtonBounds.width * 0.5,
            this.closeButtonBounds.y + this.closeButtonBounds.height * 0.5,
        );

        const rowsStartY = panelY + 112;
        const rowTitleOffsetY = -12 * this.getTextScale();
        const rowAvailableOffsetY = 16 * this.getTextScale();
        for (let index = 0; index < this.rows.length; index += 1) {
            const row = this.rows[index];
            const rowY = rowsStartY + index * ROW_HEIGHT;
            const rowCenterY = rowY + ROW_HEIGHT * 0.5;

            row.icon.position.set(panelX + 40, rowCenterY);
            row.icon.width = ICON_SIZE;
            row.icon.height = ICON_SIZE;
            row.nameLabel.position.set(panelX + 70, rowCenterY + rowTitleOffsetY);
            row.availableLabel.position.set(panelX + 70, rowCenterY + rowAvailableOffsetY);

            const minusX = panelX + panelWidth - 190;
            const plusX = panelX + panelWidth - 70;
            row.minusHitArea.x = minusX;
            row.minusHitArea.y = rowCenterY - ADJUST_BUTTON_SIZE * 0.5;
            row.minusHitArea.width = ADJUST_BUTTON_SIZE;
            row.minusHitArea.height = ADJUST_BUTTON_SIZE;
            row.plusHitArea.x = plusX;
            row.plusHitArea.y = rowCenterY - ADJUST_BUTTON_SIZE * 0.5;
            row.plusHitArea.width = ADJUST_BUTTON_SIZE;
            row.plusHitArea.height = ADJUST_BUTTON_SIZE;
            row.selectedLabel.position.set(panelX + panelWidth - 128, rowCenterY);

            row.minusButton.clear();
            row.minusButton.roundRect(
                row.minusHitArea.x,
                row.minusHitArea.y,
                row.minusHitArea.width,
                row.minusHitArea.height,
                11,
            );
            row.minusButton.fill({ color: 0x8c4b23, alpha: row.selectedCount > 0 ? 0.96 : 0.45 });
            row.minusButton.stroke({ color: 0xfff2de, alpha: 0.84, width: 2 });
            row.minusLabel.position.set(
                row.minusHitArea.x + row.minusHitArea.width * 0.5,
                row.minusHitArea.y + row.minusHitArea.height * 0.5,
            );
            row.minusLabel.alpha = row.selectedCount > 0 ? 1 : 0.65;

            row.plusButton.clear();
            row.plusButton.roundRect(
                row.plusHitArea.x,
                row.plusHitArea.y,
                row.plusHitArea.width,
                row.plusHitArea.height,
                11,
            );
            row.plusButton.fill({
                color: 0x5f8d2c,
                alpha: row.selectedCount < row.availableCount ? 0.96 : 0.45,
            });
            row.plusButton.stroke({ color: 0xfff2de, alpha: 0.84, width: 2 });
            row.plusLabel.position.set(
                row.plusHitArea.x + row.plusHitArea.width * 0.5,
                row.plusHitArea.y + row.plusHitArea.height * 0.5,
            );
            row.plusLabel.alpha = row.selectedCount < row.availableCount ? 1 : 0.65;
        }

        this.sellButtonBounds.width = SELL_BUTTON_WIDTH;
        this.sellButtonBounds.height = SELL_BUTTON_HEIGHT;
        this.sellButtonBounds.x = this.viewportWidth * 0.5 - SELL_BUTTON_WIDTH * 0.5;
        this.sellButtonBounds.y = panelY + panelHeight - SELL_BUTTON_HEIGHT - 26;
        this.sellButtonLabel.position.set(
            this.sellButtonBounds.x + this.sellButtonBounds.width * 0.5,
            this.sellButtonBounds.y + this.sellButtonBounds.height * 0.5,
        );
        this.drawSellButton();

        this.totalLabel.position.set(
            this.viewportWidth * 0.5,
            this.sellButtonBounds.y - 24,
        );
        this.refreshRowLabels();
        this.refreshSellInfo();
        this.applyVisibilityFrame();
    }

    private refreshRowLabels() {
        for (const row of this.rows) {
            row.availableLabel.text = `Have: ${row.availableCount}`;
            row.selectedLabel.text = `${row.selectedCount}`;
        }
    }

    private refreshSellInfo() {
        const totalUnits = this.getTotalSelectedUnits();
        const totalMoney = totalUnits * MARKET_SELL_PRICE_PER_UNIT;

        this.totalLabel.text = `Total: $${totalMoney}`;
        this.sellButtonLabel.text = totalUnits > 0 ? `Sell $${totalMoney}` : 'Sell';
        this.drawSellButton();
    }

    private drawSellButton() {
        const isEnabled = this.getTotalSelectedUnits() > 0;
        this.sellButton.clear();
        this.sellButton.roundRect(
            this.sellButtonBounds.x,
            this.sellButtonBounds.y,
            this.sellButtonBounds.width,
            this.sellButtonBounds.height,
            18,
        );
        this.sellButton.fill({
            color: isEnabled ? 0x57a32f : 0x7a7a7a,
            alpha: isEnabled ? 0.97 : 0.55,
        });
        this.sellButton.stroke({ color: 0xfff8e5, alpha: 0.9, width: 3 });
        this.sellButtonLabel.alpha = isEnabled ? 1 : 0.7;
    }

    private applyResponsiveTypography() {
        const textScale = this.getTextScale();

        this.titleLabel.style.fontSize = Math.round(40 * textScale);
        this.totalLabel.style.fontSize = Math.round(26 * textScale);
        this.closeLabel.style.fontSize = Math.round(24 * textScale);
        this.sellButtonLabel.style.fontSize = Math.round(34 * textScale);

        for (const row of this.rows) {
            row.nameLabel.style.fontSize = Math.round(24 * textScale);
            row.availableLabel.style.fontSize = Math.round(24 * textScale);
            row.selectedLabel.style.fontSize = Math.round(30 * textScale);
            row.minusLabel.style.fontSize = Math.round(34 * textScale);
            row.plusLabel.style.fontSize = Math.round(34 * textScale);
        }
    }

    private getTextScale() {
        if (this.viewportWidth >= MOBILE_TEXT_BREAKPOINT) {
            return 1;
        }

        const normalized = this.clamp(this.viewportWidth / MOBILE_TEXT_BREAKPOINT, 0, 1);
        return this.clamp(this.lerp(MOBILE_TEXT_MIN_SCALE, 1, normalized), MOBILE_TEXT_MIN_SCALE, 1);
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

    private getTotalSelectedUnits() {
        return this.rows.reduce((sum, row) => sum + row.selectedCount, 0);
    }

    private createSelectionSnapshot(): MarketResourceCounts {
        return {
            [PlantId.corn]: this.rows.find((entry) => entry.id === PlantId.corn)?.selectedCount ?? 0,
            [PlantId.grape]: this.rows.find((entry) => entry.id === PlantId.grape)?.selectedCount ?? 0,
            [PlantId.strawberry]: this.rows.find((entry) => entry.id === PlantId.strawberry)?.selectedCount ?? 0,
        };
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

        if (this.isPointInside(screenX, screenY, this.closeButtonBounds)) {
            audioManager.playClick();
            this.hide(true);
            return;
        }

        for (const row of this.rows) {
            if (this.isPointInside(screenX, screenY, row.minusHitArea)) {
                if (row.selectedCount > 0) {
                    audioManager.playClick();
                    row.selectedCount -= 1;
                    this.layout();
                }
                return;
            }

            if (this.isPointInside(screenX, screenY, row.plusHitArea)) {
                if (row.selectedCount < row.availableCount) {
                    audioManager.playClick();
                    row.selectedCount += 1;
                    this.layout();
                }
                return;
            }
        }

        if (this.isPointInside(screenX, screenY, this.sellButtonBounds)) {
            const totalUnits = this.getTotalSelectedUnits();

            if (totalUnits <= 0) {
                return;
            }

            audioManager.playClick();
            const selection = this.createSelectionSnapshot();
            const totalMoney = totalUnits * MARKET_SELL_PRICE_PER_UNIT;
            this.onSellRequested?.(
                selection,
                totalUnits,
                totalMoney,
                this.getSellButtonCenter(),
            );
            for (const row of this.rows) {
                row.selectedCount = 0;
            }
            this.layout();
            return;
        }

        if (!this.isPointInside(screenX, screenY, this.panelBounds)) {
            audioManager.playClick();
            this.hide(true);
        }
    };

    private isPointInside(screenX: number, screenY: number, bounds: Readonly<MarketRect>) {
        return (
            screenX >= bounds.x &&
            screenX <= bounds.x + bounds.width &&
            screenY >= bounds.y &&
            screenY <= bounds.y + bounds.height
        );
    }

    private getSellButtonCenter(): MarketScreenPoint {
        return {
            x: this.sellButtonBounds.x + this.sellButtonBounds.width * 0.5,
            y: this.sellButtonBounds.y + this.sellButtonBounds.height * 0.5,
        };
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    private lerp(from: number, to: number, t: number) {
        return from + (to - from) * this.clamp(t, 0, 1);
    }
}
