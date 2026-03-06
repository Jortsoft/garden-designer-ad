import * as THREE from 'three';
import {
    Container,
    Graphics,
    Text,
    type TextStyleOptions,
} from 'pixi.js';
import type {
    DebugActiveSlider,
    DebugMetric,
    DebugPanelRect,
    DebugPerformanceStats,
} from '../Models/DebugManager.model';
import { PixiUI } from '../Systems/PixiUI';
import { GameConfig } from './GameConfig';
import { LIGHT_CONTROLS, LightingManager } from './LightingManager';
import { POST_PROCESSING_CONTROLS, PostProcessingManager } from './PostProcessingManager';

const FPS_SAMPLE_WINDOW = 0.25;
const PANEL_WIDTH = 360;
const PANEL_HEADER_HEIGHT = 204;
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
const STATS_SECTION_TOP = 96;
const STATS_ROW_HEIGHT = 28;
const STATS_COLUMN_COUNT = 3;
const STATS_COLUMN_GAP = 12;
const STATS_LABEL_Y_OFFSET = 4;
const STATS_VALUE_Y_OFFSET = 19;

const STYLE_FPS: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 28,
    fill: '#8ef5a4',
    fontWeight: '700',
};
const STYLE_CAPTION: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 16,
    fill: '#ffffff',
};
const STYLE_SECTION: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: '#c8d0ff',
};
const STYLE_SUBTITLE: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: 'rgba(255, 255, 255, 0.5)',
};
const STYLE_LABEL: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: '#ffffff',
};
const STYLE_VALUE: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: '#c8d0ff',
};
const STYLE_METRIC_LABEL: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 11,
    fill: 'rgba(255, 255, 255, 0.52)',
};
const STYLE_METRIC_VALUE: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: '#ffffff',
};
const STYLE_TOGGLE_BUTTON: Readonly<TextStyleOptions> = {
    fontFamily: 'monospace',
    fontSize: 14,
    fill: '#ffffff',
};

type HorizontalTextAlign = 'left' | 'center' | 'right';

export class DebugManager {
    private readonly inputElement: HTMLElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly lightingManager: LightingManager;
    private readonly postProcessingManager: PostProcessingManager;
    private readonly pixiUI: PixiUI;
    private readonly isEnabled = GameConfig.debugMode;
    private readonly panelRoot = new Container();
    private readonly panelGraphics = new Graphics();
    private readonly textLayer = new Container();
    private readonly textPool: Text[] = [];

    private activeSlider: DebugActiveSlider = null;
    private fpsFrameCount = 0;
    private fpsElapsedTime = 0;
    private displayedFps = GameConfig.Fps;
    private shouldRefreshPerformanceSummary = true;
    private isWindowVisible = true;
    private isInteractionLocked = false;
    private panelScreenX = 0;
    private panelScreenY = 0;
    private panelScreenWidth = 0;
    private panelScreenHeight = 0;
    private textCursor = 0;
    private readonly performanceStats: DebugPerformanceStats = {
        batches: 0,
        geometries: 0,
        lines: 0,
        points: 0,
        programs: 0,
        textures: 0,
        triangles: 0,
        vertices: 0,
    };

    constructor(
        inputElement: HTMLElement,
        renderer: THREE.WebGLRenderer,
        lightingManager: LightingManager,
        postProcessingManager: PostProcessingManager,
        pixiUI: PixiUI,
    ) {
        this.inputElement = inputElement;
        this.renderer = renderer;
        this.lightingManager = lightingManager;
        this.postProcessingManager = postProcessingManager;
        this.pixiUI = pixiUI;

        this.panelRoot.visible = false;
        this.panelRoot.zIndex = 100;
        this.panelGraphics.zIndex = 0;
        this.textLayer.zIndex = 1;
        this.panelRoot.addChild(this.panelGraphics);
        this.panelRoot.addChild(this.textLayer);
    }

    initialize() {
        if (!this.isEnabled) {
            return;
        }

        this.panelRoot.visible = true;
        this.pixiUI.root.addChild(this.panelRoot);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.refreshPerformanceSummary();
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

        if (!this.shouldRefreshPerformanceSummary) {
            return;
        }

        this.refreshPerformanceSummary();
        this.drawOverlay();
        this.shouldRefreshPerformanceSummary = false;
    }

    render() {
        // Rendered by shared PixiUI.
    }

    dispose() {
        if (!this.isEnabled) {
            return;
        }

        this.inputElement.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('blur', this.handleWindowBlur);

        this.pixiUI.root.removeChild(this.panelRoot);
        this.panelRoot.destroy({ children: true });
        this.textPool.length = 0;
    }

    updateViewport(width: number, height: number) {
        if (!this.isEnabled) {
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

        this.panelScreenWidth = panelDisplayWidth;
        this.panelScreenHeight = panelDisplayHeight;
        this.panelScreenX = width - PANEL_MARGIN - panelDisplayWidth;
        this.panelScreenY = PANEL_MARGIN;

        this.panelRoot.position.set(this.panelScreenX, this.panelScreenY);
        this.panelRoot.scale.set(panelScale, panelScale);
        this.drawOverlay();
    }

    setInteractionLocked(isLocked: boolean) {
        this.isInteractionLocked = isLocked;

        if (isLocked) {
            this.activeSlider = null;
        }
    }

    isScreenPointBlocked(screenX: number, screenY: number) {
        if (!this.isEnabled || this.panelScreenWidth <= 0 || this.panelScreenHeight <= 0) {
            return false;
        }

        return (
            screenX >= this.panelScreenX &&
            screenX <= this.panelScreenX + this.panelScreenWidth &&
            screenY >= this.panelScreenY &&
            screenY <= this.panelScreenY + this.panelScreenHeight
        );
    }

    private updateFpsCounter(deltaSeconds: number) {
        this.fpsFrameCount += 1;
        this.fpsElapsedTime += deltaSeconds;

        if (this.fpsElapsedTime < FPS_SAMPLE_WINDOW) {
            return;
        }

        this.displayedFps = this.fpsFrameCount / Math.max(this.fpsElapsedTime, Number.EPSILON);
        this.fpsFrameCount = 0;
        this.fpsElapsedTime = 0;
        this.shouldRefreshPerformanceSummary = true;
    }

    private drawOverlay() {
        const panelWidth = this.getCurrentPanelWidth();
        const panelHeight = this.getCurrentPanelHeight();

        this.panelGraphics.clear();
        this.beginTextLayout();
        this.panelGraphics.rect(0, 0, panelWidth, panelHeight);
        this.panelGraphics.fill({
            color: 0x08080c,
            alpha: this.isWindowVisible ? 0.88 : 0.76,
        });
        this.panelGraphics.rect(1, 1, panelWidth - 2, panelHeight - 2);
        this.panelGraphics.stroke({
            color: 0xffffff,
            alpha: 0.16,
            width: 2,
        });

        if (!this.isWindowVisible) {
            this.drawToggleButton();
            this.endTextLayout();
            return;
        }

        this.placeText(
            `FPS ${Math.round(this.displayedFps)}`,
            20,
            28,
            STYLE_FPS,
            'left',
        );
        this.placeText(`Cap ${GameConfig.Fps}`, panelWidth - 18, 30, STYLE_CAPTION, 'right');
        this.placeText('Debug Controls', 20, 64, STYLE_SECTION, 'left');
        this.placeText(
            'Post FX and lighting controls',
            20,
            84,
            STYLE_SUBTITLE,
            'left',
        );

        this.drawToggleButton();
        this.drawPerformanceSummary();
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

        this.endTextLayout();
    }

    private refreshPerformanceSummary() {
        const renderInfo = this.renderer.info.render;
        const memoryInfo = this.renderer.info.memory;

        this.performanceStats.batches = renderInfo.calls;
        this.performanceStats.geometries = memoryInfo.geometries;
        this.performanceStats.lines = renderInfo.lines;
        this.performanceStats.points = renderInfo.points;
        this.performanceStats.programs = this.renderer.info.programs?.length ?? 0;
        this.performanceStats.textures = memoryInfo.textures;
        this.performanceStats.triangles = renderInfo.triangles;
        this.performanceStats.vertices =
            renderInfo.triangles * 3 + renderInfo.lines * 2 + renderInfo.points;
    }

    private drawPerformanceSummary() {
        const metrics: readonly DebugMetric[] = [
            { label: 'MS', value: this.formatFrameTime(this.getAverageFrameTimeMilliseconds()) },
            { label: 'Batches', value: this.formatCompactNumber(this.performanceStats.batches) },
            { label: 'Verts', value: this.formatCompactNumber(this.performanceStats.vertices) },
            { label: 'Tris', value: this.formatCompactNumber(this.performanceStats.triangles) },
            { label: 'Geom', value: this.formatCompactNumber(this.performanceStats.geometries) },
            { label: 'Tex', value: this.formatCompactNumber(this.performanceStats.textures) },
            { label: 'Lines', value: this.formatCompactNumber(this.performanceStats.lines) },
            { label: 'Points', value: this.formatCompactNumber(this.performanceStats.points) },
            { label: 'Prog', value: this.formatCompactNumber(this.performanceStats.programs) },
        ] as const;
        const contentWidth = PANEL_WIDTH - SLIDER_TRACK_X * 2;
        const columnWidth =
            (contentWidth - STATS_COLUMN_GAP * (STATS_COLUMN_COUNT - 1)) / STATS_COLUMN_COUNT;

        this.drawSectionTitle(
            'Renderer Stats',
            STATS_SECTION_TOP + SECTION_TITLE_BASELINE_OFFSET,
        );

        for (let index = 0; index < metrics.length; index += 1) {
            const columnIndex = index % STATS_COLUMN_COUNT;
            const rowIndex = Math.floor(index / STATS_COLUMN_COUNT);
            const cellLeft = SLIDER_TRACK_X + columnIndex * (columnWidth + STATS_COLUMN_GAP);
            const cellTop = STATS_SECTION_TOP + SECTION_TITLE_HEIGHT + rowIndex * STATS_ROW_HEIGHT;

            this.placeText(
                metrics[index].label,
                cellLeft,
                cellTop + STATS_LABEL_Y_OFFSET,
                STYLE_METRIC_LABEL,
                'left',
            );
            this.placeText(
                metrics[index].value,
                cellLeft,
                cellTop + STATS_VALUE_Y_OFFSET,
                STYLE_METRIC_VALUE,
                'left',
            );
        }
    }

    private drawSectionTitle(label: string, baselineY: number) {
        this.placeText(label, 20, baselineY, STYLE_SECTION, 'left');
    }

    private getAverageFrameTimeMilliseconds() {
        if (this.displayedFps <= Number.EPSILON) {
            return 0;
        }

        return 1000 / this.displayedFps;
    }

    private formatFrameTime(value: number) {
        return value >= 100 ? value.toFixed(0) : value.toFixed(1);
    }

    private formatCompactNumber(value: number) {
        if (value >= 1_000_000) {
            const scaledValue = value / 1_000_000;
            return `${scaledValue >= 10 ? scaledValue.toFixed(0) : scaledValue.toFixed(1)}M`;
        }

        if (value >= 1_000) {
            const scaledValue = value / 1_000;
            return `${scaledValue >= 10 ? scaledValue.toFixed(0) : scaledValue.toFixed(1)}K`;
        }

        return `${Math.round(value)}`;
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
        const sliderProgress =
            (controlValue - control.min) / Math.max(control.max - control.min, Number.EPSILON);
        const clampedProgress = THREE.MathUtils.clamp(sliderProgress, 0, 1);
        const trackTop = rowTop + 18;
        const knobCenterX = SLIDER_TRACK_X + SLIDER_TRACK_WIDTH * clampedProgress;
        const knobCenterY = trackTop + SLIDER_TRACK_HEIGHT * 0.5;

        this.placeText(control.label, SLIDER_TRACK_X, rowTop + SLIDER_LABEL_Y_OFFSET, STYLE_LABEL, 'left');
        this.placeText(
            controlValue.toFixed(control.precision),
            PANEL_WIDTH - 18,
            rowTop + SLIDER_LABEL_Y_OFFSET,
            STYLE_VALUE,
            'right',
        );

        this.panelGraphics.rect(SLIDER_TRACK_X, trackTop, SLIDER_TRACK_WIDTH, SLIDER_TRACK_HEIGHT);
        this.panelGraphics.fill({
            color: 0xffffff,
            alpha: 0.12,
        });

        this.panelGraphics.rect(
            SLIDER_TRACK_X,
            trackTop,
            SLIDER_TRACK_WIDTH * clampedProgress,
            SLIDER_TRACK_HEIGHT,
        );
        this.panelGraphics.fill({
            color: 0x8ef5a4,
            alpha: 1,
        });

        this.panelGraphics.circle(knobCenterX, knobCenterY, 7);
        this.panelGraphics.fill({
            color: 0xffffff,
            alpha: 1,
        });
    }

    private drawToggleButton() {
        const toggleButtonRect = this.getLocalToggleButtonRect();

        this.panelGraphics.rect(
            toggleButtonRect.left,
            toggleButtonRect.top,
            toggleButtonRect.width,
            toggleButtonRect.height,
        );
        this.panelGraphics.fill({
            color: 0xffffff,
            alpha: 0.08,
        });
        this.panelGraphics.rect(
            toggleButtonRect.left,
            toggleButtonRect.top,
            toggleButtonRect.width,
            toggleButtonRect.height,
        );
        this.panelGraphics.stroke({
            color: 0xffffff,
            alpha: 0.18,
            width: 1,
        });

        this.placeText(
            this.isWindowVisible ? 'Close Debug' : 'Open Debug',
            toggleButtonRect.left + toggleButtonRect.width * 0.5,
            toggleButtonRect.top + toggleButtonRect.height * 0.5,
            STYLE_TOGGLE_BUTTON,
            'center',
        );
    }

    private beginTextLayout() {
        this.textCursor = 0;
    }

    private endTextLayout() {
        for (let index = this.textCursor; index < this.textPool.length; index += 1) {
            this.textPool[index].visible = false;
        }
    }

    private placeText(
        textValue: string,
        x: number,
        y: number,
        style: Readonly<TextStyleOptions>,
        align: HorizontalTextAlign,
    ) {
        let textNode = this.textPool[this.textCursor];

        if (!textNode) {
            textNode = new Text({
                text: textValue,
                style,
            });
            textNode.anchor.set(0, 0.5);
            textNode.resolution = Math.min(window.devicePixelRatio || 1, 2);
            this.textPool.push(textNode);
            this.textLayer.addChild(textNode);
        }

        this.textCursor += 1;
        textNode.visible = true;
        textNode.text = textValue;
        textNode.style = style;
        if (align === 'left') {
            textNode.anchor.x = 0;
        } else if (align === 'center') {
            textNode.anchor.x = 0.5;
        } else {
            textNode.anchor.x = 1;
        }

        textNode.position.set(x, y);
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (this.isInteractionLocked) {
            return;
        }

        if (event.button !== 0) {
            return;
        }

        if (this.tryToggleOverlay(event)) {
            return;
        }

        if (!this.isWindowVisible) {
            return;
        }

        this.tryStartSliderDrag(event);
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (this.isInteractionLocked) {
            return;
        }

        if (this.activeSlider) {
            this.updateActiveSlider(event.clientX);
        }
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (this.isInteractionLocked) {
            this.activeSlider = null;
            return;
        }

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

        this.shouldRefreshPerformanceSummary = true;
        this.drawOverlay();
    }

    private getPostSliderScreenRect(index: number) {
        return this.getSliderScreenRect(index, this.getPostControlsStartY());
    }

    private getLightSliderScreenRect(index: number) {
        return this.getSliderScreenRect(index, this.getLightSectionStartY());
    }

    private getSliderScreenRect(index: number, sectionStartY: number): DebugPanelRect | null {
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

    private getToggleButtonScreenRect(): DebugPanelRect | null {
        if (this.panelScreenWidth <= 0 || this.panelScreenHeight <= 0) {
            return null;
        }

        const toggleButtonRect = this.getLocalToggleButtonRect();
        const scaleX = this.panelScreenWidth / this.getCurrentPanelWidth();
        const scaleY = this.panelScreenHeight / this.getCurrentPanelHeight();

        return {
            left: this.panelScreenX + toggleButtonRect.left * scaleX,
            top: this.panelScreenY + toggleButtonRect.top * scaleY,
            width: toggleButtonRect.width * scaleX,
            height: toggleButtonRect.height * scaleY,
        };
    }

    private getCurrentPanelWidth() {
        return this.isWindowVisible ? PANEL_WIDTH : HIDDEN_PANEL_WIDTH;
    }

    private getLocalToggleButtonRect(): DebugPanelRect {
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
