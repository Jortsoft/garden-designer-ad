import * as THREE from 'three';
import type {
    OverlayContainerTheme,
    OverlayContainerUIOptions,
} from '../Models/OverlayContainer.model';

const DEFAULT_THEME: OverlayContainerTheme = {
    backgroundColor: 'rgba(181, 152, 117, 0.94)',
    borderColor: 'rgba(226, 187, 137, 0.9)',
    titleColor: '#ffffff',
    titleStrokeColor: 'rgba(13, 19, 23, 0.92)',
    titleShadowColor: 'rgba(0, 65, 120, 0.34)',
};

const DEFAULT_RENDER_ORDER = 1100;
const DEFAULT_TITLE_FONT_FAMILY = '"Trebuchet MS", "Arial Rounded MT Bold", "Verdana", sans-serif';
const DEFAULT_TEXTURE_SCALE = 2.2;
const DEFAULT_TEXTURE_MIN_PIXEL_WIDTH = 720;
const DEFAULT_TEXTURE_MIN_PIXEL_HEIGHT = 280;
const DEFAULT_TEXTURE_MAX_PIXEL_WIDTH = 1920;
const DEFAULT_TEXTURE_MAX_PIXEL_HEIGHT = 860;

export class OverlayContainerUI {
    private readonly scene: THREE.Scene;
    private readonly theme: OverlayContainerTheme;
    private readonly titleFontFamily: string;
    private readonly textureScale: number;
    private readonly textureMinPixelWidth: number;
    private readonly textureMinPixelHeight: number;
    private readonly textureMaxPixelWidth: number;
    private readonly textureMaxPixelHeight: number;
    private readonly panelCanvas: HTMLCanvasElement;
    private readonly panelContext: CanvasRenderingContext2D | null;
    private readonly panelTexture: THREE.CanvasTexture;
    private readonly panelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

    private title: string;
    private panelTexturePixelWidth = 0;
    private panelTexturePixelHeight = 0;
    private panelWidth = 1;
    private panelHeight = 1;
    private panelCenterX = 0;
    private panelCenterY = 0;
    private panelScale = 1;
    private isDisposed = false;

    constructor(scene: THREE.Scene, options?: OverlayContainerUIOptions) {
        this.scene = scene;
        this.theme = {
            ...DEFAULT_THEME,
            ...(options?.theme ?? {}),
        };
        this.title = options?.title ?? '';
        this.titleFontFamily = options?.titleFontFamily ?? DEFAULT_TITLE_FONT_FAMILY;
        this.textureScale = options?.textureScale ?? DEFAULT_TEXTURE_SCALE;
        this.textureMinPixelWidth = options?.textureMinPixelWidth ?? DEFAULT_TEXTURE_MIN_PIXEL_WIDTH;
        this.textureMinPixelHeight = options?.textureMinPixelHeight ?? DEFAULT_TEXTURE_MIN_PIXEL_HEIGHT;
        this.textureMaxPixelWidth = options?.textureMaxPixelWidth ?? DEFAULT_TEXTURE_MAX_PIXEL_WIDTH;
        this.textureMaxPixelHeight = options?.textureMaxPixelHeight ?? DEFAULT_TEXTURE_MAX_PIXEL_HEIGHT;

        this.panelCanvas = document.createElement('canvas');
        this.panelContext = this.panelCanvas.getContext('2d');
        this.panelTexture = new THREE.CanvasTexture(this.panelCanvas);
        this.panelTexture.colorSpace = THREE.SRGBColorSpace;
        this.panelTexture.generateMipmaps = false;

        const panelMaterial = new THREE.MeshBasicMaterial({
            map: this.panelTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        panelMaterial.toneMapped = false;

        this.panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), panelMaterial);
        this.panelMesh.renderOrder = options?.renderOrder ?? DEFAULT_RENDER_ORDER;
        this.scene.add(this.panelMesh);
    }

    layout(width: number, height: number, centerX: number, centerY: number) {
        if (this.isDisposed) {
            return;
        }

        this.panelWidth = Math.max(1, width);
        this.panelHeight = Math.max(1, height);
        this.panelCenterX = centerX;
        this.panelCenterY = centerY;

        this.syncPanelTexture(this.panelWidth, this.panelHeight);
        this.applyPanelTransform();
    }

    setTransform(centerX: number, centerY: number, scale = 1) {
        if (this.isDisposed) {
            return;
        }

        this.panelCenterX = centerX;
        this.panelCenterY = centerY;
        this.panelScale = Math.max(scale, 0);
        this.applyPanelTransform();
    }

    setOpacity(opacity: number) {
        if (this.isDisposed) {
            return;
        }

        this.panelMesh.material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    }

    setVisible(visible: boolean) {
        if (this.isDisposed) {
            return;
        }

        this.panelMesh.visible = visible;
    }

    setTitle(title: string) {
        if (this.isDisposed || this.title === title) {
            return;
        }

        this.title = title;
        this.redrawPanelTexture();
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.panelMesh.geometry.dispose();
        this.panelMesh.material.dispose();
        this.scene.remove(this.panelMesh);
        this.panelTexture.dispose();
    }

    private syncPanelTexture(panelWidth: number, panelHeight: number) {
        const targetPixelWidth = THREE.MathUtils.clamp(
            Math.round(panelWidth * this.textureScale),
            this.textureMinPixelWidth,
            this.textureMaxPixelWidth,
        );
        const targetPixelHeight = THREE.MathUtils.clamp(
            Math.round(panelHeight * this.textureScale),
            this.textureMinPixelHeight,
            this.textureMaxPixelHeight,
        );

        if (
            this.panelTexturePixelWidth === targetPixelWidth &&
            this.panelTexturePixelHeight === targetPixelHeight
        ) {
            this.redrawPanelTexture();
            return;
        }

        this.panelTexturePixelWidth = targetPixelWidth;
        this.panelTexturePixelHeight = targetPixelHeight;
        this.panelCanvas.width = targetPixelWidth;
        this.panelCanvas.height = targetPixelHeight;
        this.redrawPanelTexture();
    }

    private applyPanelTransform() {
        this.panelMesh.scale.set(
            this.panelWidth * this.panelScale,
            this.panelHeight * this.panelScale,
            1,
        );
        this.panelMesh.position.set(this.panelCenterX, this.panelCenterY, 0);
    }

    private redrawPanelTexture() {
        if (!this.panelContext) {
            this.panelTexture.needsUpdate = true;
            return;
        }

        const width = this.panelCanvas.width;
        const height = this.panelCanvas.height;
        const context = this.panelContext;
        const outerPadding = Math.max(8, Math.round(height * 0.024));
        const outerRadius = Math.max(26, Math.round(height * 0.16));
        const borderWidth = Math.max(3, Math.round(height * 0.012));
        const outerWidth = width - outerPadding * 2;
        const outerHeight = height - outerPadding * 2;
        const hasTitle = this.title.trim().length > 0;

        context.clearRect(0, 0, width, height);

        context.save();
        context.shadowColor = 'rgba(0, 0, 0, 0.28)';
        context.shadowBlur = Math.round(height * 0.1);
        context.shadowOffsetY = Math.round(height * 0.022);
        this.drawRoundedRect(
            context,
            outerPadding,
            outerPadding + Math.round(height * 0.012),
            outerWidth,
            outerHeight,
            outerRadius,
        );
        context.fillStyle = 'rgba(0, 0, 0, 0.3)';
        context.fill();
        context.restore();

        const bodyGradient = context.createLinearGradient(
            0,
            outerPadding,
            0,
            outerPadding + outerHeight,
        );
        bodyGradient.addColorStop(0, 'rgba(214, 184, 147, 0.97)');
        bodyGradient.addColorStop(0.52, this.theme.backgroundColor);
        bodyGradient.addColorStop(1, 'rgba(148, 116, 84, 0.95)');
        this.drawRoundedRect(
            context,
            outerPadding,
            outerPadding,
            outerWidth,
            outerHeight,
            outerRadius,
        );
        context.fillStyle = bodyGradient;
        context.fill();

        const centerGlow = context.createRadialGradient(
            width * 0.5,
            outerPadding + outerHeight * 0.36,
            outerHeight * 0.08,
            width * 0.5,
            outerPadding + outerHeight * 0.4,
            outerHeight * 0.74,
        );
        centerGlow.addColorStop(0, 'rgba(255, 224, 174, 0.2)');
        centerGlow.addColorStop(1, 'rgba(255, 224, 174, 0)');
        this.drawRoundedRect(
            context,
            outerPadding + borderWidth + 2,
            outerPadding + borderWidth + 2,
            outerWidth - (borderWidth + 2) * 2,
            outerHeight - (borderWidth + 2) * 2,
            Math.max(18, Math.round(outerRadius * 0.82)),
        );
        context.fillStyle = centerGlow;
        context.fill();

        if (hasTitle) {
            const titleRibbonX = outerPadding + outerWidth * 0.15;
            const titleRibbonY = outerPadding + outerHeight * 0.065;
            const titleRibbonWidth = outerWidth * 0.7;
            const titleRibbonHeight = outerHeight * 0.24;
            const titleRibbonGradient = context.createLinearGradient(
                titleRibbonX,
                titleRibbonY,
                titleRibbonX + titleRibbonWidth,
                titleRibbonY + titleRibbonHeight,
            );
            titleRibbonGradient.addColorStop(0, 'rgba(168, 132, 92, 0.98)');
            titleRibbonGradient.addColorStop(0.5, 'rgba(152, 117, 82, 0.98)');
            titleRibbonGradient.addColorStop(1, 'rgba(130, 98, 68, 0.98)');
            this.drawRoundedRect(
                context,
                titleRibbonX,
                titleRibbonY,
                titleRibbonWidth,
                titleRibbonHeight,
                Math.max(14, Math.round(outerRadius * 0.56)),
            );
            context.fillStyle = titleRibbonGradient;
            context.fill();
            context.lineWidth = Math.max(2, Math.round(borderWidth * 0.48));
            context.strokeStyle = 'rgba(255, 233, 200, 0.58)';
            context.stroke();
        }

        const topSheenGradient = context.createLinearGradient(
            0,
            outerPadding,
            0,
            outerPadding + outerHeight * 0.52,
        );
        topSheenGradient.addColorStop(0, 'rgba(255, 240, 213, 0.24)');
        topSheenGradient.addColorStop(0.45, 'rgba(255, 240, 213, 0.08)');
        topSheenGradient.addColorStop(1, 'rgba(255, 240, 213, 0)');
        this.drawRoundedRect(
            context,
            outerPadding + borderWidth + 5,
            outerPadding + borderWidth + 4,
            outerWidth - (borderWidth + 5) * 2,
            outerHeight * 0.42,
            Math.max(16, Math.round(outerRadius * 0.76)),
        );
        context.fillStyle = topSheenGradient;
        context.fill();

        context.lineWidth = borderWidth;
        context.strokeStyle = this.theme.borderColor;
        this.drawRoundedRect(
            context,
            outerPadding,
            outerPadding,
            outerWidth,
            outerHeight,
            outerRadius,
        );
        context.stroke();

        context.lineWidth = Math.max(1, Math.round(borderWidth * 0.36));
        context.strokeStyle = 'rgba(255, 236, 208, 0.36)';
        this.drawRoundedRect(
            context,
            outerPadding + borderWidth * 0.58,
            outerPadding + borderWidth * 0.58,
            outerWidth - borderWidth * 1.16,
            outerHeight - borderWidth * 1.16,
            Math.max(14, Math.round(outerRadius * 0.9)),
        );
        context.stroke();

        if (hasTitle) {
            const titleFontSize = THREE.MathUtils.clamp(
                Math.round(height * 0.16),
                34,
                88,
            );
            const titleX = width * 0.5;
            const titleY = outerPadding + outerHeight * 0.185;
            const titleStrokeWidth = THREE.MathUtils.clamp(
                Math.round(height * 0.018),
                2,
                10,
            );
            context.fillStyle = this.theme.titleColor;
            context.font = `800 ${titleFontSize}px ${this.titleFontFamily}`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.shadowColor = this.theme.titleShadowColor;
            context.shadowBlur = Math.max(6, Math.round(height * 0.024));
            context.shadowOffsetY = Math.max(1, Math.round(height * 0.006));
            context.strokeStyle = this.theme.titleStrokeColor;
            context.lineWidth = titleStrokeWidth;
            context.lineJoin = 'round';
            context.miterLimit = 2;
            context.strokeText(this.title, titleX, titleY);
            context.fillText(this.title, titleX, titleY);
            context.shadowBlur = 0;
            context.shadowOffsetY = 0;
        }

        this.panelTexture.needsUpdate = true;
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
}
