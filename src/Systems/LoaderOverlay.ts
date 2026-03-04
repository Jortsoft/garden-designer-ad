import * as THREE from 'three';
import type {
    CloudLayer,
    CloudLayerSpec,
    LoaderOverlayState,
} from '../Models/LoaderOverlay.model';

const CLOUD_COLOR_PATH = 'assets/images/smoke.png';
const CLOUD_ALPHA_PATH = 'assets/images/smoke_alpha.png';
const REVEAL_DURATION_SECONDS = 1.5;

export class LoaderOverlay {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly overlayScene = new THREE.Scene();
    private readonly overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 10);
    private readonly backdropMaterial: THREE.MeshBasicMaterial;
    private readonly backdropMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private readonly cloudLayers: CloudLayer[];

    private cloudColorTexture: THREE.Texture | null = null;
    private cloudAlphaTexture: THREE.Texture | null = null;
    private hasCloudTextures = false;
    private viewportWidth = 1;
    private viewportHeight = 1;
    private loadingElapsed = 0;
    private revealElapsed = 0;
    private state: LoaderOverlayState = 'loading';
    private isDisposed = false;

    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer;
        this.overlayCamera.position.z = 1;

        this.backdropMaterial = new THREE.MeshBasicMaterial({
            color: '#d8f4ff',
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.backdropMaterial.toneMapped = false;

        this.backdropMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            this.backdropMaterial,
        );
        this.backdropMesh.renderOrder = 1000;
        this.overlayScene.add(this.backdropMesh);

        this.cloudLayers = this.createCloudField();
        this.updateViewport(1, 1);
    }

    initialize(worldReadyPromise: Promise<void>) {
        void Promise.allSettled([
            worldReadyPromise,
            this.loadCloudTextures(),
        ]).then(() => {
            if (this.isDisposed) {
                return;
            }

            this.beginReveal();
        });
    }

    update(deltaSeconds: number) {
        if (this.state === 'finished') {
            return;
        }

        if (this.state === 'loading') {
            this.loadingElapsed += deltaSeconds;
            this.applyOverlayState();

            return;
        }

        this.revealElapsed += deltaSeconds;

        if (this.revealElapsed >= REVEAL_DURATION_SECONDS) {
            this.revealElapsed = REVEAL_DURATION_SECONDS;
            this.state = 'finished';
        }

        this.applyOverlayState();
    }

    render() {
        if (this.state === 'finished') {
            return;
        }

        const previousAutoClear = this.renderer.autoClear;

        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.overlayScene, this.overlayCamera);
        this.renderer.autoClear = previousAutoClear;
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);

        this.overlayCamera.left = -this.viewportWidth * 0.5;
        this.overlayCamera.right = this.viewportWidth * 0.5;
        this.overlayCamera.top = this.viewportHeight * 0.5;
        this.overlayCamera.bottom = -this.viewportHeight * 0.5;
        this.overlayCamera.updateProjectionMatrix();

        this.applyOverlayState();
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.backdropMesh.geometry.dispose();
        this.backdropMaterial.dispose();
        this.overlayScene.remove(this.backdropMesh);

        for (const layer of this.cloudLayers) {
            layer.mesh.geometry.dispose();
            layer.mesh.material.dispose();
            this.overlayScene.remove(layer.mesh);
        }

        this.cloudColorTexture?.dispose();
        this.cloudAlphaTexture?.dispose();
    }

    private createCloudField() {
        const layerSpecs: CloudLayerSpec[] = [];
        let renderOrder = 1001;

        const appendLayer = (layerSpec: Omit<CloudLayerSpec, 'renderOrder'>) => {
            layerSpecs.push({
                ...layerSpec,
                renderOrder,
            });
            renderOrder += 1;
        };

        const appendEdgeStream = (
            side: -1 | 1,
            baseYRatios: readonly number[],
        ) => {
            baseYRatios.forEach((baseYRatio, index) => {
                const normalizedIndex = index / Math.max(baseYRatios.length - 1, 1);
                const lateralInset = 0.24 + normalizedIndex * 0.16 + (index % 3) * 0.02;
                const sizeRatio =
                    0.18 +
                    (1 - normalizedIndex) * 0.08 +
                    (index % 2 === 0 ? 0.018 : 0);
                const verticalLift =
                    (index - (baseYRatios.length - 1) * 0.5) * 0.016;

                appendLayer({
                    baseXRatio: side * (0.28 + lateralInset),
                    baseYRatio,
                    sizeRatio,
                    aspectRatio: 1.08 + (index % 4) * 0.05,
                    travelXRatio: side * (0.64 + normalizedIndex * 0.38),
                    travelYRatio: baseYRatio * 0.1 + verticalLift,
                    arcXRatio: side * (0.014 + (index % 3) * 0.008),
                    arcYRatio:
                        (index % 2 === 0 ? 1 : -1) *
                        (0.015 + normalizedIndex * 0.012),
                    baseOpacity: 0.74 + (1 - normalizedIndex) * 0.16,
                    fadeStart: 0.16 + normalizedIndex * 0.17,
                    revealOffset: normalizedIndex * 0.08 + index * 0.008,
                    revealWindow: 0.5 + (1 - normalizedIndex) * 0.12,
                    rotationZ:
                        side *
                        (index % 2 === 0 ? 1 : -1) *
                        (0.014 + normalizedIndex * 0.03),
                });
            });
        };

        const appendTopCurtain = (baseXRatios: readonly number[]) => {
            baseXRatios.forEach((baseXRatio, index) => {
                const normalizedIndex = index / Math.max(baseXRatios.length - 1, 1);
                const centeredIndex = normalizedIndex - 0.5;
                const centerWeight = 1 - Math.abs(centeredIndex) * 2;

                appendLayer({
                    baseXRatio,
                    baseYRatio: 0.34 + Math.abs(centeredIndex) * 0.08,
                    sizeRatio: 0.17 + Math.max(centerWeight, 0) * 0.08,
                    aspectRatio: 1.1 + (index % 3) * 0.04,
                    travelXRatio: centeredIndex * 0.42,
                    travelYRatio: 0.56 + Math.abs(centeredIndex) * 0.14,
                    arcXRatio: centeredIndex * 0.08,
                    arcYRatio: 0.02 + Math.abs(centeredIndex) * 0.01,
                    baseOpacity: 0.72 + Math.max(centerWeight, 0) * 0.16,
                    fadeStart: 0.2 + Math.abs(centeredIndex) * 0.1,
                    revealOffset: 0.04 + index * 0.018,
                    revealWindow: 0.48,
                    rotationZ: centeredIndex * 0.07,
                });
            });
        };

        const appendBottomCurtain = (baseXRatios: readonly number[]) => {
            baseXRatios.forEach((baseXRatio, index) => {
                const normalizedIndex = index / Math.max(baseXRatios.length - 1, 1);
                const centeredIndex = normalizedIndex - 0.5;
                const centerWeight = 1 - Math.abs(centeredIndex) * 2;

                appendLayer({
                    baseXRatio,
                    baseYRatio: -0.34 - Math.abs(centeredIndex) * 0.08,
                    sizeRatio: 0.16 + Math.max(centerWeight, 0) * 0.08,
                    aspectRatio: 1.08 + (index % 3) * 0.05,
                    travelXRatio: centeredIndex * 0.34,
                    travelYRatio: -0.52 - Math.abs(centeredIndex) * 0.14,
                    arcXRatio: centeredIndex * 0.07,
                    arcYRatio: -0.02 - Math.abs(centeredIndex) * 0.01,
                    baseOpacity: 0.68 + Math.max(centerWeight, 0) * 0.15,
                    fadeStart: 0.22 + Math.abs(centeredIndex) * 0.08,
                    revealOffset: 0.08 + index * 0.015,
                    revealWindow: 0.46,
                    rotationZ: -centeredIndex * 0.06,
                });
            });
        };

        const appendCenterBand = (baseXRatios: readonly number[]) => {
            baseXRatios.forEach((baseXRatio, index) => {
                const normalizedIndex = index / Math.max(baseXRatios.length - 1, 1);
                const centeredIndex = normalizedIndex - 0.5;
                const verticalDirection = index % 2 === 0 ? 1 : -1;

                appendLayer({
                    baseXRatio,
                    baseYRatio: verticalDirection * (0.03 + Math.abs(centeredIndex) * 0.05),
                    sizeRatio: 0.14 + (1 - Math.abs(centeredIndex) * 1.3) * 0.05,
                    aspectRatio: 1.02 + (index % 4) * 0.04,
                    travelXRatio: centeredIndex * 0.24,
                    travelYRatio: verticalDirection * (0.2 + Math.abs(centeredIndex) * 0.12),
                    arcXRatio: centeredIndex * 0.05,
                    arcYRatio: verticalDirection * 0.025,
                    baseOpacity: 0.58 + (1 - Math.abs(centeredIndex) * 1.1) * 0.14,
                    fadeStart: 0.26 + Math.abs(centeredIndex) * 0.06,
                    revealOffset: 0.11 + index * 0.012,
                    revealWindow: 0.4,
                    rotationZ: centeredIndex * 0.05,
                });
            });
        };

        const appendMidCurtain = (
            baseXRatios: readonly number[],
            baseYRatio: number,
            verticalDirection: 1 | -1,
        ) => {
            baseXRatios.forEach((baseXRatio, index) => {
                const normalizedIndex = index / Math.max(baseXRatios.length - 1, 1);
                const centeredIndex = normalizedIndex - 0.5;
                const centerWeight = 1 - Math.abs(centeredIndex) * 2;

                appendLayer({
                    baseXRatio,
                    baseYRatio,
                    sizeRatio: 0.135 + Math.max(centerWeight, 0) * 0.055,
                    aspectRatio: 1.02 + (index % 3) * 0.035,
                    travelXRatio: centeredIndex * 0.2,
                    travelYRatio:
                        verticalDirection *
                        (0.18 + Math.abs(centeredIndex) * 0.08),
                    arcXRatio: centeredIndex * 0.04,
                    arcYRatio: verticalDirection * 0.018,
                    baseOpacity: 0.56 + Math.max(centerWeight, 0) * 0.16,
                    fadeStart: 0.24 + Math.abs(centeredIndex) * 0.05,
                    revealOffset: 0.1 + index * 0.009,
                    revealWindow: 0.38,
                    rotationZ: centeredIndex * 0.045,
                });
            });
        };

        appendEdgeStream(
            -1,
            [-0.56, -0.46, -0.36, -0.26, -0.16, -0.06, 0.06, 0.18, 0.3, 0.42, 0.54],
        );
        appendEdgeStream(
            1,
            [-0.58, -0.48, -0.38, -0.28, -0.16, -0.04, 0.08, 0.2, 0.32, 0.44, 0.56],
        );
        appendTopCurtain([-0.8, -0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64, 0.8]);
        appendBottomCurtain([-0.78, -0.56, -0.34, -0.12, 0.12, 0.34, 0.56, 0.78]);
        appendCenterBand([-0.56, -0.4, -0.26, -0.12, 0, 0.12, 0.26, 0.4, 0.56]);
        appendMidCurtain(
            [-0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64],
            0.22,
            1,
        );
        appendMidCurtain(
            [-0.6, -0.42, -0.24, -0.08, 0.08, 0.24, 0.42, 0.6],
            -0.22,
            -1,
        );

        [
            {
                baseXRatio: -0.2,
                baseYRatio: 0.16,
                sizeRatio: 0.18,
                aspectRatio: 1.08,
                travelXRatio: -0.24,
                travelYRatio: 0.34,
                arcXRatio: -0.03,
                arcYRatio: 0.03,
                baseOpacity: 0.74,
                fadeStart: 0.28,
                revealOffset: 0.14,
                revealWindow: 0.5,
                rotationZ: 0.04,
            },
            {
                baseXRatio: 0.18,
                baseYRatio: 0.1,
                sizeRatio: 0.16,
                aspectRatio: 1.06,
                travelXRatio: 0.22,
                travelYRatio: 0.3,
                arcXRatio: 0.03,
                arcYRatio: 0.03,
                baseOpacity: 0.7,
                fadeStart: 0.3,
                revealOffset: 0.16,
                revealWindow: 0.48,
                rotationZ: -0.03,
            },
            {
                baseXRatio: -0.12,
                baseYRatio: -0.08,
                sizeRatio: 0.15,
                aspectRatio: 1.04,
                travelXRatio: -0.18,
                travelYRatio: -0.26,
                arcXRatio: 0.03,
                arcYRatio: -0.02,
                baseOpacity: 0.66,
                fadeStart: 0.32,
                revealOffset: 0.2,
                revealWindow: 0.44,
                rotationZ: -0.03,
            },
            {
                baseXRatio: 0.1,
                baseYRatio: -0.14,
                sizeRatio: 0.15,
                aspectRatio: 1.06,
                travelXRatio: 0.16,
                travelYRatio: -0.28,
                arcXRatio: -0.03,
                arcYRatio: -0.03,
                baseOpacity: 0.66,
                fadeStart: 0.32,
                revealOffset: 0.21,
                revealWindow: 0.44,
                rotationZ: 0.03,
            },
            {
                baseXRatio: 0,
                baseYRatio: 0.26,
                sizeRatio: 0.17,
                aspectRatio: 1.12,
                travelXRatio: 0,
                travelYRatio: 0.44,
                arcXRatio: 0.05,
                arcYRatio: 0.02,
                baseOpacity: 0.7,
                fadeStart: 0.26,
                revealOffset: 0.12,
                revealWindow: 0.46,
                rotationZ: 0,
            },
            {
                baseXRatio: -0.34,
                baseYRatio: 0.02,
                sizeRatio: 0.15,
                aspectRatio: 1.04,
                travelXRatio: -0.18,
                travelYRatio: 0.14,
                arcXRatio: -0.03,
                arcYRatio: 0.02,
                baseOpacity: 0.64,
                fadeStart: 0.29,
                revealOffset: 0.13,
                revealWindow: 0.42,
                rotationZ: 0.02,
            },
            {
                baseXRatio: 0.34,
                baseYRatio: -0.02,
                sizeRatio: 0.15,
                aspectRatio: 1.04,
                travelXRatio: 0.18,
                travelYRatio: -0.14,
                arcXRatio: 0.03,
                arcYRatio: -0.02,
                baseOpacity: 0.64,
                fadeStart: 0.29,
                revealOffset: 0.13,
                revealWindow: 0.42,
                rotationZ: -0.02,
            },
            {
                baseXRatio: -0.04,
                baseYRatio: 0.04,
                sizeRatio: 0.14,
                aspectRatio: 1.02,
                travelXRatio: -0.08,
                travelYRatio: 0.12,
                arcXRatio: 0.02,
                arcYRatio: 0.02,
                baseOpacity: 0.6,
                fadeStart: 0.3,
                revealOffset: 0.17,
                revealWindow: 0.38,
                rotationZ: 0.02,
            },
            {
                baseXRatio: 0.04,
                baseYRatio: -0.04,
                sizeRatio: 0.14,
                aspectRatio: 1.02,
                travelXRatio: 0.08,
                travelYRatio: -0.12,
                arcXRatio: -0.02,
                arcYRatio: -0.02,
                baseOpacity: 0.6,
                fadeStart: 0.3,
                revealOffset: 0.17,
                revealWindow: 0.38,
                rotationZ: -0.02,
            },
        ].forEach((layerSpec) => {
            appendLayer(layerSpec);
        });

        return layerSpecs.map((layerSpec) => this.createCloudLayer(layerSpec));
    }

    private async loadCloudTextures() {
        const [cloudTexture, alphaTexture] = await Promise.all([
            this.textureLoader.loadAsync(CLOUD_COLOR_PATH),
            this.textureLoader.loadAsync(CLOUD_ALPHA_PATH),
        ]);

        if (this.isDisposed) {
            cloudTexture.dispose();
            alphaTexture.dispose();
            return;
        }

        cloudTexture.colorSpace = THREE.SRGBColorSpace;
        cloudTexture.minFilter = THREE.LinearMipmapLinearFilter;
        cloudTexture.magFilter = THREE.LinearFilter;
        cloudTexture.generateMipmaps = true;
        cloudTexture.needsUpdate = true;

        alphaTexture.minFilter = THREE.LinearMipmapLinearFilter;
        alphaTexture.magFilter = THREE.LinearFilter;
        alphaTexture.generateMipmaps = true;
        alphaTexture.needsUpdate = true;

        this.cloudColorTexture = cloudTexture;
        this.cloudAlphaTexture = alphaTexture;
        this.hasCloudTextures = true;

        for (const layer of this.cloudLayers) {
            layer.mesh.material.map = cloudTexture;
            layer.mesh.material.alphaMap = alphaTexture;
            layer.mesh.material.needsUpdate = true;
        }

        this.applyOverlayState();
    }

    private createCloudLayer(layerSpec: CloudLayerSpec) {
        const material = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: layerSpec.baseOpacity,
            depthTest: false,
            depthWrite: false,
        });
        material.toneMapped = false;

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            material,
        );
        mesh.rotation.z = layerSpec.rotationZ;
        mesh.renderOrder = layerSpec.renderOrder;

        this.overlayScene.add(mesh);

        return {
            mesh,
            baseRotationZ: layerSpec.rotationZ,
            baseXRatio: layerSpec.baseXRatio,
            baseYRatio: layerSpec.baseYRatio,
            sizeRatio: layerSpec.sizeRatio,
            aspectRatio: layerSpec.aspectRatio,
            travelXRatio: layerSpec.travelXRatio,
            travelYRatio: layerSpec.travelYRatio,
            arcXRatio: layerSpec.arcXRatio,
            arcYRatio: layerSpec.arcYRatio,
            baseOpacity: layerSpec.baseOpacity,
            fadeStart: layerSpec.fadeStart,
            revealOffset: layerSpec.revealOffset,
            revealWindow: layerSpec.revealWindow,
        };
    }

    private applyOverlayState() {
        const isLoading = this.state === 'loading';
        const loadingPulse =
            isLoading
                ? (Math.sin(this.loadingElapsed * 2.4) * 0.5 + 0.5)
                : 0;
        const revealProgress =
            isLoading
                ? 0
                : THREE.MathUtils.clamp(
                    this.revealElapsed / REVEAL_DURATION_SECONDS,
                    0,
                    1,
                );
        const backdropFade = isLoading
            ? 0.94 + loadingPulse * 0.06
            : 1 - this.easeSoftStep(revealProgress, 0.18, 0.82);
        const cloudBaseUnit = Math.max(this.viewportWidth, this.viewportHeight);

        this.backdropMesh.scale.set(this.viewportWidth, this.viewportHeight, 1);
        this.backdropMesh.position.set(0, 0, 0);
        this.backdropMaterial.opacity =
            this.state === 'finished'
                ? 0
                : THREE.MathUtils.clamp(backdropFade, 0, 1);

        for (const layer of this.cloudLayers) {
            const localProgress = this.getLayerRevealProgress(layer, revealProgress);
            const idlePhase =
                this.loadingElapsed * 0.95 +
                layer.baseXRatio * 5.7 +
                layer.baseYRatio * 4.3;
            const idleDriftStrength = isLoading ? 1 : 0;
            const idleOffsetX =
                this.viewportWidth *
                0.0075 *
                Math.sin(idlePhase) *
                idleDriftStrength;
            const idleOffsetY =
                this.viewportHeight *
                0.006 *
                Math.cos(idlePhase * 1.08) *
                idleDriftStrength;
            const idleScale =
                1 +
                0.025 *
                Math.sin(idlePhase * 1.15) *
                idleDriftStrength;
            const idleOpacity =
                isLoading
                    ? 0.92 + loadingPulse * 0.08
                    : 1;
            const motionProgress = this.easeCloudMotion(localProgress);
            const arcProgress = Math.sin(
                this.easeSoftStep(localProgress, 0.04, 0.78) * Math.PI,
            );
            const releaseProgress = this.easeSoftStep(localProgress, 0.24, 0.9);
            const swayStrength = 1 - this.easeSoftStep(localProgress, 0.08, 0.72);
            const swayPhase =
                Math.sin(
                    localProgress * Math.PI * 1.8 +
                    layer.baseXRatio * 7 +
                    layer.baseYRatio * 5,
                ) * swayStrength;
            const width =
                cloudBaseUnit *
                layer.sizeRatio *
                layer.aspectRatio *
                THREE.MathUtils.lerp(1, 0.93, releaseProgress) *
                idleScale;
            const height =
                cloudBaseUnit *
                layer.sizeRatio *
                THREE.MathUtils.lerp(1, 0.9, releaseProgress) *
                idleScale;
            const offsetX =
                this.viewportWidth * layer.travelXRatio * motionProgress +
                this.viewportWidth * layer.arcXRatio * arcProgress +
                this.viewportWidth * 0.012 * swayPhase +
                idleOffsetX;
            const offsetY =
                this.viewportHeight * layer.travelYRatio * motionProgress +
                this.viewportHeight * layer.arcYRatio * arcProgress +
                this.viewportHeight * 0.009 * swayPhase +
                idleOffsetY;
            const fadeProgress = this.easeSoftStep(
                localProgress,
                layer.fadeStart,
                0.94,
            );

            layer.mesh.scale.set(width, height, 1);
            layer.mesh.position.set(
                this.viewportWidth * layer.baseXRatio + offsetX,
                this.viewportHeight * layer.baseYRatio + offsetY,
                0,
            );
            layer.mesh.rotation.z =
                layer.baseRotationZ +
                layer.baseRotationZ * 0.75 * releaseProgress +
                swayPhase * 0.035 +
                idleDriftStrength * Math.sin(idlePhase * 0.9) * 0.015;
            layer.mesh.material.opacity =
                this.state === 'finished' || !this.hasCloudTextures
                    ? 0
                    : layer.baseOpacity * (1 - fadeProgress) * idleOpacity;
        }
    }

    private getLayerRevealProgress(layer: CloudLayer, revealProgress: number) {
        if (this.state === 'loading') {
            return 0;
        }

        return THREE.MathUtils.clamp(
            (revealProgress - layer.revealOffset) / Math.max(layer.revealWindow, Number.EPSILON),
            0,
            1,
        );
    }

    private easeSoftStep(value: number, edge0: number, edge1: number) {
        const normalizedValue = THREE.MathUtils.clamp(
            (value - edge0) / Math.max(edge1 - edge0, Number.EPSILON),
            0,
            1,
        );

        return normalizedValue * normalizedValue * (3 - 2 * normalizedValue);
    }

    private easeCloudMotion(value: number) {
        const earlyDrift = this.easeSoftStep(value, 0, 0.24);
        const mainSweep = this.easeSoftStep(value, 0.08, 0.66);
        const releaseBurst = this.easeSoftStep(value, 0.34, 0.82);

        return THREE.MathUtils.clamp(
            earlyDrift * 0.12 + mainSweep * 0.46 + releaseBurst * 0.42,
            0,
            1,
        );
    }

    private beginReveal() {
        if (this.state === 'finished') {
            return;
        }

        this.state = 'revealing';
        this.revealElapsed = 0;
        this.applyOverlayState();
    }
}
