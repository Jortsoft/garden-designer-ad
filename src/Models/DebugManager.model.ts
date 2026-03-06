import type { LightSettingKey } from './LightManager.model';
import type { PostProcessingSettingKey } from './PostProcessing.model';

export interface DebugPanelRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface DebugPerformanceStats {
    batches: number;
    geometries: number;
    lines: number;
    points: number;
    programs: number;
    textures: number;
    triangles: number;
    vertices: number;
}

export interface DebugMetric {
    label: string;
    value: string;
}

export type DebugActiveSlider =
    | { domain: 'post'; key: PostProcessingSettingKey }
    | { domain: 'light'; key: LightSettingKey }
    | null;
