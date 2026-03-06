import type { PlantId } from './PlaceVegetable.model';

export const VEGETABLE_GROWTH_LEVELS = [1, 2, 3] as const;
export type VegetableGrowthLevel = (typeof VEGETABLE_GROWTH_LEVELS)[number];

export interface Vector3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface VegetableOptions {
    readonly plantId: PlantId;
    readonly modelPathsByLevel: Record<VegetableGrowthLevel, string>;
    readonly maxTextureAnisotropy: number;
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly slotOffsets?: readonly Vector3Like[];
    readonly initialGrowthLevel?: VegetableGrowthLevel;
    readonly isVisibleInitially?: boolean;
}
