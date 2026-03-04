export const POST_PROCESSING_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 1 },
        brightness: { value: 0 },
        contrast: { value: 1 },
        saturation: { value: 1 },
        temperature: { value: 0 },
        tint: { value: 0 },
        vignetteIntensity: { value: 0 },
        vignetteSmoothness: { value: 1 },
    },
    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        uniform float temperature;
        uniform float tint;
        uniform float vignetteIntensity;
        uniform float vignetteSmoothness;

        varying vec2 vUv;

        void main() {
            vec4 source = texture2D(tDiffuse, vUv);
            vec3 color = source.rgb * exposure;

            color += brightness;
            color.r += temperature * 0.12;
            color.b -= temperature * 0.12;
            color.g += tint * 0.08;

            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luminance), color, saturation);
            color = (color - 0.5) * contrast + 0.5;

            float distanceToCenter = distance(vUv, vec2(0.5)) * 1.41421356;
            float vignetteMask = smoothstep(1.0 - vignetteSmoothness, 1.0, distanceToCenter);
            color *= 1.0 - vignetteMask * vignetteIntensity;

            gl_FragColor = vec4(max(color, 0.0), source.a);
        }
    `,
} as const;
