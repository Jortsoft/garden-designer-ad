import type * as THREE from 'three';

export type LoaderOverlayState = 'loading' | 'revealing' | 'finished';

export interface CloudLayer {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    baseRotationZ: number;
    baseXRatio: number;
    baseYRatio: number;
    sizeRatio: number;
    aspectRatio: number;
    travelXRatio: number;
    travelYRatio: number;
    arcXRatio: number;
    arcYRatio: number;
    baseOpacity: number;
    fadeStart: number;
    revealOffset: number;
    revealWindow: number;
}

export interface CloudLayerSpec {
    baseXRatio: number;
    baseYRatio: number;
    sizeRatio: number;
    aspectRatio: number;
    travelXRatio: number;
    travelYRatio: number;
    arcXRatio: number;
    arcYRatio: number;
    baseOpacity: number;
    fadeStart: number;
    revealOffset: number;
    revealWindow: number;
    rotationZ: number;
    renderOrder: number;
}
