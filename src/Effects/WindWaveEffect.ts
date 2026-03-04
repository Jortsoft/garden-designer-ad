import * as THREE from 'three';
import type { WindStreak } from '../Models/WindWave.model';
import { WIND_STREAK_SHADER } from '../Shaders/WindStreak.shader';

const STREAK_COUNT = 1300;
const BASE_WIND_DIRECTION = new THREE.Vector2(0.95, 0.24).normalize();
const TRAVEL_HALF_DISTANCE = 4.3;
const LATERAL_SPAWN_SPREAD = 2.3;

export class WindWaveSystem extends THREE.Group {
    private readonly streakGeometry = new THREE.PlaneGeometry(1, 1);
    private readonly windStreaks: WindStreak[];
    private readonly tempPosition = new THREE.Vector3();
    private readonly center = new THREE.Vector3(0, 0, 0);
    private readonly random = Math.random;

    private elapsedTime = 0;

    constructor() {
        super();
        this.name = 'WindWaveSystem';
        this.windStreaks = Array.from({ length: STREAK_COUNT }, (_, index) =>
            this.createWindStreak(index),
        );
    }

    initialize() {
        this.elapsedTime = 0;
    }

    update(deltaSeconds: number) {
        this.elapsedTime += deltaSeconds;

        for (const streak of this.windStreaks) {
            streak.elapsed += deltaSeconds;

            if (streak.elapsed < 0) {
                streak.mesh.visible = false;
                continue;
            }

            const progress = streak.duration <= 0 ? 1 : streak.elapsed / streak.duration;

            if (progress >= 1) {
                this.resetWindStreak(streak);
                continue;
            }

            streak.mesh.visible = true;

            const fadeIn = THREE.MathUtils.smoothstep(progress, 0, 0.14);
            const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.72, 1);
            const visibility = fadeIn * fadeOut;
            const wobble =
                Math.sin(
                    this.elapsedTime * streak.wobbleFrequency + streak.wobblePhaseOffset,
                ) * streak.wobbleAmplitude;

            this.tempPosition.lerpVectors(
                streak.startPosition,
                streak.endPosition,
                progress,
            );
            this.tempPosition.x += streak.perpendicular.x * wobble;
            this.tempPosition.z += streak.perpendicular.y * wobble;
            this.tempPosition.y =
                streak.baseY +
                Math.sin(
                    this.elapsedTime * streak.wobbleFrequency * 0.6 +
                    streak.wobblePhaseOffset,
                ) *
                0.003;

            streak.mesh.position.copy(this.tempPosition);
            streak.material.uniforms.opacity.value = streak.baseOpacity * visibility;
        }
    }

    dispose() {
        for (const streak of this.windStreaks) {
            streak.material.dispose();
            this.remove(streak.mesh);
        }

        this.streakGeometry.dispose();
    }

    private createWindStreak(index: number) {
        const material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(WIND_STREAK_SHADER.uniforms),
            vertexShader: WIND_STREAK_SHADER.vertexShader,
            fragmentShader: WIND_STREAK_SHADER.fragmentShader,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });

        material.toneMapped = false;

        const mesh = new THREE.Mesh(this.streakGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 3 + (index % 3);
        mesh.frustumCulled = false;
        mesh.visible = false;

        this.add(mesh);

        const streak: WindStreak = {
            mesh,
            material,
            startPosition: new THREE.Vector3(),
            endPosition: new THREE.Vector3(),
            direction: new THREE.Vector2(),
            perpendicular: new THREE.Vector2(),
            baseOpacity: 0.05,
            baseY: 0.09,
            duration: 1,
            elapsed: 0,
            wobbleAmplitude: 0,
            wobbleFrequency: 0,
            wobblePhaseOffset: 0,
        };

        this.resetWindStreak(streak, index * 0.09);

        return streak;
    }

    private resetWindStreak(streak: WindStreak, initialDelay = this.randomRange(0, 0.42)) {
        const angleJitter = this.randomRange(-0.12, 0.12);
        const angle = Math.atan2(BASE_WIND_DIRECTION.y, BASE_WIND_DIRECTION.x) + angleJitter;
        const directionX = Math.cos(angle);
        const directionZ = Math.sin(angle);

        streak.direction.set(directionX, directionZ);
        streak.perpendicular.set(-directionZ, directionX);

        const lateralOffset = this.randomRange(-LATERAL_SPAWN_SPREAD, LATERAL_SPAWN_SPREAD);
        const startDistance = TRAVEL_HALF_DISTANCE + this.randomRange(0.7, 1.6);
        const endDistance = TRAVEL_HALF_DISTANCE + this.randomRange(0.7, 1.8);
        const endLateralOffset = lateralOffset + this.randomRange(-0.22, 0.22);
        const length = this.randomRange(0.55, 1.05);
        const width = this.randomRange(0.018, 0.042);
        const speed = this.randomRange(1.6, 2.7);
        const travelDistance = startDistance + endDistance;

        streak.baseOpacity = this.randomRange(0.03, 0.072);
        streak.baseY = this.randomRange(0.08, 0.14);
        streak.duration = travelDistance / speed;
        streak.elapsed = -initialDelay;
        streak.wobbleAmplitude = this.randomRange(0.025, 0.085);
        streak.wobbleFrequency = this.randomRange(1.2, 2.4);
        streak.wobblePhaseOffset = this.randomRange(0, Math.PI * 2);

        streak.mesh.scale.set(length, width, 1);
        streak.mesh.rotation.y = angle;

        streak.material.uniforms.color.value = new THREE.Color(
            this.pickTintColor(),
        );
        streak.material.uniforms.opacity.value = 0;

        streak.startPosition.set(
            this.center.x - streak.direction.x * startDistance + streak.perpendicular.x * lateralOffset,
            streak.baseY,
            this.center.z - streak.direction.y * startDistance + streak.perpendicular.y * lateralOffset,
        );
        streak.endPosition.set(
            this.center.x + streak.direction.x * endDistance + streak.perpendicular.x * endLateralOffset,
            streak.baseY,
            this.center.z + streak.direction.y * endDistance + streak.perpendicular.y * endLateralOffset,
        );

        streak.mesh.position.copy(streak.startPosition);
        streak.mesh.visible = false;
    }

    private pickTintColor() {
        const colors = ['#ffffff', '#f6fff3', '#eefdea', '#f8fff8'] as const;

        return colors[Math.floor(this.random() * colors.length)];
    }

    private randomRange(min: number, max: number) {
        return THREE.MathUtils.lerp(min, max, this.random());
    }
}
