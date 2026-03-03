import * as THREE from 'three';
import { GameConfig } from '../Managers/GameConfig';
import { WorldManager } from '../Managers/WorldManager';

export class GamePlayScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly worldManager: WorldManager;
  private readonly frameClock = new THREE.Clock();
  private readonly frameDuration = GameConfig.Fps > 0 ? 1 / GameConfig.Fps : 0;
  private readonly isCoarsePointerDevice =
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  private accumulatedFrameTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isCoarsePointerDevice && window.devicePixelRatio <= 1.5,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isCoarsePointerDevice ? 1 : 1.5),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.isCoarsePointerDevice;
    this.renderer.domElement.style.touchAction = 'none';
    this.container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#00b5f7');

    this.worldManager = new WorldManager(
      this.scene,
      this.renderer.domElement,
      this.renderer,
    );
    this.worldManager.initialize();

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  start() {
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  private readonly handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height, false);
    this.worldManager.updateViewport(width, height);
  };

  private readonly renderFrame = () => {
    const rawDeltaSeconds = this.frameClock.getDelta();
    const deltaSeconds = this.getFrameDelta(rawDeltaSeconds);

    if (deltaSeconds === null) {
      return;
    }

    this.worldManager.update(deltaSeconds);
    this.worldManager.render();
  };

  private getFrameDelta(rawDeltaSeconds: number) {
    if (this.frameDuration <= 0) {
      return rawDeltaSeconds;
    }

    this.accumulatedFrameTime += rawDeltaSeconds;

    if (this.accumulatedFrameTime < this.frameDuration) {
      return null;
    }

    this.accumulatedFrameTime -= this.frameDuration;

    return this.frameDuration;
  }
}
