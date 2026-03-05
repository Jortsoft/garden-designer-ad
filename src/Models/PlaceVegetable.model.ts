import type * as THREE from 'three';

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

export interface PlantButton {
    readonly id: PlantId;
    readonly hitMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly iconMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly selectionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    iconTexture: THREE.Texture | null;
    baseButtonSize: number;
    baseIconSize: number;
    baseX: number;
    baseY: number;
    selectionBlend: number;
    pulseTime: number;
    popElapsed: number;
    popDuration: number;
}

export interface SelectionVisualOptions {
    snapToSelection?: boolean;
    triggerPop?: boolean;
}

export interface RoundedFrameTextureOptions {
    fillColor: string;
    fillBottomColor?: string;
    borderColor: string;
    borderWidth: number;
    gloss: boolean;
    feather?: number;
    innerStrokeColor?: string;
    outerShadowColor?: string;
}
