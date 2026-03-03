import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type PostProcessingSettingKey =
    | 'exposure'
    | 'brightness'
    | 'contrast'
    | 'saturation'
    | 'temperature'
    | 'tint'
    | 'vignetteIntensity'
    | 'vignetteSmoothness'
    | 'bloomStrength'
    | 'bloomRadius'
    | 'bloomThreshold';

export interface PostProcessingControlDefinition {
    readonly key: PostProcessingSettingKey;
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly precision: number;
}

export interface PostProcessingSettings {
    exposure: number;
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    vignetteIntensity: number;
    vignetteSmoothness: number;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
}

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
    exposure: 1,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    vignetteIntensity: 0,
    vignetteSmoothness: 0.55,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
};

const CONTROL_LOOKUP = new Map(
    POST_PROCESSING_CONTROLS.map((control) => [control.key, control]),
);

const COLOR_GRADING_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        exposure: { value: DEFAULT_SETTINGS.exposure },
        brightness: { value: DEFAULT_SETTINGS.brightness },
        contrast: { value: DEFAULT_SETTINGS.contrast },
        saturation: { value: DEFAULT_SETTINGS.saturation },
        temperature: { value: DEFAULT_SETTINGS.temperature },
        tint: { value: DEFAULT_SETTINGS.tint },
        vignetteIntensity: { value: DEFAULT_SETTINGS.vignetteIntensity },
        vignetteSmoothness: { value: DEFAULT_SETTINGS.vignetteSmoothness },
    },
    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        uniform float temperature;
        uniform float tint;
        uniform float vignetteIntensity;
        uniform float vignetteSmoothness;

        varying vec2 vUv;

        void main() {
            vec4 source = texture2D(tDiffuse, vUv);
            vec3 color = source.rgb * exposure;

            color += brightness;
            color.r += temperature * 0.12;
            color.b -= temperature * 0.12;
            color.g += tint * 0.08;

            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luminance), color, saturation);
            color = (color - 0.5) * contrast + 0.5;

            float distanceToCenter = distance(vUv, vec2(0.5)) * 1.41421356;
            float vignetteMask = smoothstep(1.0 - vignetteSmoothness, 1.0, distanceToCenter);
            color *= 1.0 - vignetteMask * vignetteIntensity;

            gl_FragColor = vec4(max(color, 0.0), source.a);
        }
    `,
};

export class PostProcessingManager {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly composer: EffectComposer;
    private readonly bloomPass: UnrealBloomPass;
    private readonly colorPass: ShaderPass;
    private readonly settings: PostProcessingSettings = { ...DEFAULT_SETTINGS };

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
    ) {
        this.renderer = renderer;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.settings.bloomStrength,
            this.settings.bloomRadius,
            this.settings.bloomThreshold,
        );
        this.composer.addPass(this.bloomPass);

        this.colorPass = new ShaderPass(COLOR_GRADING_SHADER);
        this.composer.addPass(this.colorPass);

        this.composer.addPass(new OutputPass());

        this.applyAllSettings();
    }

    render() {
        this.composer.render();
    }

    setSize(width: number, height: number) {
        this.composer.setSize(width, height);
        this.bloomPass.setSize(width, height);
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
                this.bloomPass.strength = value;
                break;
            case 'bloomRadius':
                this.bloomPass.radius = value;
                break;
            case 'bloomThreshold':
                this.bloomPass.threshold = value;
                break;
        }
    }
}
