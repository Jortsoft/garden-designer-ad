import * as THREE from 'three';

const INTERACTION_LINE_DARK_COLOR = new THREE.Color('#110d09');
const INTERACTION_LINE_SPEED = 0.5;
const INTERACTION_LINE_FREQUENCY = 7.8;
const INTERACTION_LINE_THICKNESS = 0.055;
const INTERACTION_LINE_DARKNESS = 0.82;
const PLACEHOLDER_INTERACTION_SHADER_KEY = 'placeholder-interaction-lines-v1';

export function applyPlaceHolderInteractionShader(
    material: THREE.MeshStandardMaterial,
    timeUniform: { value: number },
) {
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);

    material.onBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile(shader, renderer);
        shader.uniforms.uInteractionTime = timeUniform;
        shader.uniforms.uInteractionLineDarkColor = { value: INTERACTION_LINE_DARK_COLOR };
        shader.uniforms.uInteractionLineSpeed = { value: INTERACTION_LINE_SPEED };
        shader.uniforms.uInteractionLineFrequency = { value: INTERACTION_LINE_FREQUENCY };
        shader.uniforms.uInteractionLineThickness = { value: INTERACTION_LINE_THICKNESS };
        shader.uniforms.uInteractionLineDarkness = { value: INTERACTION_LINE_DARKNESS };

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
varying vec3 vInteractionWorldPosition;`,
            )
            .replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
vInteractionWorldPosition = worldPosition.xyz;`,
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float uInteractionTime;
uniform vec3 uInteractionLineDarkColor;
uniform float uInteractionLineSpeed;
uniform float uInteractionLineFrequency;
uniform float uInteractionLineThickness;
uniform float uInteractionLineDarkness;
varying vec3 vInteractionWorldPosition;`,
            )
            .replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
float interactionLinePhase = (
    vInteractionWorldPosition.x * 1.1 +
    vInteractionWorldPosition.y * 1.8 +
    vInteractionWorldPosition.z * 1.05
) * uInteractionLineFrequency - uInteractionTime * uInteractionLineSpeed;
float interactionStripeA = abs(fract(interactionLinePhase) - 0.5);
float interactionStripeB = abs(fract(interactionLinePhase + 0.23) - 0.5);
float interactionStripeC = abs(fract(interactionLinePhase + 0.47) - 0.5);
float interactionMaskA = smoothstep(uInteractionLineThickness, 0.0, interactionStripeA);
float interactionMaskB = smoothstep(uInteractionLineThickness * 0.95, 0.0, interactionStripeB);
float interactionMaskC = smoothstep(uInteractionLineThickness * 0.9, 0.0, interactionStripeC);
float interactionLineMask = clamp(
    interactionMaskA * 0.5 +
    interactionMaskB * 0.35 +
    interactionMaskC * 0.25,
    0.0,
    1.0
);
diffuseColor.rgb = mix(
    diffuseColor.rgb,
    uInteractionLineDarkColor,
    interactionLineMask * uInteractionLineDarkness
);`,
            );
    };

    material.customProgramCacheKey = () => {
        const baseKey = previousProgramCacheKey ? previousProgramCacheKey() : '';
        return `${baseKey}|${PLACEHOLDER_INTERACTION_SHADER_KEY}`;
    };
}
