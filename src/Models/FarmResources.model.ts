import * as THREE from 'three';
import type { PlantId } from './PlaceVegetable.model';

export interface ResourceDefinition {
    readonly id: PlantId;
    readonly iconPath: string;
}

export interface ResourceEntry {
    readonly id: PlantId;
    readonly iconMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly countMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly countCanvas: HTMLCanvasElement;
    readonly countContext: CanvasRenderingContext2D | null;
    readonly countTexture: THREE.CanvasTexture;
    iconTexture: THREE.Texture | null;
    count: number;
}

export interface ResourceGainBatch {
    readonly plantId: PlantId;
    pendingIcons: number;
    resolve: () => void;
}

export interface FlyingResourceIcon {
    readonly plantId: PlantId;
    readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly start: THREE.Vector2;
    readonly control: THREE.Vector2;
    readonly end: THREE.Vector2;
    readonly duration: number;
    readonly delay: number;
    readonly baseSize: number;
    readonly batch: ResourceGainBatch;
    elapsed: number;
    isRewardApplied: boolean;
}
