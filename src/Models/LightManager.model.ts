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
