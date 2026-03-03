import * as THREE from 'three';

export type LightSettingKey =
    | 'ambientIntensity'
    | 'sunIntensity'
    | 'sunX'
    | 'sunY'
    | 'sunZ';

export interface LightControlDefinition {
    readonly key: LightSettingKey;
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly precision: number;
}

export const LIGHT_CONTROLS: readonly LightControlDefinition[] = [
    { key: 'ambientIntensity', label: 'Ambient', min: 0, max: 3, precision: 2 },
    { key: 'sunIntensity', label: 'Sun Intensity', min: 0, max: 4, precision: 2 },
    { key: 'sunX', label: 'Sun X', min: -10, max: 10, precision: 2 },
    { key: 'sunY', label: 'Sun Y', min: 0, max: 12, precision: 2 },
    { key: 'sunZ', label: 'Sun Z', min: -10, max: 10, precision: 2 },
] as const;

const DEFAULT_LIGHT_VALUES = {
    ambientIntensity: 0.7,
    sunIntensity: 1.6,
    sunX: 4,
    sunY: 6,
    sunZ: 5,
} as const;

const CONTROL_LOOKUP = new Map(
    LIGHT_CONTROLS.map((control) => [control.key, control]),
);

export class LightingManager {
    private readonly scene: THREE.Scene;
    private readonly ambientLight = new THREE.AmbientLight('#ffffff', DEFAULT_LIGHT_VALUES.ambientIntensity);
    private readonly directionalLight = new THREE.DirectionalLight(
        '#ffffff',
        DEFAULT_LIGHT_VALUES.sunIntensity,
    );

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.directionalLight.castShadow = true;
        this.syncDirectionalPosition();
    }

    initialize() {
        this.scene.add(this.ambientLight);
        this.scene.add(this.directionalLight);
    }

    getValue(key: LightSettingKey) {
        switch (key) {
            case 'ambientIntensity':
                return this.ambientLight.intensity;
            case 'sunIntensity':
                return this.directionalLight.intensity;
            case 'sunX':
                return this.directionalLight.position.x;
            case 'sunY':
                return this.directionalLight.position.y;
            case 'sunZ':
                return this.directionalLight.position.z;
        }
    }

    getControlDefinition(key: LightSettingKey) {
        return CONTROL_LOOKUP.get(key) ?? null;
    }

    setValue(key: LightSettingKey, nextValue: number) {
        const controlDefinition = this.getControlDefinition(key);

        if (!controlDefinition) {
            return;
        }

        const clampedValue = THREE.MathUtils.clamp(
            nextValue,
            controlDefinition.min,
            controlDefinition.max,
        );

        switch (key) {
            case 'ambientIntensity':
                this.ambientLight.intensity = clampedValue;
                break;
            case 'sunIntensity':
                this.directionalLight.intensity = clampedValue;
                break;
            case 'sunX':
                this.directionalLight.position.x = clampedValue;
                break;
            case 'sunY':
                this.directionalLight.position.y = clampedValue;
                break;
            case 'sunZ':
                this.directionalLight.position.z = clampedValue;
                break;
        }
    }

    private syncDirectionalPosition() {
        this.directionalLight.position.set(
            DEFAULT_LIGHT_VALUES.sunX,
            DEFAULT_LIGHT_VALUES.sunY,
            DEFAULT_LIGHT_VALUES.sunZ,
        );
    }
}
