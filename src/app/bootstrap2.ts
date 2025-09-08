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
  vec2,
  smoothstep,
} from "three/tsl";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function bootstrap() {
  const particleCount = 14000;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  let positionBuffer = instancedArray(particleCount, "vec2");
  let velocityBuffer = instancedArray(particleCount, "vec2");
  let typeBuffer = instancedArray(particleCount, "uint");

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -aspect,
    aspect, // left, right
    1,
    -1, // top, bottom
    0.01,
    100 // near, far
  );
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGPURenderer();
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);
  renderer.setAnimationLoop(animate);

  window.addEventListener("resize", function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const init = Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const type = typeBuffer.element(instanceIndex);
    const basePos = vec2(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
        .sub(0.5)
        .mul(2.0 * aspect),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
        .sub(0.5)
        .mul(2.0)
    );
    pos.assign(basePos);

    const baseVel = vec2(0.0, 0.0); // とりあえず静止
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
    const vel = velocityBuffer.element(instanceIndex);
    const speed = vel.length();
    const intensity = speed.mul(0.2).clamp(1.0, 4.0);
    let color = vec4(0.0, 0.0, 0.0, 1.0);

    If(type.equal(uint(0)), () => {
      color.assign(vec4(1.0, 1.0, 1.0, 1.0)); // 白
    })
      .ElseIf(type.equal(uint(1)), () => {
        color.assign(vec4(0.3, 1.0, 0.3, 1.0)); // マゼンタ
      })
      .ElseIf(type.equal(uint(2)), () => {
        color.assign(vec4(0.6, 0.0, 1.0, 1.0)); // 紫
      })
      .ElseIf(type.equal(uint(3)), () => {
        color.assign(vec4(0.0, 0.6, 1.0, 1.0)); // エメラルド
      })
      .ElseIf(type.equal(uint(4)), () => {
        color.assign(vec4(0.2, 0.8, 1.0, 1.0)); // 蛍光イエロー
      })
      .Else(() => {
        color.assign(vec4(0.8, 1.0, 0.0, 1.0)); // ダークグリーン
      });

    return vec4(
      color.x.mul(intensity),
      color.y.mul(intensity),
      color.z.mul(intensity),
      1.0
    );
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
  const interactionRadiusNode = uniform(0.25);
  const transitionRadiusNode = uniform(0.45);
  const forceScaleNode = uniform(20.0);

  const timeScale = uniform(1.0);
  const update = Fn(() => {
    const delta = float(1 / 150)
      .mul(timeScale)
      .toVar();

    const pos_i = positionBuffer.element(instanceIndex);
    const vel_i = velocityBuffer.element(instanceIndex);
    const type_i = typeBuffer.element(instanceIndex);
    const force_i = vec2(0);
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
      let normal = vec2(0.0, 0.0);
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
    If(new_pos.x.greaterThan(float(1.2 * aspect)), () => {
      new_pos.assign(vec2(-1.2 * aspect, new_pos.y));
    })
      .ElseIf(new_pos.x.lessThan(float(-1.2 * aspect)), () => {
        new_pos.assign(vec2(1.2 * aspect, new_pos.y));
      })
      .ElseIf(new_pos.y.greaterThan(float(1.2)), () => {
        new_pos.assign(vec2(new_pos.x, -1.2));
      })
      .ElseIf(new_pos.y.lessThan(float(-1.2)), () => {
        new_pos.assign(vec2(new_pos.x, 1.2));
      });
    vel_i.assign(new_vel);
    pos_i.assign(new_pos);

    // return pos_i;
  });

  const updateCompute = update().compute(particleCount);

  renderer.computeAsync(initCompute);

  material.scaleNode = Fn(() => {
    const type = typeBuffer.element(instanceIndex);

    // 各 type ごとのスケール
    const s0 = float(0.02); // type 0
    const s1 = float(0.02); // type 1
    const s2 = float(0.01); // type 2
    const s3 = float(0.015); // type 3
    const s4 = float(0.012); // type 4
    const s5 = float(0.02); // type 5

    // 条件分岐 (selectで書くとGPU的に効率的)
    let scale = s0;
    If(type.equal(uint(0)), () => {
      scale.assign(s0);
    })
      .ElseIf(type.equal(uint(1)), () => {
        scale.assign(s1);
      })
      .ElseIf(type.equal(uint(2)), () => {
        scale.assign(s2);
      })
      .ElseIf(type.equal(uint(3)), () => {
        scale.assign(s3);
      })
      .ElseIf(type.equal(uint(4)), () => {
        scale.assign(s4);
      })
      .ElseIf(type.equal(uint(5)), () => {
        scale.assign(s5);
      });

    return scale;
  })();

  const shapeDonut = Fn(() => {
    const st = uv().sub(vec2(0.5)); // 中心を (0,0) にシフト
    const r = length(st); // 半径
    const outer = float(0.5); // 外半径
    const inner = float(0.2); // 内半径

    // smoothstepで輪郭を柔らかくする
    const edgeOuter = outer.sub(0.05);
    const edgeInner = inner.add(0.05);

    const ringOuter = r.lessThan(outer).select(float(1.0), float(0.0));
    const ringInner = r.greaterThan(inner).select(float(1.0), float(0.0));

    return ringOuter.mul(ringInner);
  });

  const shapeSmoothCircle = Fn(() => {
    const st = uv().sub(vec2(0.5)); // 中心を (0,0) に
    const r = length(st); // 半径
    const radius = float(0.5); // 円の半径
    const edge = float(0.05); // フェード幅

    // 0〜1のフェード付きマスク
    const base = float(1.0).sub(smoothstep(radius.sub(edge), radius, r));

    // Intensity を掛けて返す（最大は1.0にClampしてもよい）
    return base.mul(2.0).clamp(0.0, 1.0);
  });

  material.opacityNode = Fn(() => {
    const type = typeBuffer.element(instanceIndex);

    const circle = shapeSmoothCircle(); // スムーズ円
    const donut = shapeDonut(); // ドーナツ

    const isDonut = type.greaterThan(uint(2));
    const mask = isDonut.select(donut, circle);

    return mask.mul(1.0);
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
