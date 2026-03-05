import * as THREE from 'three';
import { GameConfig } from '../Managers/GameConfig';
import { LoaderOverlay } from '../Systems/LoaderOverlay';
import { WorldManager } from '../Managers/WorldManager';
import { hasCoarsePointerDevice } from '../Utils/hasCoarsePointerDevice';

export class GamePlayScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly worldManager: WorldManager;
  private readonly loaderOverlay: LoaderOverlay;
  private readonly frameClock = new THREE.Clock();
  private readonly frameDuration = GameConfig.Fps > 0 ? 1 / GameConfig.Fps : 0;
  private readonly isCoarsePointerDevice = hasCoarsePointerDevice();
  private accumulatedFrameTime = 0;
  private isDisposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isCoarsePointerDevice && window.devicePixelRatio <= 1.5,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isCoarsePointerDevice ? 1.5 : 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = GameConfig.enableShadow;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    this.container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#00b5f7');

    this.worldManager = new WorldManager(
      this.scene,
      this.renderer.domElement,
      this.renderer,
    );
    this.loaderOverlay = new LoaderOverlay(this.renderer);

    const worldReadyPromise = this.worldManager.initialize();

    this.loaderOverlay.initialize(worldReadyPromise);

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  start() {
    if (this.isDisposed) {
      return;
    }

    this.renderer.setAnimationLoop(this.renderFrame);
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    this.worldManager.dispose();
    this.loaderOverlay.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private readonly handleResize = () => {
    if (this.isDisposed) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height, false);
    this.worldManager.updateViewport(width, height);
    this.loaderOverlay.updateViewport(width, height);
  };

  private readonly renderFrame = () => {
    if (this.isDisposed) {
      return;
    }

    const rawDeltaSeconds = this.frameClock.getDelta();
    const deltaSeconds = this.getFrameDelta(rawDeltaSeconds);

    if (deltaSeconds === null) {
      return;
    }

    this.worldManager.update(deltaSeconds);
    this.loaderOverlay.update(deltaSeconds);
    this.worldManager.render();
    this.loaderOverlay.render();
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
