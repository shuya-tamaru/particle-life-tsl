import * as THREE from "three/webgpu";
import {
  Fn,
  instanceIndex,
  uniform,
  instancedArray,
  vec3,
  hash,
  uint,
  vec4,
  If,
  uv,
  length,
  shapeCircle,
  float,
  Loop,
  uniformArray,
  abs,
  pow,
  compute,
  normalize,
} from "three/tsl";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function bootstrap() {
  const particleCount = 10000;
  const boxSize = 10.0;
  let positionBuffer = instancedArray(particleCount, "vec3");
  let velocityBuffer = instancedArray(particleCount, "vec3");
  let typeBuffer = instancedArray(particleCount, "uint");

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );
  camera.position.set(10, 10, 10);

  const renderer = new THREE.WebGPURenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  renderer.setAnimationLoop(animate);

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const init = Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const type = typeBuffer.element(instanceIndex);
    const basePos = vec3(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
    )
      .sub(0.5)
      .mul(vec3(boxSize));
    pos.assign(basePos);

    const baseVel = vec3(0.0, 0.0, 0.0); // とりあえず静止
    vel.assign(baseVel);

    const rnd = hash(instanceIndex).mul(6.0).floor().toUint();
    type.assign(rnd);
  });
  const initCompute = init().compute(particleCount);
  renderer.computeAsync(initCompute);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.positionNode = positionBuffer.toAttribute();

  material.colorNode = Fn(() => {
    const type = typeBuffer.element(instanceIndex);
    let color = vec4(0.0, 0.0, 0.0, 1.0);

    If(type.equal(uint(0)), () => {
      color.assign(vec4(1.0, 1.0, 1.0, 1.0)); // 白
    })
      .ElseIf(type.equal(uint(1)), () => {
        color.assign(vec4(0.57, 0.09, 0.4, 1.0)); // マゼンタ
      })
      .ElseIf(type.equal(uint(2)), () => {
        color.assign(vec4(0.38, 0.2, 0.8, 1.0)); // 紫
      })
      .ElseIf(type.equal(uint(3)), () => {
        color.assign(vec4(0.2, 1.0, 0.7, 1.0)); // エメラルド
      })
      .ElseIf(type.equal(uint(4)), () => {
        color.assign(vec4(1.0, 1.0, 0.3, 1.0)); // 蛍光イエロー
      })
      .Else(() => {
        color.assign(vec4(0.13, 0.03, 0.9, 1.0)); // ダークグリーン
      });

    return color;
  })();

  //prettier-ignore
  const interactionMatrix = [
    0.2, 0.1, -0.1, 0.0, 0.03, 0.0,   //0番目の粒子
    0.03, 0.0, -0.2, 0.2, 0.1, 0.0,   //1番目の粒子
    0.1, 0.0, 0.0, 0.0, 0.0, -0.2,   //2番目の粒子
    0.0, -0.2, 0.2, 0.0, 0.03, 0.0,   //3番目の粒子
    0.03, 0.0, 0.0, 0.001, 0.001, 0.001,   //4番目の粒子
    0.001, 0.001, 0.001, 0.001, 0.3, 0.0,   //5番目の粒子
  ]
  const interactionMatrixNode = uniformArray(interactionMatrix, "float");
  const interactionRadiusNode = uniform(3.5);
  const transitionRadiusNode = uniform(0.45);
  const forceScaleNode = uniform(10.0);

  const timeScale = uniform(0.8);
  const update = Fn(() => {
    const delta = float(1 / 60)
      .mul(timeScale)
      .toVar();

    const pos_i = positionBuffer.element(instanceIndex);
    const vel_i = velocityBuffer.element(instanceIndex);
    const type_i = typeBuffer.element(instanceIndex);
    const force_i = vec3(0);
    const typeCount = 6;

    let indexNode = uint(0);
    Loop(particleCount, () => {
      If(indexNode.equal(instanceIndex), () => {
        indexNode.assign(indexNode.add(uint(1)));
        return;
      });
      const pos_j = positionBuffer.element(indexNode);
      const type_j = typeBuffer.element(indexNode);
      const dist = pos_j.sub(pos_i).length();
      If(dist.greaterThan(interactionRadiusNode), () => {
        indexNode.assign(indexNode.add(uint(1)));
        return;
      });
      const direction = pos_j.sub(pos_i);
      let normal = vec3(0.0, 0.0, 0.0);
      If(dist.greaterThan(0.000001), () => {
        normal.assign(normalize(direction));
      });
      const idx = type_i.mul(uint(typeCount)).add(type_j);
      const k = interactionMatrixNode.element(idx);
      const r = dist.div(interactionRadiusNode);
      const beta = transitionRadiusNode;
      let w = float(0.0);
      If(r.lessThan(beta), () => {
        w.assign(r.div(beta).sub(1.0));
      })
        .ElseIf(r.lessThan(1.0), () => {
          const oneminusbeta = float(1.0).sub(beta);
          const absolute = abs(float(2.0).mul(r).sub(1.0).sub(beta)).div(
            oneminusbeta
          );
          w.assign(k.mul(float(1.0).sub(absolute)));
        })
        .Else(() => {
          w.assign(float(0.0));
        });

      force_i.assign(force_i.add(normal.mul(w).mul(forceScaleNode)));
      indexNode.assign(indexNode.add(uint(1)));
    });

    const frictionFactor = pow(float(0.5), delta.div(delta.mul(2.0)));

    let new_vel = vel_i.add(force_i.mul(delta));
    new_vel.assign(new_vel.mul(frictionFactor));

    const new_pos = pos_i.add(new_vel.mul(delta));
    If(new_pos.x.greaterThan(float(boxSize / 2)), () => {
      new_pos.assign(vec3(-boxSize / 2, new_pos.y, new_pos.z));
    })
      .ElseIf(new_pos.x.lessThan(float(-boxSize / 2)), () => {
        new_pos.assign(vec3(boxSize / 2, new_pos.y, new_pos.z));
      })
      .ElseIf(new_pos.y.greaterThan(float(boxSize / 2)), () => {
        new_pos.assign(vec3(new_pos.x, -boxSize / 2, new_pos.z));
      })
      .ElseIf(new_pos.y.lessThan(float(-boxSize / 2)), () => {
        new_pos.assign(vec3(new_pos.x, boxSize / 2, new_pos.z));
      })
      .ElseIf(new_pos.z.greaterThan(float(boxSize / 2)), () => {
        new_pos.assign(vec3(new_pos.x, new_pos.y, -boxSize / 2));
      })
      .ElseIf(new_pos.z.lessThan(float(-boxSize / 2)), () => {
        new_pos.assign(vec3(new_pos.x, new_pos.y, boxSize / 2));
      });
    vel_i.assign(new_vel);
    pos_i.assign(new_pos);
    If(new_vel.length().lessThan(10.0), () => {});

    // return pos_i;
  });

  const updateCompute = update().compute(particleCount);

  renderer.computeAsync(initCompute);

  material.scaleNode = uniform(0.08);

  material.opacityNode = Fn(() => {
    const vel = velocityBuffer.toAttribute();
    const speed = vel.length();

    const threshold = float(2.0); // しきい値（ここを調整）

    // speed < threshold のとき 0.0、そうでなければ 1.0
    const alpha = speed.greaterThan(threshold).select(float(1.0), float(0.0));

    return shapeCircle().mul(alpha); // 丸マスク × α
  })();

  material.transparent = true;
  const mesh = new THREE.InstancedMesh(geometry, material, particleCount);
  scene.add(mesh);

  function animate() {
    controls.update();
    renderer.computeAsync(updateCompute);
    renderer.render(scene, camera);
  }
}
