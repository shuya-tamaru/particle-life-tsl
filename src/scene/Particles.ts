import { instancedArray } from "three/tsl";

export class Particles {
  public particleCount = 10000;
  private typeCount = 6;
  private boxSizes!: { x: number; y: number; z: number };

  private positions!: Float32Array;
  private velocities!: Float32Array;
  private types!: Uint32Array;

  private positionsBuffer!: ReturnType<typeof instancedArray>;
  private velocitiesBuffer!: ReturnType<typeof instancedArray>;
  private typesBuffer!: ReturnType<typeof instancedArray>;

  constructor(
    particleCount: number,
    boxSizes: { x: number; y: number; z: number }
  ) {
    this.particleCount = particleCount;
    this.boxSizes = boxSizes;
    this.init();
  }

  init() {
    this.createParticleData();
    this.createBuffers();
  }

  private createParticleData() {
    this.positions = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      this.positions[i * 3] = (Math.random() * 2 - 1) * this.boxSizes.x;
      this.positions[i * 3 + 1] = (Math.random() * 2 - 1) * this.boxSizes.y;
      this.positions[i * 3 + 2] = (Math.random() * 2 - 1) * this.boxSizes.z;
    }

    this.velocities = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      this.velocities[i * 3] = Math.random() * 2 - 1;
      this.velocities[i * 3 + 1] = Math.random() * 2 - 1;
      this.velocities[i * 3 + 2] = Math.random() * 2 - 1;
    }

    this.types = new Uint32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      this.types[i] = Math.floor(Math.random() * this.typeCount);
    }
  }

  private createBuffers() {
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.typesBuffer = instancedArray(this.particleCount, "uint");
  }

  getBuffers() {
    return {
      positions: this.positionsBuffer,
      velocities: this.velocitiesBuffer,
      types: this.typesBuffer,
    };
  }
}
