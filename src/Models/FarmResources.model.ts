import type { Sprite, Text, Texture } from 'pixi.js';
import type { PlantId } from './PlaceVegetable.model';

export interface ResourceDefinition {
    readonly id: PlantId;
    readonly iconPath: string;
}

export interface ResourceEntry {
    readonly id: PlantId;
    readonly icon: Sprite;
    readonly countLabel: Text;
    iconTexture: Texture | null;
    count: number;
}

export interface ResourceGainBatch {
    readonly plantId: PlantId;
    pendingIcons: number;
    resolve: () => void;
}

export interface FlyingResourceIcon {
    readonly plantId: PlantId;
    readonly icon: Sprite;
    readonly startX: number;
    readonly startY: number;
    readonly controlX: number;
    readonly controlY: number;
    readonly endX: number;
    readonly endY: number;
    readonly duration: number;
    readonly delay: number;
    readonly baseSize: number;
    readonly batch: ResourceGainBatch;
    elapsed: number;
    isRewardApplied: boolean;
}
