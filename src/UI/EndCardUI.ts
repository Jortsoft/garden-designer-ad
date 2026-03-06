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
import type { EndCardRect } from '../Models/EndCard.model';
import { PixiUI } from '../Systems/PixiUI';
import { GameConfig } from '../Managers/GameConfig';

const GAME_ICON_PATH = 'assets/icon.png';
const BACKDROP_ALPHA = 0.5;
const ICON_MIN_SIZE = 88;
const ICON_MAX_SIZE = 170;
const ICON_SCREEN_RATIO = 0.2;
const BUTTON_WIDTH_MIN = 190;
const BUTTON_WIDTH_MAX = 340;
const BUTTON_HEIGHT_MIN = 54;
const BUTTON_HEIGHT_MAX = 66;
const MOBILE_TEXT_BREAKPOINT = 760;
const MOBILE_TEXT_MIN_SCALE = 0.68;
const SAFE_VIEWPORT_PADDING = 20;
const TITLE_GAP_MIN = 14;
const TITLE_GAP_MAX = 24;
const BUTTON_GAP_MIN = 16;
const BUTTON_GAP_MAX = 28;
const BUTTON_LABEL_HORIZONTAL_PADDING = 26;

export class EndCardUI {
    private readonly inputElement: HTMLElement;
    private readonly pixiUI: PixiUI;
    private readonly root = new Container();
    private readonly content = new Container();
    private readonly backdrop = new Graphics();
    private readonly iconFrame = new Graphics();
    private readonly downloadButton = new Graphics();
    private readonly iconSprite = new Sprite(Texture.WHITE);
    private readonly titleLabel = new Text({
        text: GameConfig.gameName,
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 38,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#6b3f1b', width: 5 },
        },
    });
    private readonly buttonLabel = new Text({
        text: 'Download Game',
        style: {
            fontFamily: 'Trebuchet MS, Verdana, sans-serif',
            fontSize: 33,
            fill: '#fff8e8',
            fontWeight: '900',
            stroke: { color: '#5b2f14', width: 4 },
        },
    });
    private readonly visibilityAnimation = new UIVisibilityAnimationController(
        SHARED_UI_VISIBILITY_ANIMATION,
    );

    private viewportWidth = 1;
    private viewportHeight = 1;
    private buttonBounds: EndCardRect = { x: 0, y: 0, width: 0, height: 0 };
    private isOpen = false;
    private isInitialized = false;
    private isDisposed = false;
    private isRenderableByAnimation = false;
    private loadPromise: Promise<void> | null = null;
    private onDownloadRequested: (() => void) | null = null;

    constructor(inputElement: HTMLElement, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.pixiUI = pixiUI;
        this.root.visible = true;
        this.root.zIndex = 160;
        this.root.sortableChildren = true;
        this.content.zIndex = 1;
        this.content.sortableChildren = true;
        this.backdrop.zIndex = 0;
        this.iconFrame.zIndex = 1;
        this.iconSprite.zIndex = 2;
        this.titleLabel.zIndex = 3;
        this.downloadButton.zIndex = 4;
        this.buttonLabel.zIndex = 5;
        this.iconSprite.anchor.set(0.5, 0.5);
        this.titleLabel.anchor.set(0.5, 0.5);
        this.buttonLabel.anchor.set(0.5, 0.5);
        this.root.addChild(this.backdrop);
        this.root.addChild(this.content);
        this.content.addChild(this.iconFrame);
        this.content.addChild(this.iconSprite);
        this.content.addChild(this.titleLabel);
        this.content.addChild(this.downloadButton);
        this.content.addChild(this.buttonLabel);
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
        this.loadPromise = this.loadIconTexture();

        return this.loadPromise;
    }

    show() {
        if (this.isDisposed) {
            return;
        }

        this.isOpen = true;
        this.root.visible = true;
        this.visibilityAnimation.show(false);
        this.applyVisibilityFrame();
        this.layout();
    }

    hide() {
        this.isOpen = false;
        this.visibilityAnimation.hide(false);
        this.applyVisibilityFrame();
    }

    update(deltaSeconds: number) {
        if (this.isDisposed || !this.isInitialized) {
            return;
        }

        this.visibilityAnimation.update(Math.max(0, deltaSeconds));
        this.applyVisibilityFrame();
    }

    render() {
        // Rendered by shared PixiUI.
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.layout();
    }

    isScreenPointBlocked(_screenX: number, _screenY: number) {
        return this.isRenderableByAnimation;
    }

    setOnDownloadRequested(handler: (() => void) | null) {
        this.onDownloadRequested = handler;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onDownloadRequested = null;
        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        this.pixiUI.root.removeChild(this.root);
        this.root.destroy({ children: true });
    }

    private async loadIconTexture() {
        try {
            const texture = await Assets.load<Texture>(GAME_ICON_PATH);
            this.iconSprite.texture = texture;
        } catch (error) {
            console.error(`Failed to load end card icon: ${GAME_ICON_PATH}`, error);
        }
    }

    private layout() {
        const centerX = this.viewportWidth * 0.5;
        const textScale = this.getTextScale();
        this.applyResponsiveTypography(textScale);
        const safePadding = this.clamp(this.viewportWidth * 0.04, SAFE_VIEWPORT_PADDING, 34);
        const iconSize = this.clamp(
            this.viewportWidth * ICON_SCREEN_RATIO,
            ICON_MIN_SIZE,
            ICON_MAX_SIZE,
        );
        const iconFramePadding = this.clamp(iconSize * 0.12, 10, 16);
        const iconFrameSize = iconSize + iconFramePadding * 2;
        const maxButtonWidth = Math.max(150, this.viewportWidth - safePadding * 2);
        const buttonWidth = Math.min(
            this.clamp(
                this.viewportWidth * 0.64,
                BUTTON_WIDTH_MIN,
                BUTTON_WIDTH_MAX,
            ),
            maxButtonWidth,
        );
        const buttonHeight = this.clamp(
            this.viewportHeight * 0.11,
            BUTTON_HEIGHT_MIN,
            BUTTON_HEIGHT_MAX,
        );
        const titleGap = this.clamp(
            22 * textScale,
            TITLE_GAP_MIN,
            TITLE_GAP_MAX,
        );
        const buttonGap = this.clamp(
            24 * textScale,
            BUTTON_GAP_MIN,
            BUTTON_GAP_MAX,
        );

        this.fitLabelFontSizeToWidth(
            this.titleLabel,
            Math.max(120, this.viewportWidth - safePadding * 2),
            Math.round(20 * textScale),
        );

        const contentHeight =
            iconFrameSize +
            titleGap +
            this.titleLabel.height +
            buttonGap +
            buttonHeight;
        const contentTop = this.clamp(
            this.viewportHeight * 0.5 - contentHeight * 0.5,
            safePadding,
            Math.max(safePadding, this.viewportHeight - safePadding - contentHeight),
        );

        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.viewportWidth, this.viewportHeight);
        this.backdrop.fill({ color: 0x050404, alpha: BACKDROP_ALPHA });

        this.iconFrame.clear();
        this.iconFrame.roundRect(
            centerX - iconFrameSize * 0.5,
            contentTop,
            iconFrameSize,
            iconFrameSize,
            28,
        );
        this.iconFrame.fill({ color: 0xb59875, alpha: 0.95 });
        this.iconFrame.stroke({ color: 0xe2bb89, alpha: 0.92, width: 4 });

        const iconCenterY = contentTop + iconFrameSize * 0.5;
        this.iconSprite.position.set(centerX, iconCenterY);
        this.iconSprite.width = iconSize;
        this.iconSprite.height = iconSize;

        const titleCenterY = contentTop + iconFrameSize + titleGap + this.titleLabel.height * 0.5;
        this.titleLabel.position.set(centerX, titleCenterY);

        this.buttonBounds.width = buttonWidth;
        this.buttonBounds.height = buttonHeight;
        this.buttonBounds.x = centerX - buttonWidth * 0.5;
        this.buttonBounds.y = titleCenterY + this.titleLabel.height * 0.5 + buttonGap;
        this.downloadButton.clear();
        this.downloadButton.roundRect(
            this.buttonBounds.x,
            this.buttonBounds.y,
            this.buttonBounds.width,
            this.buttonBounds.height,
            18,
        );
        this.downloadButton.fill({ color: 0x57a32f, alpha: 0.97 });
        this.downloadButton.stroke({ color: 0xfff8e5, alpha: 0.9, width: 3 });
        this.fitLabelFontSizeToWidth(
            this.buttonLabel,
            Math.max(80, this.buttonBounds.width - BUTTON_LABEL_HORIZONTAL_PADDING * 2),
            Math.round(17 * textScale),
        );
        this.buttonLabel.position.set(
            this.buttonBounds.x + this.buttonBounds.width * 0.5,
            this.buttonBounds.y + this.buttonBounds.height * 0.5,
        );

        this.applyVisibilityFrame();
    }

    private applyResponsiveTypography(textScale: number) {
        this.titleLabel.style.fontSize = Math.round(38 * textScale);
        this.buttonLabel.style.fontSize = Math.round(33 * textScale);
    }

    private getTextScale() {
        if (this.viewportWidth >= MOBILE_TEXT_BREAKPOINT) {
            return 1;
        }

        const normalized = this.clamp(this.viewportWidth / MOBILE_TEXT_BREAKPOINT, 0, 1);
        return this.clamp(
            this.lerp(MOBILE_TEXT_MIN_SCALE, 1, normalized),
            MOBILE_TEXT_MIN_SCALE,
            1,
        );
    }

    private fitLabelFontSizeToWidth(label: Text, maxWidth: number, minFontSize: number) {
        const initialFontSize = label.style.fontSize;
        let fontSize = typeof initialFontSize === 'number'
            ? initialFontSize
            : Number(initialFontSize) || minFontSize;

        while (fontSize > minFontSize && label.width > maxWidth) {
            fontSize -= 1;
            label.style.fontSize = fontSize;
        }
    }

    private applyVisibilityFrame() {
        const frame = this.visibilityAnimation.getFrame();
        this.isRenderableByAnimation = frame.isRenderable;
        this.root.visible = true;
        this.backdrop.alpha = frame.opacity * BACKDROP_ALPHA;
        this.content.alpha = frame.opacity;
        this.content.pivot.set(this.viewportWidth * 0.5, this.viewportHeight * 0.5);
        this.content.position.set(
            this.viewportWidth * 0.5,
            this.viewportHeight * 0.5 + frame.offsetY,
        );
        this.content.scale.set(frame.scale);
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (!this.isRenderableByAnimation || !this.isOpen || this.isDisposed) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const frame = this.visibilityAnimation.getFrame();
        if (!frame.isInteractive) {
            return;
        }

        const screenX = event.clientX;
        const screenY = event.clientY;
        if (!this.isPointInside(screenX, screenY, this.buttonBounds)) {
            return;
        }

        audioManager.playClick();
        this.onDownloadRequested?.();
    };

    private isPointInside(screenX: number, screenY: number, bounds: Readonly<EndCardRect>) {
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
}
