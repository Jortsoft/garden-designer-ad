import { Application, Container } from 'pixi.js';

const MAX_UI_PIXEL_RATIO = 2;

export class PixiUI {
    readonly app = new Application();
    readonly root = new Container();
    private readonly container: HTMLElement;
    private view: HTMLCanvasElement | null = null;
    private isInitialized = false;
    private isDisposed = false;
    private isVisible = true;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    async initialize(width: number, height: number) {
        if (this.isDisposed || this.isInitialized) {
            return;
        }

        await this.app.init({
            width: Math.max(width, 1),
            height: Math.max(height, 1),
            antialias: true,
            backgroundAlpha: 0,
            autoDensity: true,
            resolution: Math.min(window.devicePixelRatio || 1, MAX_UI_PIXEL_RATIO),
            autoStart: false,
        });
        this.isInitialized = true;
        this.app.stage.eventMode = 'none';
        this.root.sortableChildren = true;
        this.app.stage.addChild(this.root);

        if (this.container.style.position === '' || this.container.style.position === 'static') {
            this.container.style.position = 'relative';
        }

        this.view = this.app.canvas as HTMLCanvasElement;
        this.view.style.position = 'absolute';
        this.view.style.inset = '0';
        this.view.style.width = '100%';
        this.view.style.height = '100%';
        this.view.style.pointerEvents = 'none';
        this.view.style.zIndex = '4';
        this.view.style.visibility = this.isVisible ? 'visible' : 'hidden';
        this.container.append(this.view);
    }

    isReady() {
        return this.isInitialized && !this.isDisposed;
    }

    resize(width: number, height: number) {
        if (!this.isReady()) {
            return;
        }

        this.app.renderer.resize(Math.max(width, 1), Math.max(height, 1));
    }

    render() {
        if (!this.isReady()) {
            return;
        }

        this.app.render();
    }

    setVisible(isVisible: boolean) {
        this.isVisible = isVisible;

        if (!this.view) {
            return;
        }

        this.view.style.visibility = this.isVisible ? 'visible' : 'hidden';
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.root.removeChildren();
        this.app.destroy();
        this.view = null;
    }
}
