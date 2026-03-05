import * as THREE from 'three';

export interface VegetablePreviewUniforms {
    readonly time: { value: number };
    readonly active: { value: number };
    readonly minOpacity: { value: number };
    readonly maxOpacity: { value: number };
    readonly pulseSpeed: { value: number };
}

const VEGETABLE_PREVIEW_SHADER_KEY = 'vegetable-preview-opacity-v1';

export function applyVegetablePreviewShader(
    material: THREE.Material,
    uniforms: VegetablePreviewUniforms,
) {
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);

    material.onBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile(shader, renderer);
        const outputChunkToken = shader.fragmentShader.includes('#include <opaque_fragment>')
            ? '#include <opaque_fragment>'
            : shader.fragmentShader.includes('#include <output_fragment>')
                ? '#include <output_fragment>'
                : null;

        if (!outputChunkToken) {
            return;
        }

        shader.uniforms.uVegetablePreviewTime = uniforms.time;
        shader.uniforms.uVegetablePreviewActive = uniforms.active;
        shader.uniforms.uVegetablePreviewMinOpacity = uniforms.minOpacity;
        shader.uniforms.uVegetablePreviewMaxOpacity = uniforms.maxOpacity;
        shader.uniforms.uVegetablePreviewPulseSpeed = uniforms.pulseSpeed;

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float uVegetablePreviewTime;
uniform float uVegetablePreviewActive;
uniform float uVegetablePreviewMinOpacity;
uniform float uVegetablePreviewMaxOpacity;
uniform float uVegetablePreviewPulseSpeed;`,
            )
            .replace(
                outputChunkToken,
                `float previewLoop = sin(uVegetablePreviewTime * uVegetablePreviewPulseSpeed) * 0.5 + 0.5;
float previewOpacity = mix(
    uVegetablePreviewMinOpacity,
    uVegetablePreviewMaxOpacity,
    previewLoop
);
diffuseColor.a *= mix(1.0, previewOpacity, clamp(uVegetablePreviewActive, 0.0, 1.0));
${outputChunkToken}`,
            );
    };

    material.customProgramCacheKey = () => {
        const baseKey = previousProgramCacheKey ? previousProgramCacheKey() : '';
        return `${baseKey}|${VEGETABLE_PREVIEW_SHADER_KEY}`;
    };
}
