import * as THREE from 'three';
import { GameConfig } from './GameConfig';
import { LIGHT_CONTROLS, LightingManager } from './LightingManager';
import type { LightSettingKey } from './LightingManager';
import { POST_PROCESSING_CONTROLS, PostProcessingManager } from './PostProcessingManager';
import type { PostProcessingSettingKey } from './PostProcessingManager';

const FPS_SAMPLE_WINDOW = 0.25;
const PANEL_WIDTH = 360;
const PANEL_HEADER_HEIGHT = 92;
const SECTION_TITLE_HEIGHT = 28;
const SECTION_TITLE_BASELINE_OFFSET = 12;
const SECTION_GAP = 8;
const PANEL_FOOTER_PADDING = 20;
const PANEL_MARGIN = 16;
const PANEL_MAX_VIEWPORT_WIDTH_RATIO = 0.6;
const PANEL_MAX_VIEWPORT_HEIGHT_RATIO = 0.72;
const SLIDER_ROW_HEIGHT = 40;
const SLIDER_LABEL_Y_OFFSET = 8;
const SLIDER_TRACK_X = 20;
const SLIDER_TRACK_WIDTH = PANEL_WIDTH - 40;
const SLIDER_TRACK_HEIGHT = 10;
const SLIDER_INTERACTION_HEIGHT = 24;
const TOGGLE_BUTTON_WIDTH = 92;
const TOGGLE_BUTTON_HEIGHT = 32;
const TOGGLE_BUTTON_MARGIN_RIGHT = 18;
const TOGGLE_BUTTON_TOP = 16;
const HIDDEN_PANEL_WIDTH = 132;
const HIDDEN_PANEL_HEIGHT = 48;
const HIDDEN_BUTTON_PADDING = 8;

export class DebugManager {
    private readonly inputElement: HTMLElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly isEnabled = GameConfig.debugMode;
    private readonly overlayScene = new THREE.Scene();
    private readonly overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 10);
    private readonly overlayCanvas: HTMLCanvasElement;
    private readonly overlayContext: CanvasRenderingContext2D | null;
    private readonly overlayTexture: THREE.CanvasTexture | null;
    private readonly overlayPanel:
        | THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
        | null;

    private activeSlider:
        | { domain: 'post'; key: PostProcessingSettingKey }
        | { domain: 'light'; key: LightSettingKey }
        | null = null;
    private fpsFrameCount = 0;
    private fpsElapsedTime = 0;
    private displayedFps = GameConfig.Fps;
    private isWindowVisible = true;
    private panelScreenX = 0;
    private panelScreenY = 0;
    private panelScreenWidth = 0;
    private panelScreenHeight = 0;

    constructor(
        inputElement: HTMLElement,
        renderer: THREE.WebGLRenderer,
        lightingManager: LightingManager,
        postProcessingManager: PostProcessingManager,
    ) {
        this.inputElement = inputElement;
        this.renderer = renderer;
        this.lightingManager = lightingManager;
        this.postProcessingManager = postProcessingManager;
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.width = this.getCurrentPanelWidth();
        this.overlayCanvas.height = this.getCurrentPanelHeight();
        this.overlayContext = this.overlayCanvas.getContext('2d');
        this.overlayCamera.position.z = 1;

        if (this.overlayContext) {
            this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas);
            this.overlayTexture.colorSpace = THREE.SRGBColorSpace;

            const overlayMaterial = new THREE.MeshBasicMaterial({
                map: this.overlayTexture,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            overlayMaterial.toneMapped = false;

            this.overlayPanel = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                overlayMaterial,
            );
            this.overlayPanel.renderOrder = 999;
            this.overlayScene.add(this.overlayPanel);
        } else {
            this.overlayTexture = null;
            this.overlayPanel = null;
        }
    }

    initialize() {
        if (!this.isEnabled) {
            return;
        }

        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.drawOverlay();

        this.inputElement.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('blur', this.handleWindowBlur);
    }

    update(deltaSeconds: number) {
        if (!this.isEnabled) {
            return;
        }

        this.updateFpsCounter(deltaSeconds);
    }

    render() {
        if (!this.isEnabled || !this.overlayPanel) {
            return;
        }

        const previousAutoClear = this.renderer.autoClear;

        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.overlayScene, this.overlayCamera);
        this.renderer.autoClear = previousAutoClear;
    }

    dispose() {
        if (!this.isEnabled) {
            return;
        }

        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('blur', this.handleWindowBlur);

        if (this.overlayPanel) {
            this.overlayPanel.geometry.dispose();
            this.overlayPanel.material.dispose();
            this.overlayScene.remove(this.overlayPanel);
        }

        this.overlayTexture?.dispose();
    }

    updateViewport(width: number, height: number) {
        if (!this.isEnabled || !this.overlayPanel) {
            return;
        }

        const currentPanelWidth = this.getCurrentPanelWidth();
        const currentPanelHeight = this.getCurrentPanelHeight();
        const panelScale = Math.min(
            (width * PANEL_MAX_VIEWPORT_WIDTH_RATIO) / currentPanelWidth,
            (height * PANEL_MAX_VIEWPORT_HEIGHT_RATIO) / currentPanelHeight,
            1,
        );
        const panelDisplayWidth = currentPanelWidth * panelScale;
        const panelDisplayHeight = currentPanelHeight * panelScale;

        this.overlayCamera.left = -width * 0.5;
        this.overlayCamera.right = width * 0.5;
        this.overlayCamera.top = height * 0.5;
        this.overlayCamera.bottom = -height * 0.5;
        this.overlayCamera.updateProjectionMatrix();

        this.panelScreenWidth = panelDisplayWidth;
        this.panelScreenHeight = panelDisplayHeight;
        this.panelScreenX = width - PANEL_MARGIN - panelDisplayWidth;
        this.panelScreenY = PANEL_MARGIN;

        this.overlayPanel.scale.set(panelDisplayWidth, panelDisplayHeight, 1);
        this.overlayPanel.position.set(
            width * 0.5 - PANEL_MARGIN - panelDisplayWidth * 0.5,
            height * 0.5 - PANEL_MARGIN - panelDisplayHeight * 0.5,
            0,
        );
    }

    private updateFpsCounter(deltaSeconds: number) {
        if (!this.overlayTexture || !this.overlayContext) {
            return;
        }

        this.fpsFrameCount += 1;
        this.fpsElapsedTime += deltaSeconds;

        if (this.fpsElapsedTime < FPS_SAMPLE_WINDOW) {
            return;
        }

        this.displayedFps = this.fpsFrameCount / this.fpsElapsedTime;
        this.fpsFrameCount = 0;
        this.fpsElapsedTime = 0;
        this.drawOverlay();
    }

    private drawOverlay() {
        if (!this.overlayContext || !this.overlayTexture) {
            return;
        }

        const panelWidth = this.getCurrentPanelWidth();
        const panelHeight = this.getCurrentPanelHeight();

        this.syncCanvasSize();
        this.overlayContext.clearRect(0, 0, panelWidth, panelHeight);
        this.overlayContext.fillStyle = this.isWindowVisible
            ? 'rgba(8, 8, 12, 0.88)'
            : 'rgba(8, 8, 12, 0.76)';
        this.overlayContext.fillRect(0, 0, panelWidth, panelHeight);
        this.overlayContext.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        this.overlayContext.lineWidth = 2;
        this.overlayContext.strokeRect(1, 1, panelWidth - 2, panelHeight - 2);

        if (!this.isWindowVisible) {
            this.drawToggleButton();
            this.overlayTexture.needsUpdate = true;

            return;
        }

        this.overlayContext.textBaseline = 'middle';
        this.overlayContext.textAlign = 'left';
        this.overlayContext.fillStyle = '#8ef5a4';
        this.overlayContext.font = '700 28px monospace';
        this.overlayContext.fillText(`FPS ${Math.round(this.displayedFps)}`, 20, 28);

        this.overlayContext.textAlign = 'right';
        this.overlayContext.fillStyle = '#ffffff';
        this.overlayContext.font = '16px monospace';
        this.overlayContext.fillText(`Cap ${GameConfig.Fps}`, panelWidth - 18, 30);

        this.overlayContext.textAlign = 'left';
        this.overlayContext.fillStyle = '#c8d0ff';
        this.overlayContext.font = '15px monospace';
        this.overlayContext.fillText('Debug Controls', 20, 64);
        this.overlayContext.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.overlayContext.fillText('Post FX and lighting controls', 20, 84);

        this.drawToggleButton();

        this.drawSectionTitle(
            'Post Processing',
            this.getPostControlsStartY() - SECTION_TITLE_HEIGHT + SECTION_TITLE_BASELINE_OFFSET,
        );

        for (let index = 0; index < POST_PROCESSING_CONTROLS.length; index += 1) {
            this.drawPostSlider(index);
        }

        this.drawSectionTitle(
            'Lighting',
            this.getLightSectionStartY() - SECTION_TITLE_HEIGHT + SECTION_TITLE_BASELINE_OFFSET,
        );

        for (let index = 0; index < LIGHT_CONTROLS.length; index += 1) {
            this.drawLightSlider(index);
        }

        this.overlayTexture.needsUpdate = true;
    }

    private drawSectionTitle(label: string, baselineY: number) {
        if (!this.overlayContext) {
            return;
        }

        this.overlayContext.textAlign = 'left';
        this.overlayContext.fillStyle = '#c8d0ff';
        this.overlayContext.font = '15px monospace';
        this.overlayContext.fillText(label, 20, baselineY);
    }

    private drawPostSlider(index: number) {
        const control = POST_PROCESSING_CONTROLS[index];
        const controlValue = this.postProcessingManager.getValue(control.key);
        const rowTop = this.getPostControlsStartY() + index * SLIDER_ROW_HEIGHT;

        this.drawSliderRow(control, controlValue, rowTop);
    }

    private drawLightSlider(index: number) {
        const control = LIGHT_CONTROLS[index];
        const controlValue = this.lightingManager.getValue(control.key);
        const rowTop = this.getLightSectionStartY() + index * SLIDER_ROW_HEIGHT;

        this.drawSliderRow(control, controlValue, rowTop);
    }

    private drawSliderRow(
        control: {
            readonly label: string;
            readonly min: number;
            readonly max: number;
            readonly precision: number;
        },
        controlValue: number,
        rowTop: number,
    ) {
        if (!this.overlayContext) {
            return;
        }

        const sliderProgress =
            (controlValue - control.min) / Math.max(control.max - control.min, Number.EPSILON);
        const trackTop = rowTop + 18;
        const knobCenterX = SLIDER_TRACK_X + SLIDER_TRACK_WIDTH * sliderProgress;
        const knobCenterY = trackTop + SLIDER_TRACK_HEIGHT * 0.5;

        this.overlayContext.textAlign = 'left';
        this.overlayContext.fillStyle = '#ffffff';
        this.overlayContext.font = '15px monospace';
        this.overlayContext.fillText(control.label, SLIDER_TRACK_X, rowTop + SLIDER_LABEL_Y_OFFSET);

        this.overlayContext.textAlign = 'right';
        this.overlayContext.fillStyle = '#c8d0ff';
        this.overlayContext.fillText(
            controlValue.toFixed(control.precision),
            PANEL_WIDTH - 18,
            rowTop + SLIDER_LABEL_Y_OFFSET,
        );

        this.overlayContext.fillStyle = 'rgba(255, 255, 255, 0.12)';
        this.overlayContext.fillRect(
            SLIDER_TRACK_X,
            trackTop,
            SLIDER_TRACK_WIDTH,
            SLIDER_TRACK_HEIGHT,
        );

        this.overlayContext.fillStyle = '#8ef5a4';
        this.overlayContext.fillRect(
            SLIDER_TRACK_X,
            trackTop,
            SLIDER_TRACK_WIDTH * sliderProgress,
            SLIDER_TRACK_HEIGHT,
        );

        this.overlayContext.fillStyle = '#ffffff';
        this.overlayContext.beginPath();
        this.overlayContext.arc(knobCenterX, knobCenterY, 7, 0, Math.PI * 2);
        this.overlayContext.fill();
    }

    private drawToggleButton() {
        if (!this.overlayContext) {
            return;
        }

        const toggleButtonRect = this.getLocalToggleButtonRect();

        if (!toggleButtonRect) {
            return;
        }

        this.overlayContext.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.overlayContext.fillRect(
            toggleButtonRect.left,
            toggleButtonRect.top,
            toggleButtonRect.width,
            toggleButtonRect.height,
        );
        this.overlayContext.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        this.overlayContext.lineWidth = 1;
        this.overlayContext.strokeRect(
            toggleButtonRect.left,
            toggleButtonRect.top,
            toggleButtonRect.width,
            toggleButtonRect.height,
        );

        this.overlayContext.textAlign = 'center';
        this.overlayContext.fillStyle = '#ffffff';
        this.overlayContext.font = '14px monospace';
        this.overlayContext.fillText(
            this.isWindowVisible ? 'Close Debug' : 'Open Debug',
            toggleButtonRect.left + toggleButtonRect.width * 0.5,
            toggleButtonRect.top + toggleButtonRect.height * 0.5,
        );
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
            return;
        }

        if (this.tryToggleOverlay(event)) {
            return;
        }

        if (!this.isWindowVisible) {
            return;
        }

        if (this.tryStartSliderDrag(event)) {
            return;
        }
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (this.activeSlider) {
            this.updateActiveSlider(event.clientX);
        }
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (event.button === 0) {
            this.activeSlider = null;
        }
    };

    private readonly handleWindowBlur = () => {
        this.activeSlider = null;
    };

    private tryStartSliderDrag(event: PointerEvent) {
        if (!this.isEnabled) {
            return false;
        }

        for (let index = 0; index < POST_PROCESSING_CONTROLS.length; index += 1) {
            const sliderRect = this.getPostSliderScreenRect(index);

            if (!sliderRect) {
                continue;
            }

            const isInsideSlider =
                event.clientX >= sliderRect.left &&
                event.clientX <= sliderRect.left + sliderRect.width &&
                event.clientY >= sliderRect.top &&
                event.clientY <= sliderRect.top + sliderRect.height;

            if (!isInsideSlider) {
                continue;
            }

            event.preventDefault();
            this.activeSlider = {
                domain: 'post',
                key: POST_PROCESSING_CONTROLS[index].key,
            };
            this.updateActiveSlider(event.clientX);

            return true;
        }

        for (let index = 0; index < LIGHT_CONTROLS.length; index += 1) {
            const sliderRect = this.getLightSliderScreenRect(index);

            if (!sliderRect) {
                continue;
            }

            const isInsideSlider =
                event.clientX >= sliderRect.left &&
                event.clientX <= sliderRect.left + sliderRect.width &&
                event.clientY >= sliderRect.top &&
                event.clientY <= sliderRect.top + sliderRect.height;

            if (!isInsideSlider) {
                continue;
            }

            event.preventDefault();
            this.activeSlider = {
                domain: 'light',
                key: LIGHT_CONTROLS[index].key,
            };
            this.updateActiveSlider(event.clientX);

            return true;
        }

        return false;
    }

    private tryToggleOverlay(event: PointerEvent) {
        const toggleButtonRect = this.getToggleButtonScreenRect();

        if (!toggleButtonRect) {
            return false;
        }

        const isInsideButton =
            event.clientX >= toggleButtonRect.left &&
            event.clientX <= toggleButtonRect.left + toggleButtonRect.width &&
            event.clientY >= toggleButtonRect.top &&
            event.clientY <= toggleButtonRect.top + toggleButtonRect.height;

        if (!isInsideButton) {
            return false;
        }

        event.preventDefault();
        this.activeSlider = null;
        this.isWindowVisible = !this.isWindowVisible;
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.drawOverlay();

        return true;
    }

    private updateActiveSlider(pointerX: number) {
        if (!this.activeSlider) {
            return;
        }

        const controlDefinition =
            this.activeSlider.domain === 'post'
                ? this.postProcessingManager.getControlDefinition(this.activeSlider.key)
                : this.lightingManager.getControlDefinition(this.activeSlider.key);

        if (!controlDefinition) {
            return;
        }

        const controlIndex =
            this.activeSlider.domain === 'post'
                ? POST_PROCESSING_CONTROLS.findIndex(
                      (control) => control.key === this.activeSlider?.key,
                  )
                : LIGHT_CONTROLS.findIndex((control) => control.key === this.activeSlider?.key);
        const sliderRect =
            this.activeSlider.domain === 'post'
                ? this.getPostSliderScreenRect(controlIndex)
                : this.getLightSliderScreenRect(controlIndex);

        if (!sliderRect) {
            return;
        }

        const normalizedValue = THREE.MathUtils.clamp(
            (pointerX - sliderRect.left) / sliderRect.width,
            0,
            1,
        );
        const sliderValue = THREE.MathUtils.lerp(
            controlDefinition.min,
            controlDefinition.max,
            normalizedValue,
        );

        if (this.activeSlider.domain === 'post') {
            this.postProcessingManager.setValue(this.activeSlider.key, sliderValue);
        } else {
            this.lightingManager.setValue(this.activeSlider.key, sliderValue);
        }

        this.drawOverlay();
    }

    private getPostSliderScreenRect(index: number) {
        return this.getSliderScreenRect(index, this.getPostControlsStartY());
    }

    private getLightSliderScreenRect(index: number) {
        return this.getSliderScreenRect(index, this.getLightSectionStartY());
    }

    private getSliderScreenRect(index: number, sectionStartY: number) {
        if (index < 0 || this.panelScreenWidth <= 0 || this.panelScreenHeight <= 0) {
            return null;
        }

        const scaleX = this.panelScreenWidth / PANEL_WIDTH;
        const scaleY = this.panelScreenHeight / this.getCurrentPanelHeight();
        const rowTop = sectionStartY + index * SLIDER_ROW_HEIGHT;
        const trackTop = rowTop + 18;

        return {
            left: this.panelScreenX + SLIDER_TRACK_X * scaleX,
            top:
                this.panelScreenY +
                (trackTop - (SLIDER_INTERACTION_HEIGHT - SLIDER_TRACK_HEIGHT) * 0.5) * scaleY,
            width: SLIDER_TRACK_WIDTH * scaleX,
            height: SLIDER_INTERACTION_HEIGHT * scaleY,
        };
    }

    private getPostControlsStartY() {
        return PANEL_HEADER_HEIGHT + SECTION_TITLE_HEIGHT;
    }

    private getLightSectionStartY() {
        return (
            PANEL_HEADER_HEIGHT +
            SECTION_TITLE_HEIGHT +
            POST_PROCESSING_CONTROLS.length * SLIDER_ROW_HEIGHT +
            SECTION_GAP +
            SECTION_TITLE_HEIGHT
        );
    }

    private getExpandedPanelHeight() {
        return (
            this.getLightSectionStartY() +
            LIGHT_CONTROLS.length * SLIDER_ROW_HEIGHT +
            PANEL_FOOTER_PADDING
        );
    }

    private getCurrentPanelHeight() {
        return this.isWindowVisible ? this.getExpandedPanelHeight() : HIDDEN_PANEL_HEIGHT;
    }

    private getToggleButtonScreenRect() {
        if (this.panelScreenWidth <= 0 || this.panelScreenHeight <= 0) {
            return null;
        }

        const toggleButtonRect = this.getLocalToggleButtonRect();

        if (!toggleButtonRect) {
            return null;
        }

        const scaleX = this.panelScreenWidth / this.getCurrentPanelWidth();
        const scaleY = this.panelScreenHeight / this.getCurrentPanelHeight();

        return {
            left: this.panelScreenX + toggleButtonRect.left * scaleX,
            top: this.panelScreenY + toggleButtonRect.top * scaleY,
            width: toggleButtonRect.width * scaleX,
            height: toggleButtonRect.height * scaleY,
        };
    }

    private syncCanvasSize() {
        const currentPanelWidth = this.getCurrentPanelWidth();
        const currentPanelHeight = this.getCurrentPanelHeight();

        if (
            this.overlayCanvas.width === currentPanelWidth &&
            this.overlayCanvas.height === currentPanelHeight
        ) {
            return;
        }

        this.overlayCanvas.width = currentPanelWidth;
        this.overlayCanvas.height = currentPanelHeight;
    }

    private getCurrentPanelWidth() {
        return this.isWindowVisible ? PANEL_WIDTH : HIDDEN_PANEL_WIDTH;
    }

    private getLocalToggleButtonRect() {
        if (this.isWindowVisible) {
            return {
                left: PANEL_WIDTH - TOGGLE_BUTTON_MARGIN_RIGHT - TOGGLE_BUTTON_WIDTH,
                top: TOGGLE_BUTTON_TOP,
                width: TOGGLE_BUTTON_WIDTH,
                height: TOGGLE_BUTTON_HEIGHT,
            };
        }

        return {
            left: HIDDEN_BUTTON_PADDING,
            top: HIDDEN_BUTTON_PADDING,
            width: HIDDEN_PANEL_WIDTH - HIDDEN_BUTTON_PADDING * 2,
            height: HIDDEN_PANEL_HEIGHT - HIDDEN_BUTTON_PADDING * 2,
        };
    }
}
