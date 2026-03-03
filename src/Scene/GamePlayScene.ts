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
  private accumulatedFrameTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#000000');

    this.worldManager = new WorldManager(this.scene, this.renderer.domElement);
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

    this.renderer.setSize(width, height);
    this.worldManager.updateViewport(width / height);
  };

  private readonly renderFrame = () => {
    const rawDeltaSeconds = this.frameClock.getDelta();
    const deltaSeconds = this.getFrameDelta(rawDeltaSeconds);

    if (deltaSeconds === null) {
      return;
    }

    this.worldManager.update(deltaSeconds);
    this.renderer.render(this.scene, this.worldManager.camera);
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
