import type * as THREE from 'three';

export interface WindStreak {
    readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    readonly material: THREE.ShaderMaterial;
    readonly startPosition: THREE.Vector3;
    readonly endPosition: THREE.Vector3;
    readonly direction: THREE.Vector2;
    readonly perpendicular: THREE.Vector2;
    baseOpacity: number;
    baseY: number;
    duration: number;
    elapsed: number;
    wobbleAmplitude: number;
    wobbleFrequency: number;
    wobblePhaseOffset: number;
}
