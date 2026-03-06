import * as THREE from 'three';
import { GameConfig } from '../Managers/GameConfig';

const MARKET_INTERACTION_POSITION = new THREE.Vector3(1.195, 0.179, 1.422);
const MARKET_HIT_SIZE = new THREE.Vector3(0.18, 0.16, 0.18);
const MARKET_MIN_AXIS = 0.001;

export class Market extends THREE.Group {
    private readonly shouldShowHitOutline = GameConfig.debugMode;
    private readonly interactionHitBounds = new THREE.Box3();
    private readonly interactionHitPoint = new THREE.Vector3();
    private readonly interactionHitArea:
        THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
    private readonly interactionHitOutline:
        THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>
        | null;

    constructor() {
        super();
        this.name = 'Market';
        this.position.copy(MARKET_INTERACTION_POSITION);

        const hitAreaGeometry = new THREE.BoxGeometry(
            Math.max(MARKET_HIT_SIZE.x, MARKET_MIN_AXIS),
            Math.max(MARKET_HIT_SIZE.y, MARKET_MIN_AXIS),
            Math.max(MARKET_HIT_SIZE.z, MARKET_MIN_AXIS),
        );
        const hitAreaMaterial = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });
        hitAreaMaterial.colorWrite = false;
        hitAreaMaterial.toneMapped = false;

        this.interactionHitArea = new THREE.Mesh(hitAreaGeometry, hitAreaMaterial);
        this.interactionHitArea.name = 'MarketHitArea';
        this.interactionHitArea.renderOrder = 2;
        this.interactionHitArea.frustumCulled = false;
        this.add(this.interactionHitArea);

        if (this.shouldShowHitOutline) {
            const outlineGeometry = new THREE.EdgesGeometry(hitAreaGeometry);
            const outlineMaterial = new THREE.LineBasicMaterial({
                color: '#ff2b2b',
                transparent: true,
                opacity: 0.98,
                depthTest: false,
                depthWrite: false,
            });
            outlineMaterial.toneMapped = false;
            this.interactionHitOutline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
            this.interactionHitOutline.name = 'MarketHitAreaOutline';
            this.interactionHitOutline.renderOrder = this.interactionHitArea.renderOrder + 1;
            this.interactionHitOutline.frustumCulled = false;
            this.add(this.interactionHitOutline);
        } else {
            this.interactionHitOutline = null;
        }
    }

    load() {
        return Promise.resolve();
    }

    intersectsInteractionRay(ray: THREE.Ray) {
        this.interactionHitBounds.setFromObject(this.interactionHitArea);

        if (this.interactionHitBounds.isEmpty()) {
            return false;
        }

        return ray.intersectBox(this.interactionHitBounds, this.interactionHitPoint) !== null;
    }

    dispose() {
        this.interactionHitArea.geometry.dispose();
        this.interactionHitArea.material.dispose();
        this.interactionHitArea.parent?.remove(this.interactionHitArea);

        if (this.interactionHitOutline) {
            this.interactionHitOutline.geometry.dispose();
            this.interactionHitOutline.material.dispose();
            this.interactionHitOutline.parent?.remove(this.interactionHitOutline);
        }

        this.clear();
    }
}
