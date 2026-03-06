import type { Graphics, Sprite, Text } from 'pixi.js';

export const PlantId = {
    corn: 'corn',
    grape: 'grape',
    strawberry: 'strawberry',
} as const;
export type PlantId = (typeof PlantId)[keyof typeof PlantId];

export function isPlantId(value: unknown): value is PlantId {
    return (
        value === PlantId.corn ||
        value === PlantId.grape ||
        value === PlantId.strawberry
    );
}

export interface PlantOptionDefinition {
    readonly id: PlantId;
    readonly texturePath: string;
}

export interface PlaceVegetableButtonState {
    readonly id: PlantId;
    readonly container: Graphics;
    readonly icon: Sprite;
    readonly selection: Graphics;
    readonly hitArea: { x: number; y: number; width: number; height: number };
    selectionBlend: number;
    pulseTime: number;
}

export interface PlanButtonState {
    readonly container: Graphics;
    readonly label: Text;
    readonly hitArea: { x: number; y: number; width: number; height: number };
    pulseTime: number;
}
