import type { Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { PlantId } from './PlaceVegetable.model';

export const MARKET_SELL_PRICE_PER_UNIT = 5;

export interface MarketRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MarketScreenPoint {
    x: number;
    y: number;
}

export interface MarketResourceDefinition {
    readonly id: PlantId;
    readonly iconPath: string;
    readonly label: string;
}

export interface MarketResourceRowState {
    readonly id: PlantId;
    readonly icon: Sprite;
    readonly nameLabel: Text;
    readonly availableLabel: Text;
    readonly minusButton: Graphics;
    readonly minusLabel: Text;
    readonly plusButton: Graphics;
    readonly plusLabel: Text;
    readonly selectedLabel: Text;
    readonly minusHitArea: MarketRect;
    readonly plusHitArea: MarketRect;
    iconTexture: Texture | null;
    availableCount: number;
    selectedCount: number;
}

export type MarketResourceCounts = Record<PlantId, number>;
