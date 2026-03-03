import * as THREE from 'three'

export class GamePlayScene {
  private readonly container: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly cube: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private readonly clock = new THREE.Clock()

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.container.append(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#000000')

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100)
    this.camera.position.z = 4

    const ambientLight = new THREE.AmbientLight('#ffffff', 0.7)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight('#ffffff', 1.6)
    directionalLight.position.set(3, 4, 5)
    this.scene.add(directionalLight)

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.35,
        metalness: 0.05,
      }),
    )
    this.scene.add(this.cube)

    this.handleResize()
    window.addEventListener('resize', this.handleResize)
  }

  start() {
    this.renderer.setAnimationLoop(this.animate)
  }

  private readonly handleResize = () => {
    const width = window.innerWidth
    const height = window.innerHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(width, height)
  }

  private readonly animate = () => {
    const elapsed = this.clock.getElapsedTime()

    this.cube.rotation.x = elapsed * 0.7
    this.cube.rotation.y = elapsed * 1.1

    this.renderer.render(this.scene, this.camera)
  }
}
