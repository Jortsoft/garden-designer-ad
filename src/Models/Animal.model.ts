import type { Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Vector3Like } from './Vegetable.model';

export const AnimalId = {
    chicken: 'chicken',
    cow: 'cow',
} as const;
export type AnimalId = (typeof AnimalId)[keyof typeof AnimalId];

export const ANIMAL_MODEL_PATHS: Record<AnimalId, string> = {
    [AnimalId.chicken]: 'assets/gltf/animals/chicken.glb',
    [AnimalId.cow]: 'assets/gltf/animals/cow.glb',
} as const;

export const ANIMAL_PRICES: Record<AnimalId, number> = {
    [AnimalId.chicken]: 5,
    [AnimalId.cow]: 10,
} as const;

export const getAnimalPrice = (animalId: AnimalId) => ANIMAL_PRICES[animalId];

export interface AnimalOptionDefinition {
    readonly id: AnimalId;
    readonly label: string;
    readonly iconPath: string;
    readonly price: number;
}

export interface AnimalShopRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AnimalShopOptionState {
    readonly id: AnimalId;
    readonly price: number;
    readonly container: Graphics;
    readonly icon: Sprite;
    readonly label: Text;
    readonly hitArea: AnimalShopRect;
    iconTexture: Texture | null;
}

export interface AnimalHomeOptions {
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly isVisibleInitially?: boolean;
}

export interface AnimalOptions {
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly isVisibleInitially?: boolean;
    readonly initialAnimalId?: AnimalId;
}
