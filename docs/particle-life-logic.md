# Particle Life Logic Documentation

## Overview

このドキュメントでは、Particle Life シミュレーションのコアロジック部分、特に `computeShader` の `update` 関数について詳しく説明します。

## Update Compute Shader

パーティクルの位置と速度を更新するメインロジックです。

### 基本構造

```typescript
const update = Fn(() => {
  // デルタタイム計算
  const delta = float(1 / 60)
    .mul(timeScale)
    .toVar();

  // 現在のパーティクルの状態を取得
  const pos_i = positionBuffer.element(instanceIndex);
  const vel_i = velocityBuffer.element(instanceIndex);
  const type_i = typeBuffer.element(instanceIndex);
  const force_i = vec2(0);
  const typeCount = 6;

  // 他のパーティクルとの相互作用を計算
  // ...

  // 速度と位置を更新
  // ...

  // 境界条件の処理
  // ...
});
```

### 1. パーティクル間相互作用の計算

```typescript
let indexNode = uint(0);
Loop(particleCount, () => {
  // 自分自身はスキップ
  If(indexNode.equal(instanceIndex), () => {
    indexNode.assign(indexNode.add(uint(1)));
    return;
  });

  // 他のパーティクルとの距離を計算
  const pos_j = positionBuffer.element(indexNode);
  const type_j = typeBuffer.element(indexNode);
  const dist = pos_j.sub(pos_i).length();

  // 相互作用半径外のパーティクルはスキップ
  If(dist.greaterThan(interactionRadiusNode), () => {
    indexNode.assign(indexNode.add(uint(1)));
    return;
  });

  // 力の計算...
});
```

### 2. 力の計算

```typescript
// 方向ベクトルの計算
const direction = pos_j.sub(pos_i);
let normal = vec2(0.0, 0.0);

// 正規化（ゼロ除算回避）
If(dist.greaterThan(0.001), () => {
  normal.assign(normalize(direction));
}).Else(() => {
  normal.assign(normalize(vec2(0.1, 0.1)));
});

// 相互作用マトリックスから力の係数を取得
const idx = type_i.mul(uint(typeCount)).add(type_j);
const k = interactionMatrixNode.element(idx);

// 正規化された距離
const r = dist.div(interactionRadiusNode);
const beta = transitionRadiusNode;
```

### 3. 力の重み計算

パーティクル間の距離に基づいて力の重みを計算します：

```typescript
let w = float(0.0);

// 近距離: 斥力
If(r.lessThan(beta), () => {
  w.assign(r.div(beta).sub(1.0));
})
  // 中距離: 引力/斥力の遷移
  .ElseIf(r.lessThan(1.0), () => {
    const oneminusbeta = float(1.0).sub(beta);
    const absolute = abs(float(2.0).mul(r).sub(1.0).sub(beta)).div(
      oneminusbeta
    );
    w.assign(k.mul(float(1.0).sub(absolute)));
  })
  // 遠距離: 力なし
  .Else(() => {
    w.assign(float(0.0));
  });

// 力を累積
force_i.assign(force_i.add(normal.mul(w).mul(forceScaleNode)));
```

### 4. 速度と位置の更新

```typescript
// 摩擦力の適用
const frictionFactor = pow(float(0.5), delta.div(delta.mul(2.0)));

// 新しい速度 = 古い速度 + 力 * デルタタイム
let new_vel = vel_i.add(force_i.mul(delta));
new_vel.assign(new_vel.mul(frictionFactor));

// 新しい位置 = 古い位置 + 速度 * デルタタイム
const new_pos = pos_i.add(new_vel.mul(delta));
```

### 5. 境界条件の処理

画面端でのラップアラウンド処理：

```typescript
// X軸の境界処理
If(new_pos.x.greaterThan(float(1.2 * aspect)), () => {
  new_pos.assign(vec2(-1.2 * aspect, new_pos.y));
})
  .ElseIf(new_pos.x.lessThan(float(-1.2 * aspect)), () => {
    new_pos.assign(vec2(1.2 * aspect, new_pos.y));
  })

  // Y軸の境界処理
  .ElseIf(new_pos.y.greaterThan(float(1.2)), () => {
    new_pos.assign(vec2(new_pos.x, -1.2));
  })
  .ElseIf(new_pos.y.lessThan(float(-1.2)), () => {
    new_pos.assign(vec2(new_pos.x, 1.2));
  });

// バッファに結果を書き戻し
vel_i.assign(new_vel);
pos_i.assign(new_pos);
```

## パラメータの説明

- **`interactionRadiusNode`**: パーティクル間相互作用の最大距離
- **`transitionRadiusNode`** (`beta`): 斥力から引力への遷移点
- **`interactionMatrixNode`**: パーティクルタイプ間の相互作用強度マトリックス
- **`forceScaleNode`**: 力の全体的なスケール係数
- **`timeScale`**: シミュレーション速度の調整

## 力の関数

距離 `r` (正規化済み) に対する力の重み `w` は以下のように計算されます：

- `r < beta`: `w = r/beta - 1` (斥力、距離が近いほど強い)
- `beta ≤ r < 1`: `w = k * (1 - |2r - 1 - beta| / (1 - beta))` (引力/斥力の遷移)
- `r ≥ 1`: `w = 0` (力なし)

この設計により、パーティクル間に複雑な引力・斥力関係が生まれ、生命のような動的パターンが創発します。
