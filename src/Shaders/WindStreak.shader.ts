import * as THREE from 'three';

export const WIND_STREAK_SHADER = {
    uniforms: {
        opacity: { value: 0.06 },
        color: { value: new THREE.Color('#f7fff5') },
    },
    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float opacity;
        uniform vec3 color;

        varying vec2 vUv;

        void main() {
            float headFade = smoothstep(0.0, 0.1, vUv.x);
            float tailFade = 1.0 - smoothstep(0.6, 1.0, vUv.x);
            float lateralDistance = abs(vUv.y - 0.5) * 2.0;
            float bodyFade = 1.0 - smoothstep(0.0, 1.0, lateralDistance);
            float core = headFade * tailFade * pow(bodyFade, 1.65);

            float shimmer = 0.94 + sin(vUv.x * 10.0) * 0.06;
            float alpha = core * opacity * shimmer;

            if (alpha <= 0.002) {
                discard;
            }

            gl_FragColor = vec4(color, alpha);
        }
    `,
} as const;
