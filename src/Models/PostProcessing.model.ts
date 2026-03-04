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
