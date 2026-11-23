import * as T from "game/lib/three.module.js";
import {SparkRenderer, SplatMesh, dyno} from "game/lib/spark-2.4.0/spark.module.js";
import {getBackgroundSplats} from "game/src/background-splat-data.js";
import {StaticArenaSplats} from "game/src/static-splat-depth.js";

// Spark stores splat RGB in display space and decodes it with gamma 2.2 when
// drawing into the game's linear HDR composer buffer.
const encode = linear => Math.pow(Math.max(0, linear), 1 / 2.2);

export function addBackgroundSplats(scene, renderer, onDirty, ultra=true, live=false) {
  const data = getBackgroundSplats(scene,ultra);
  const leafLight = dyno.dynoMat3(new T.Matrix3().set(1,1,1,1,1,1,1,1,1));
  const duskBlend = dyno.dynoFloat(0);
  const masonryStart=data.layers.leaves+(data.layers.ash||0);
  const masonryEnd=masonryStart+(data.layers.masonry||0)+(data.layers.stoneChips||0);
  const relight = dyno.dynoBlock({gsplat:dyno.Gsplat}, {gsplat:dyno.Gsplat}, ({gsplat}) => {
    return dyno.dyno({
      inTypes:{leaf:dyno.Gsplat, normal:'vec3', light:'mat3', dusk:'float'},
      inputs:{leaf:gsplat, normal:dyno.gsplatNormal(gsplat), light:leafLight, dusk:duskBlend},
      outTypes:{gsplat:dyno.Gsplat},
      statements:({inputs,outputs}) => [
        `${outputs.gsplat} = ${inputs.leaf};`,
        `vec3 e = ${inputs.light} * (${inputs.normal} * ${inputs.normal});`,
        `if (${inputs.leaf}.index < ${data.layers.leaves}) e=mix(e,clamp(e,vec3(.27,.29,.25),vec3(.59,.63,.55)),${inputs.dusk});`,
        `if (${inputs.leaf}.index >= ${masonryStart} && ${inputs.leaf}.index < ${masonryEnd}) e=mix(vec3(dot(e,vec3(.24,.63,.13))),e,.26);`,
        `${outputs.gsplat}.rgba.rgb *= pow(max(e, vec3(.001)), vec3(1./2.2));`
      ]
    }).outputs;
  });
  const splats = new SplatMesh({
    maxSplats: data.count,
    objectModifier: relight,
    editable: false,
    raycastable: false,
    constructSplats(packed) {
      const center = new T.Vector3(), sigma = new T.Vector3();
      const rotation = new T.Quaternion(), rgb = new T.Color();
      for (let i = 0; i < data.count; i++) {
        const j = i * 3;
        center.fromArray(data.means, j);
        sigma.fromArray(data.sigmas, j);
        rotation.fromArray(data.quaternions, i * 4);
        rgb.setRGB(encode(data.colors[j]), encode(data.colors[j+1]), encode(data.colors[j+2]));
        packed.pushSplat(center, sigma, rotation, data.opacities[i], rgb);
      }
    }
  });
  const options = {renderer, onDirty, enableLod: false, depthTest: true, depthWrite: false};
  const spark = live ? new StaticArenaSplats(options, splats, data) : new SparkRenderer(options);
  spark.name = 'background-gaussian-renderer';
  splats.name = 'arena-surface-gaussians';
  // Draw after the opaque trunk, pillars and actors, before nearer transparent
  // effects. Opaque geometry supplies the depth buffer for their silhouettes.
  spark.renderOrder = -2;
  scene.add(splats, spark);
  let lastPhase = -1;
  return {
    spark, splats, count: data.count, layers: data.layers, ready: splats.initialized,
    setPhase(phase) {
      const probes = scene.userData.leafIrradiance;
      if (!probes?.[0] || !probes[1] || phase === lastPhase) return;
      lastPhase = phase;
      const k = T.MathUtils.smoothstep(phase, 0, 1);
      // Expose both linear probes against the same daylight grey so dusk
      // keeps its lower energy and its own colour. Normal axes are in world space.
      duskBlend.value=k;
      const day = probes[0].elements, dusk = probes[1].elements;
      const daylight = (day[1] + day[4] + day[7]) / 3;
      for (let i=0;i<9;i++) {
        leafLight.value.elements[i] = .14 + .86 * T.MathUtils.lerp(day[i],dusk[i],k) / Math.max(.001,daylight);
      }
      splats.updateVersion();
      onDirty?.();
    }
  };
}
