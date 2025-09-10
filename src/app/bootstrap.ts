import * as THREE from "three/webgpu";

import {
  Fn,
  instanceIndex,
  uniform,
  instancedArray,
  hash,
  uint,
  vec4,
  If,
  uv,
  length,
  float,
  Loop,
  uniformArray,
  abs,
  pow,
  normalize,
  vec2,
  smoothstep,
  color,
  Switch,
} from "three/tsl";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

export function bootstrap() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -aspect,
    aspect,
    1,
    -1,
    0.01,
    100
  );
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGPURenderer();
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);
  renderer.setAnimationLoop(animate);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.SpriteNodeMaterial();

  //params
  const particleCount = 14000;
  let positionBuffer = instancedArray(particleCount, "vec2");
  let velocityBuffer = instancedArray(particleCount, "vec2");
  let typeBuffer = instancedArray(particleCount, "uint");
  //colors & scale
  const color0 = uniform(color("#ffffff"));
  const color1 = uniform(color("#4cff4c"));
  const color2 = uniform(color("#9900ff"));
  const color3 = uniform(color("#0099ff"));
  const color4 = uniform(color("#33ccff"));
  const color5 = uniform(color("#ffff00"));
  //scale
  const scale0 = uniform(0.02);
  const scale1 = uniform(0.02);
  const scale2 = uniform(0.01);
  const scale3 = uniform(0.015);
  const scale4 = uniform(0.015);
  const scale5 = uniform(0.02);
  //prettier-ignore
  const interactionMatrix = [
      0.2, 0.1, -0.1, 0.0, 0.03, 0.0,   //0番目の粒子
      0.03, 0.0, -0.2, 0.2, 0.1, 0.0,   //1番目の粒子
      0.1, 0.0, 0.0, 0.0, 0.0, -0.2,   //2番目の粒子
      0.0, 0.2, -0.2, 0.0, 0.03, 0.0,   //3番目の粒子
      0.03, 0.0, 0.0, 0.001, -0.001, 0.001,   //4番目の粒子
      0.001, 0.001, 0.001, 0.001, -0.3, 0.0,   //5番目の粒子
  ]
  const interactionMatrixNode = uniformArray(interactionMatrix, "float");
  const interactionRadiusNode = uniform(0.25);
  const transitionRadiusNode = uniform(0.45);
  const forceScaleNode = uniform(20.0);
  const timeScale = uniform(0.5);

  //createBuffers
  const init = Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const type = typeBuffer.element(instanceIndex);

    const initialPosition = vec2(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
        .sub(0.5)
        .mul(2.0 * aspect),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
        .sub(0.5)
        .mul(2.0)
    );
    const initialVelocity = vec2(0.0, 0.0);
    const rnd = hash(instanceIndex).mul(6.0).floor().toUint();

    pos.assign(initialPosition);
    vel.assign(initialVelocity);
    type.assign(rnd);
  });

  const initCompute = init().compute(particleCount);
  renderer.computeAsync(initCompute);

  //compute
  const update = Fn(() => {
    const delta = float(1 / 60)
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
      If(dist.greaterThan(0.001), () => {
        normal.assign(normalize(direction));
      }).Else(() => {
        normal.assign(normalize(vec2(0.1, 0.1)));
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
  });
  const updateCompute = update().compute(particleCount);

  material.positionNode = positionBuffer.toAttribute();
  material.colorNode = Fn(() => {
    const type = typeBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const speed = vel.length();
    const intensity = speed.mul(0.2).clamp(1.0, 4.0);
    let color = vec4(0.0, 0.0, 0.0, 1.0);

    // @ts-ignore
    Switch(type)
      // @ts-ignore
      .Case(uint(0), () => color.assign(color0))
      // @ts-ignore
      .Case(uint(1), () => color.assign(color1))
      // @ts-ignore
      .Case(uint(2), () => color.assign(color2))
      // @ts-ignore
      .Case(uint(3), () => color.assign(color3))
      // @ts-ignore
      .Case(uint(4), () => color.assign(color4))
      // @ts-ignore
      .Case(uint(5), () => color.assign(color5))
      .Default(() => color.assign(color0));

    return vec4(
      color.x.mul(intensity),
      color.y.mul(intensity),
      color.z.mul(intensity),
      1.0
    );
  })();

  material.scaleNode = Fn(() => {
    const type = typeBuffer.element(instanceIndex);

    let scale = float(scale0);
    If(type.equal(uint(0)), () => {
      scale.assign(scale0);
    })
      .ElseIf(type.equal(uint(1)), () => {
        scale.assign(scale1);
      })
      .ElseIf(type.equal(uint(2)), () => {
        scale.assign(scale2);
      })
      .ElseIf(type.equal(uint(3)), () => {
        scale.assign(scale3);
      })
      .ElseIf(type.equal(uint(4)), () => {
        scale.assign(scale4);
      })
      .ElseIf(type.equal(uint(5)), () => {
        scale.assign(scale5);
      });

    return scale;
  })();

  const shapeDonut = Fn(() => {
    const st = uv().sub(vec2(0.5)); // 中心を (0,0) にシフト
    const r = length(st); // 半径
    const outer = float(0.5); // 外半径
    const inner = float(0.25); // 内半径

    const ringOuter = r.lessThan(outer).select(float(1.0), float(0.0));
    const ringInner = r.greaterThan(inner).select(float(1.0), float(0.0));

    return ringOuter.mul(ringInner);
  });

  const shapeSmoothCircle = Fn(() => {
    const st = uv().sub(vec2(0.5));
    const r = length(st);
    const radius = float(0.5);
    const edge = float(0.4);

    const base = float(1.0).sub(smoothstep(radius.sub(edge), radius, r));

    return base.clamp(0.0, 1.0);
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

  //gui
  const gui = new GUI();
  const particleFolder = gui.addFolder("ParticleParams");
  const colorFolder = gui.addFolder("Color");
  const scaleFolder = gui.addFolder("Scale");

  particleFolder
    .add(timeScale, "value")
    .name("timeScale")
    .min(0.01)
    .max(1.0)
    .step(0.01);
  particleFolder
    .add(interactionRadiusNode, "value")
    .name("interactionRadiusNode")
    .min(0.01)
    .max(1.0)
    .step(0.01);
  particleFolder
    .add(transitionRadiusNode, "value")
    .name("transitionRadiusNode")
    .min(0.01)
    .max(1.0)
    .step(0.01);
  particleFolder
    .add(forceScaleNode, "value")
    .name("forceScaleNode")
    .min(1.0)
    .max(100.0)
    .step(0.01);
  scaleFolder
    .add(scale0, "value")
    .name("scale0")
    .min(0.01)
    .max(0.05)
    .step(0.001);
  scaleFolder
    .add(scale1, "value")
    .name("scale1")
    .min(0.01)
    .max(0.05)
    .step(0.001);
  scaleFolder
    .add(scale2, "value")
    .name("scale2")
    .min(0.01)
    .max(0.05)
    .step(0.001);
  scaleFolder
    .add(scale3, "value")
    .name("scale3")
    .min(0.01)
    .max(0.05)
    .step(0.001);
  scaleFolder
    .add(scale4, "value")
    .name("scale4")
    .min(0.01)
    .max(0.05)
    .step(0.001);
  scaleFolder
    .add(scale5, "value")
    .name("scale5")
    .min(0.01)
    .max(0.05)
    .step(0.001);

  colorFolder.addColor(color0, "value").name("color0");
  colorFolder.addColor(color1, "value").name("color1");
  colorFolder.addColor(color2, "value").name("color2");
  colorFolder.addColor(color3, "value").name("color3");
  colorFolder.addColor(color4, "value").name("color4");
  colorFolder.addColor(color5, "value").name("color5");

  window.addEventListener("resize", function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  function animate() {
    renderer.computeAsync(updateCompute);
    renderer.render(scene, camera);
  }
}
