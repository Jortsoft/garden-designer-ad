import * as THREE from 'three';
import { PlantId } from '../Models/PlaceVegetable.model';

interface ResourceDefinition {
    readonly id: PlantId;
    readonly iconPath: string;
}

interface ResourceEntry {
    readonly id: PlantId;
    readonly iconMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly countMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly countCanvas: HTMLCanvasElement;
    readonly countContext: CanvasRenderingContext2D | null;
    readonly countTexture: THREE.CanvasTexture;
    iconTexture: THREE.Texture | null;
    count: number;
}

interface ResourceGainBatch {
    readonly plantId: PlantId;
    pendingIcons: number;
    resolve: () => void;
}

interface FlyingResourceIcon {
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

const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
    { id: PlantId.corn, iconPath: 'assets/images/corn.png' },
    { id: PlantId.grape, iconPath: 'assets/images/grape.png' },
    { id: PlantId.strawberry, iconPath: 'assets/images/strawberry.png' },
] as const;

const HUD_MARGIN_LEFT = 1;
const HUD_MARGIN_TOP = 10;
const ITEM_GAP = 3;
const ICON_MIN_SIZE = 44;
const ICON_MAX_SIZE = 64;
const ICON_SCREEN_RATIO = 0.09;
const COUNT_WIDTH_RATIO = 0.66;
const COUNT_HEIGHT_RATIO = 0.42;
const COUNT_OFFSET_Y_RATIO = -0.3;
const COUNT_ICON_GAP_PX = 1;
const COUNT_TEXTURE_WIDTH = 384;
const COUNT_TEXTURE_HEIGHT = 160;
const COUNT_TEXT_PREFIX = 'x';
const COUNT_RENDER_ORDER = 1120;
const ICON_RENDER_ORDER = 1119;
const FRAME_RENDER_ORDER = 1118;
const FLY_ICON_RENDER_ORDER = 1122;
const FRAME_PADDING_X = 50;
const FRAME_PADDING_Y = 15;
const FRAME_TEXTURE_SIZE = 768;
const FLY_ICON_SIZE_RATIO = 0.66;
const FLY_ICON_MIN_SIZE = 26;
const FLY_ICON_MAX_SIZE = 42;
const FLY_ICON_DURATION_MIN = 0.48;
const FLY_ICON_DURATION_MAX = 0.72;
const FLY_ICON_STAGGER = 0.06;
const FLY_ICON_DELAY_JITTER = 0.04;
const FLY_ICON_START_JITTER_X = 16;
const FLY_ICON_START_JITTER_Y = 10;
const FLY_ICON_CONTROL_JITTER_X = 34;
const FLY_ICON_ARC_HEIGHT_MIN = 74;
const FLY_ICON_ARC_HEIGHT_EXTRA = 38;

export class FarmResourcesUI {
    private readonly inputElement: HTMLElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly overlayScene = new THREE.Scene();
    private readonly overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 10);
    private readonly flyIconGeometry = new THREE.PlaneGeometry(1, 1);
    private readonly projectionVector = new THREE.Vector3();
    private readonly frameTexture: THREE.CanvasTexture;
    private readonly frameMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private readonly entries: ResourceEntry[] = [];
    private readonly flyingIcons: FlyingResourceIcon[] = [];

    private viewportWidth = 1;
    private viewportHeight = 1;
    private currentIconSize = ICON_MIN_SIZE;
    private isVisible = true;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;

    constructor(inputElement: HTMLElement, renderer: THREE.WebGLRenderer) {
        this.inputElement = inputElement;
        this.renderer = renderer;
        this.overlayCamera.position.z = 1;
        this.frameTexture = this.createFrameTexture();

        const frameMaterial = new THREE.MeshBasicMaterial({
            map: this.frameTexture,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false,
        });
        frameMaterial.toneMapped = false;
        this.frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial);
        this.frameMesh.renderOrder = FRAME_RENDER_ORDER;
        this.overlayScene.add(this.frameMesh);

        this.createResourceEntries();
        this.updateViewport(1, 1);
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.setVisible(this.isVisible);
        this.loadPromise = this.loadIconTextures();

        return this.loadPromise;
    }

    update(deltaSeconds: number) {
        this.updateFlyingIcons(deltaSeconds);
    }

    render() {
        if (!this.isInitialized || this.isDisposed || !this.isVisible) {
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

        this.layoutEntries();
    }

    setResourceCount(plantId: PlantId, value: number) {
        const entry = this.entries.find((item) => item.id === plantId);

        if (!entry) {
            return;
        }

        const nextValue = Math.max(0, Math.round(value));

        if (entry.count === nextValue) {
            return;
        }

        entry.count = nextValue;
        this.redrawCountTexture(entry);
    }

    getResourceCount(plantId: PlantId) {
        return this.entries.find((item) => item.id === plantId)?.count ?? 0;
    }

    playResourceGainAnimation(
        plantId: PlantId,
        amount: number,
        sourceWorldPositions: readonly THREE.Vector3[],
        camera: THREE.Camera,
    ) {
        const rewardAmount = Math.max(0, Math.round(amount));

        if (rewardAmount <= 0) {
            return Promise.resolve();
        }

        const entry = this.entries.find((item) => item.id === plantId);
        if (!entry) {
            return Promise.resolve();
        }

        if (this.isDisposed) {
            this.incrementResourceCount(plantId, rewardAmount);
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            const batch: ResourceGainBatch = {
                plantId,
                pendingIcons: rewardAmount,
                resolve,
            };
            const startPositions = this.buildFlyStartPositions(sourceWorldPositions, camera);
            const endPosition = new THREE.Vector2(
                entry.iconMesh.position.x,
                entry.iconMesh.position.y,
            );

            for (let index = 0; index < rewardAmount; index += 1) {
                const startBase = startPositions[index % startPositions.length];
                const start = startBase.clone();
                start.x += this.randomRange(-FLY_ICON_START_JITTER_X, FLY_ICON_START_JITTER_X);
                start.y += this.randomRange(-FLY_ICON_START_JITTER_Y, FLY_ICON_START_JITTER_Y);

                const controlY =
                    Math.max(start.y, endPosition.y) +
                    FLY_ICON_ARC_HEIGHT_MIN +
                    this.randomRange(0, FLY_ICON_ARC_HEIGHT_EXTRA);
                const controlX =
                    (start.x + endPosition.x) * 0.5 +
                    this.randomRange(-FLY_ICON_CONTROL_JITTER_X, FLY_ICON_CONTROL_JITTER_X);
                const flyMaterial = new THREE.MeshBasicMaterial({
                    map: entry.iconTexture ?? entry.iconMesh.material.map,
                    transparent: true,
                    opacity: 0,
                    depthTest: false,
                    depthWrite: false,
                });
                flyMaterial.toneMapped = false;

                const flyMesh = new THREE.Mesh(this.flyIconGeometry, flyMaterial);
                flyMesh.renderOrder = FLY_ICON_RENDER_ORDER;
                flyMesh.visible = false;
                flyMesh.position.set(start.x, start.y, 0.01);
                const baseSize = THREE.MathUtils.clamp(
                    this.currentIconSize * FLY_ICON_SIZE_RATIO,
                    FLY_ICON_MIN_SIZE,
                    FLY_ICON_MAX_SIZE,
                );
                flyMesh.scale.set(baseSize, baseSize, 1);
                this.overlayScene.add(flyMesh);

                this.flyingIcons.push({
                    plantId,
                    mesh: flyMesh,
                    start,
                    control: new THREE.Vector2(controlX, controlY),
                    end: endPosition.clone(),
                    duration: this.randomRange(FLY_ICON_DURATION_MIN, FLY_ICON_DURATION_MAX),
                    delay: index * FLY_ICON_STAGGER + this.randomRange(0, FLY_ICON_DELAY_JITTER),
                    baseSize,
                    batch,
                    elapsed: 0,
                    isRewardApplied: false,
                });
            }
        });
    }

    setVisible(isVisible: boolean) {
        this.isVisible = isVisible;
        this.frameMesh.visible = isVisible;

        for (const entry of this.entries) {
            entry.iconMesh.visible = isVisible;
            entry.countMesh.visible = isVisible;
        }
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.clearFlyingIcons(false);
        this.flyIconGeometry.dispose();
        this.frameMesh.geometry.dispose();
        this.frameMesh.material.dispose();
        this.overlayScene.remove(this.frameMesh);
        this.frameTexture.dispose();

        for (const entry of this.entries) {
            entry.iconMesh.geometry.dispose();
            entry.iconMesh.material.dispose();
            this.overlayScene.remove(entry.iconMesh);

            entry.countMesh.geometry.dispose();
            entry.countMesh.material.dispose();
            this.overlayScene.remove(entry.countMesh);

            entry.countTexture.dispose();
            entry.iconTexture?.dispose();
        }

        this.entries.length = 0;
    }

    private createResourceEntries() {
        for (const definition of RESOURCE_DEFINITIONS) {
            const iconMaterial = new THREE.MeshBasicMaterial({
                color: '#ffffff',
                transparent: true,
                opacity: 1,
                depthTest: false,
                depthWrite: false,
            });
            iconMaterial.toneMapped = false;

            const iconMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                iconMaterial,
            );
            iconMesh.renderOrder = ICON_RENDER_ORDER;
            this.overlayScene.add(iconMesh);

            const countCanvas = document.createElement('canvas');
            countCanvas.width = COUNT_TEXTURE_WIDTH;
            countCanvas.height = COUNT_TEXTURE_HEIGHT;
            const countContext = countCanvas.getContext('2d');
            const countTexture = new THREE.CanvasTexture(countCanvas);
            countTexture.colorSpace = THREE.SRGBColorSpace;
            countTexture.generateMipmaps = true;
            countTexture.minFilter = THREE.LinearMipmapLinearFilter;
            countTexture.magFilter = THREE.LinearFilter;

            const countMaterial = new THREE.MeshBasicMaterial({
                map: countTexture,
                transparent: true,
                opacity: 1,
                depthTest: false,
                depthWrite: false,
            });
            countMaterial.toneMapped = false;

            const countMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                countMaterial,
            );
            countMesh.renderOrder = COUNT_RENDER_ORDER;
            this.overlayScene.add(countMesh);

            const entry: ResourceEntry = {
                id: definition.id,
                iconMesh,
                countMesh,
                countCanvas,
                countContext,
                countTexture,
                iconTexture: null,
                count: 0,
            };

            this.redrawCountTexture(entry);
            this.entries.push(entry);
        }
    }

    private async loadIconTextures() {
        await Promise.all(
            RESOURCE_DEFINITIONS.map(async (definition) => {
                const entry = this.entries.find((item) => item.id === definition.id);

                if (!entry) {
                    return;
                }

                try {
                    const texture = await this.textureLoader.loadAsync(definition.iconPath);

                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.needsUpdate = true;

                    entry.iconTexture = texture;
                    entry.iconMesh.material.map = texture;
                    entry.iconMesh.material.needsUpdate = true;
                } catch (error) {
                    console.error(`Failed to load farm icon: ${definition.iconPath}`, error);
                }
            }),
        );
    }

    private layoutEntries() {
        const iconSize = THREE.MathUtils.clamp(
            this.viewportWidth * ICON_SCREEN_RATIO,
            ICON_MIN_SIZE,
            ICON_MAX_SIZE,
        );
        this.currentIconSize = iconSize;
        const countWidth = iconSize * COUNT_WIDTH_RATIO;
        const countHeight = iconSize * COUNT_HEIGHT_RATIO;
        const groupWidth = iconSize + COUNT_ICON_GAP_PX + countWidth;
        const itemStride = groupWidth + ITEM_GAP;
        const frameWidth =
            this.entries.length * itemStride -
            ITEM_GAP +
            FRAME_PADDING_X * 2;
        const frameHeight = iconSize + FRAME_PADDING_Y * 2;
        const frameCenterX = -this.viewportWidth * 0.5 + HUD_MARGIN_LEFT + frameWidth * 0.5;
        const frameCenterY = this.viewportHeight * 0.5 - HUD_MARGIN_TOP - frameHeight * 0.5;
        const startX =
            frameCenterX -
            frameWidth * 0.5 +
            FRAME_PADDING_X +
            iconSize * 0.5;
        const iconY = frameCenterY;

        this.frameMesh.position.set(frameCenterX, frameCenterY, -0.01);
        this.frameMesh.scale.set(frameWidth, frameHeight, 1);
        this.frameMesh.visible = this.isVisible;

        for (let index = 0; index < this.entries.length; index += 1) {
            const entry = this.entries[index];
            const baseX = startX + index * itemStride;
            const countX =
                baseX +
                iconSize * 0.5 +
                COUNT_ICON_GAP_PX +
                countWidth * 0.5;
            const countY = iconY + iconSize * COUNT_OFFSET_Y_RATIO;

            entry.iconMesh.position.set(baseX, iconY, 0);
            entry.iconMesh.scale.set(iconSize, iconSize, 1);
            entry.iconMesh.visible = this.isVisible;

            entry.countMesh.position.set(countX, countY, 0);
            entry.countMesh.scale.set(countWidth, countHeight, 1);
            entry.countMesh.visible = this.isVisible;
        }
    }

    private redrawCountTexture(entry: ResourceEntry) {
        const context = entry.countContext;

        if (!context) {
            entry.countTexture.needsUpdate = true;
            return;
        }

        const width = entry.countCanvas.width;
        const height = entry.countCanvas.height;

        context.clearRect(0, 0, width, height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `800 ${Math.round(height * 0.86)}px "Trebuchet MS", "Verdana", sans-serif`;
        context.fillStyle = '#fff6e6';
        context.strokeStyle = 'rgba(112, 66, 29, 0.96)';
        context.lineJoin = 'round';
        context.miterLimit = 2;
        context.lineWidth = Math.max(4, Math.round(height * 0.09));
        const text = `${COUNT_TEXT_PREFIX}${entry.count}`;
        const textY = height * 0.56;
        context.strokeText(text, width * 0.5, textY);
        context.fillText(text, width * 0.5, textY);

        entry.countTexture.needsUpdate = true;
    }

    private createFrameTexture() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = FRAME_TEXTURE_SIZE;
        canvas.height = FRAME_TEXTURE_SIZE;

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        if (!context) {
            texture.needsUpdate = true;
            return texture;
        }

        const padding = Math.round(canvas.width * 0.07);
        const x = padding;
        const y = padding;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        const radius = Math.round(canvas.width * 0.045);
        const borderWidth = Math.max(3, Math.round(canvas.width * 0.008));

        this.drawRoundedRect(context, x, y, width, height, radius);
        context.fillStyle = 'rgba(181, 152, 117, 0.9)';
        context.fill();
        context.lineWidth = borderWidth;
        context.strokeStyle = 'rgba(148, 116, 84, 0.86)';
        context.stroke();

        texture.needsUpdate = true;

        return texture;
    }

    private drawRoundedRect(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
    ) {
        const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));

        context.beginPath();
        context.moveTo(x + clampedRadius, y);
        context.lineTo(x + width - clampedRadius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
        context.lineTo(x + width, y + height - clampedRadius);
        context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
        context.lineTo(x + clampedRadius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
        context.lineTo(x, y + clampedRadius);
        context.quadraticCurveTo(x, y, x + clampedRadius, y);
        context.closePath();
    }

    private updateFlyingIcons(deltaSeconds: number) {
        if (this.flyingIcons.length === 0 || this.isDisposed) {
            return;
        }

        const safeDeltaSeconds = Math.max(0, deltaSeconds);
        for (let index = this.flyingIcons.length - 1; index >= 0; index -= 1) {
            const icon = this.flyingIcons[index];

            icon.elapsed += safeDeltaSeconds;
            const localElapsed = icon.elapsed - icon.delay;

            if (localElapsed <= 0) {
                icon.mesh.visible = false;
                continue;
            }

            const duration = Math.max(icon.duration, 0.001);
            const progress = THREE.MathUtils.clamp(localElapsed / duration, 0, 1);
            const pathProgress = this.easeOutCubic(progress);
            const inverse = 1 - pathProgress;
            const x =
                inverse * inverse * icon.start.x +
                2 * inverse * pathProgress * icon.control.x +
                pathProgress * pathProgress * icon.end.x;
            const y =
                inverse * inverse * icon.start.y +
                2 * inverse * pathProgress * icon.control.y +
                pathProgress * pathProgress * icon.end.y;
            const scale =
                icon.baseSize *
                (1 +
                    0.22 * Math.sin(progress * Math.PI) +
                    THREE.MathUtils.lerp(0.08, -0.12, progress));
            const fadeIn = THREE.MathUtils.clamp(progress / 0.2, 0, 1);
            const fadeOut = THREE.MathUtils.clamp((1 - progress) / 0.22, 0, 1);

            icon.mesh.visible = this.isVisible;
            icon.mesh.position.set(x, y, 0.01);
            icon.mesh.scale.set(scale, scale, 1);
            icon.mesh.material.opacity = Math.min(fadeIn, fadeOut) * 0.96;

            if (progress < 1) {
                continue;
            }

            this.completeFlyingIcon(index, icon);
        }
    }

    private completeFlyingIcon(index: number, icon: FlyingResourceIcon) {
        if (!icon.isRewardApplied) {
            this.incrementResourceCount(icon.plantId, 1);
            icon.isRewardApplied = true;
        }

        this.overlayScene.remove(icon.mesh);
        icon.mesh.material.dispose();
        this.flyingIcons.splice(index, 1);
        icon.batch.pendingIcons = Math.max(0, icon.batch.pendingIcons - 1);

        if (icon.batch.pendingIcons <= 0) {
            icon.batch.resolve();
        }
    }

    private clearFlyingIcons(shouldApplyPendingRewards: boolean) {
        for (let index = this.flyingIcons.length - 1; index >= 0; index -= 1) {
            const icon = this.flyingIcons[index];

            if (shouldApplyPendingRewards && !icon.isRewardApplied) {
                this.incrementResourceCount(icon.plantId, 1);
                icon.isRewardApplied = true;
            }

            this.overlayScene.remove(icon.mesh);
            icon.mesh.material.dispose();
            icon.batch.pendingIcons = Math.max(0, icon.batch.pendingIcons - 1);

            if (icon.batch.pendingIcons <= 0) {
                icon.batch.resolve();
            }
        }

        this.flyingIcons.length = 0;
    }

    private incrementResourceCount(plantId: PlantId, amount: number) {
        if (amount === 0) {
            return;
        }

        this.setResourceCount(plantId, this.getResourceCount(plantId) + amount);
    }

    private buildFlyStartPositions(
        sourceWorldPositions: readonly THREE.Vector3[],
        camera: THREE.Camera,
    ) {
        const starts: THREE.Vector2[] = [];

        for (const worldPosition of sourceWorldPositions) {
            const projected = this.projectWorldToOverlay(worldPosition, camera);

            if (projected) {
                starts.push(projected);
            }
        }

        if (starts.length > 0) {
            return starts;
        }

        return [
            new THREE.Vector2(
                this.viewportWidth * 0.08,
                -this.viewportHeight * 0.18,
            ),
        ];
    }

    private projectWorldToOverlay(worldPosition: THREE.Vector3, camera: THREE.Camera) {
        this.projectionVector.copy(worldPosition).project(camera);

        if (
            !Number.isFinite(this.projectionVector.x) ||
            !Number.isFinite(this.projectionVector.y) ||
            this.projectionVector.z < -1 ||
            this.projectionVector.z > 1
        ) {
            return null;
        }

        return new THREE.Vector2(
            this.projectionVector.x * this.viewportWidth * 0.5,
            this.projectionVector.y * this.viewportHeight * 0.5,
        );
    }

    private randomRange(min: number, max: number) {
        return min + Math.random() * (max - min);
    }

    private easeOutCubic(value: number) {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        const inverse = 1 - t;

        return 1 - inverse * inverse * inverse;
    }
}
