import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type {
    PostProcessingControlDefinition,
    PostProcessingSettingKey,
    PostProcessingSettings,
} from '../Models/PostProcessing.model';
import { GameConfig } from './GameConfig';
import { POST_PROCESSING_SHADER } from '../Shaders/PostProcessing.shader';
import { hasCoarsePointerDevice } from '../Utils/hasCoarsePointerDevice';


export const POST_PROCESSING_CONTROLS: readonly PostProcessingControlDefinition[] = [
    { key: 'exposure', label: 'Exposure', min: 0.6, max: 2.2, precision: 2 },
    { key: 'brightness', label: 'Brightness', min: -0.3, max: 0.3, precision: 2 },
    { key: 'contrast', label: 'Contrast', min: 0.6, max: 1.8, precision: 2 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 2, precision: 2 },
    { key: 'temperature', label: 'Temperature', min: -1, max: 1, precision: 2 },
    { key: 'tint', label: 'Tint', min: -1, max: 1, precision: 2 },
    { key: 'vignetteIntensity', label: 'Vignette', min: 0, max: 1, precision: 2 },
    { key: 'vignetteSmoothness', label: 'Vignette Soft', min: 0.05, max: 1, precision: 2 },
    { key: 'bloomStrength', label: 'Bloom', min: 0, max: 2.5, precision: 2 },
    { key: 'bloomRadius', label: 'Bloom Radius', min: 0, max: 1, precision: 2 },
    { key: 'bloomThreshold', label: 'Bloom Threshold', min: 0, max: 1, precision: 2 },
] as const;

const DEFAULT_SETTINGS: PostProcessingSettings = {
    exposure: GameConfig.postProcessingData.exposure,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    vignetteIntensity: GameConfig.postProcessingData.vignette,
    vignetteSmoothness: GameConfig.postProcessingData.vignetteSoft,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
};

const CONTROL_LOOKUP = new Map(
    POST_PROCESSING_CONTROLS.map((control) => [control.key, control]),
);

export class PostProcessingManager {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly composer: EffectComposer;
    private readonly bloomPass: UnrealBloomPass | null;
    private readonly colorPass: ShaderPass;
    private readonly outputPass: OutputPass;
    private readonly settings: PostProcessingSettings = { ...DEFAULT_SETTINGS };

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
    ) {
        this.renderer = renderer;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = GameConfig.postProcessingData.exposure;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        if (this.shouldUseBloomPass()) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                this.settings.bloomStrength,
                this.settings.bloomRadius,
                this.settings.bloomThreshold,
            );
            this.composer.addPass(this.bloomPass);
        } else {
            this.bloomPass = null;
        }

        this.colorPass = new ShaderPass(POST_PROCESSING_SHADER);
        this.composer.addPass(this.colorPass);

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        this.applyAllSettings();
    }

    render() {
        this.composer.render();
    }

    setSize(width: number, height: number) {
        this.composer.setSize(width, height);
        this.bloomPass?.setSize(width, height);
    }

    dispose() {
        this.bloomPass?.dispose();
        this.colorPass.dispose();
        this.outputPass.dispose();
        this.composer.dispose();
    }

    getValue(key: PostProcessingSettingKey) {
        return this.settings[key];
    }

    getControlDefinition(key: PostProcessingSettingKey) {
        return CONTROL_LOOKUP.get(key) ?? null;
    }

    setValue(key: PostProcessingSettingKey, nextValue: number) {
        const controlDefinition = this.getControlDefinition(key);

        if (!controlDefinition) {
            return;
        }

        const clampedValue = THREE.MathUtils.clamp(
            nextValue,
            controlDefinition.min,
            controlDefinition.max,
        );

        this.settings[key] = clampedValue;
        this.applySetting(key, clampedValue);
    }

    private applyAllSettings() {
        for (const control of POST_PROCESSING_CONTROLS) {
            this.applySetting(control.key, this.settings[control.key]);
        }
    }

    private applySetting(key: PostProcessingSettingKey, value: number) {
        switch (key) {
            case 'exposure':
                this.colorPass.uniforms.exposure.value = value;
                break;
            case 'brightness':
            case 'contrast':
            case 'saturation':
            case 'temperature':
            case 'tint':
            case 'vignetteIntensity':
            case 'vignetteSmoothness':
                this.colorPass.uniforms[key].value = value;
                break;
            case 'bloomStrength':
                if (this.bloomPass) {
                    this.bloomPass.strength = value;
                }
                break;
            case 'bloomRadius':
                if (this.bloomPass) {
                    this.bloomPass.radius = value;
                }
                break;
            case 'bloomThreshold':
                if (this.bloomPass) {
                    this.bloomPass.threshold = value;
                }
                break;
        }
    }

    private shouldUseBloomPass() {
        return !hasCoarsePointerDevice();
    }
}
