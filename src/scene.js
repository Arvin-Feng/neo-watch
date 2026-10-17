import Globe from 'globe.gl';
import * as THREE from 'three';
import { hashId } from './data.js';

const COLORS = { normal: 0x22d3ee, hazard: 0xff405c };

export async function createScene(container, { onSelect, onNotice, onReady, reducedMotion = false }) {
  let world;
  const stub = { setData() {}, select() {}, setPaused() {}, reset() {}, available: false };
  try {
    world = new Globe(container, { animateIn: false, rendererConfig: { antialias: true, alpha: true } });
  } catch {
    onNotice('此设备暂不支持 WebGL。你仍可通过目标列表查看全部数据。');
    onReady();
    return stub;
  }
  let groups = new Map();
  let selectedId = null;
  let paused = reducedMotion;
  const globeRadius = world.getGlobeRadius();
  world.backgroundColor('rgba(0,0,0,0)').showAtmosphere(true)
    .atmosphereColor('#62aaff').atmosphereAltitude(0.16)
    .enablePointerInteraction(true)
    .customLayerLabel(item => {
      const box = document.createElement('div');
      box.className = 'globe-tooltip';
      box.textContent = `${item.name} · ${item.distanceLD === null ? '距离暂无数据' : `${item.distanceLD.toFixed(2)} LD`} · ${item.hazardous ? '潜在危险' : '普通目标'}`;
      return box;
    })
    .customThreeObject(item => {
      const group = new THREE.Group();
      let seed = hashId(item.id);
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      const r = item.radius * globeRadius;
      const orientation = new THREE.Euler(Math.PI / 2 + (random() - .5) * 1.5, (random() - .5) * 1.2, random() * Math.PI);
      const phase = random() * Math.PI * 2;
      const path = Array.from({ length: 160 }, (_, i) => {
        const angle = i / 160 * Math.PI * 2;
        return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), 0).applyEuler(orientation);
      });
      const color = item.hazardous ? COLORS.hazard : COLORS.normal;
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(path),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: item.hazardous ? .42 : .27 }));
      ring.raycast = () => {};
      group.add(ring);
      const marker = new THREE.Group();
      marker.position.copy(new THREE.Vector3(r * Math.cos(phase), r * Math.sin(phase), 0).applyEuler(orientation));
      const core = new THREE.Mesh(new THREE.SphereGeometry(item.hazardous ? 2.8 : 2.2, 16, 12),
        new THREE.MeshBasicMaterial({ color }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(item.hazardous ? 6 : 5, 20, 16),
        new THREE.ShaderMaterial({
          uniforms: { color: { value: new THREE.Color(color) } },
          vertexShader: 'varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }',
          fragmentShader: 'uniform vec3 color; varying vec3 n; varying vec3 v; void main(){ float a=pow(max(0.0,dot(normalize(n),normalize(v))),3.0)*0.6; gl_FragColor=vec4(color,a); }',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
      halo.raycast = () => {};
      const hit = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, color }));
      marker.add(core, halo, hit);
      group.add(marker);
      group.userData = { ring, marker, hazardous: item.hazardous, radius: item.radius };
      groups.set(item.id, group);
      return group;
    })
    .customThreeObjectUpdate((group, item) => {
      groups.set(item.id, group);
      group.userData.marker.scale.setScalar(item.id === selectedId ? 1.6 : 1);
      group.userData.ring.material.opacity = item.id === selectedId ? .9 : (item.hazardous ? .42 : .27);
    })
    .onCustomLayerClick(item => onSelect(item.id))
    .onCustomLayerHover(item => { container.style.cursor = item ? 'pointer' : 'grab'; });

  const controls = world.controls();
  controls.autoRotate = !paused;
  controls.autoRotateSpeed = .18;
  controls.enablePan = false;
  controls.minDistance = 260;
  controls.maxDistance = 1250;
  const renderer = world.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const ambient = new THREE.AmbientLight(0x9cc8ff, .75);
  const sunlight = new THREE.DirectionalLight(0x98bfff, .8);
  sunlight.position.set(-100, 140, 160);
  world.lights([ambient, sunlight]);
  const material = world.globeMaterial();
  material.color.set('#17334b');
  material.shininess = 12;
  let narrow = container.clientWidth < 700;
  const home = () => ({ lat: 20, lng: 110, altitude: container.clientWidth < 700 ? 5.2 : 2.65 });
  function resize() {
    world.width(container.clientWidth).height(container.clientHeight);
    const nowNarrow = container.clientWidth < 700;
    if (nowNarrow !== narrow) { narrow = nowNarrow; world.pointOfView(home(), 0); }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  world.pointOfView(home(), 0);
  container.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    onNotice('三维视野暂时中断，请刷新页面；目标列表与详情仍可使用。');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) world.pauseAnimation(); else world.resumeAnimation();
  });

  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL;
  const textures = await Promise.allSettled([
    loader.loadAsync(`${base}assets/earth-day.jpg`),
    loader.loadAsync(`${base}assets/earth-lights.jpg`),
  ]);
  if (textures[0].status === 'fulfilled') {
    material.map = textures[0].value;
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.color.set('#425e7d');
  }
  if (textures[1].status === 'fulfilled') {
    material.emissiveMap = textures[1].value;
    material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    material.emissive.set('#fff1cf');
    material.emissiveIntensity = 1.8;
  }
  if (textures.some(t => t.status === 'rejected')) onNotice('部分地球纹理未能加载，已保留基础地球。目标数据仍可查看。');
  material.needsUpdate = true;
  if (textures.every(t => t.status === 'fulfilled')) {
    world.globeMaterial(new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: textures[0].value }, nightMap: { value: textures[1].value } },
      vertexShader: `varying vec2 uvCoord; varying vec3 normalView; varying vec3 viewDirection;
        void main(){ uvCoord=uv; vec4 p=modelViewMatrix*vec4(position,1.0);
          normalView=normalize(normalMatrix*normal); viewDirection=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`,
      fragmentShader: `uniform sampler2D dayMap; uniform sampler2D nightMap;
        varying vec2 uvCoord; varying vec3 normalView; varying vec3 viewDirection;
        void main(){ vec3 n=normalize(normalView); vec3 v=normalize(viewDirection);
          float light=0.35+0.65*max(0.0,dot(n,normalize(vec3(-0.5,0.7,1.0))));
          vec3 surface=texture2D(dayMap,uvCoord).rgb*vec3(0.06,0.11,0.22)*light;
          vec3 cities=texture2D(nightMap,uvCoord).rgb*4.5;
          float rim=pow(1.0-max(0.0,dot(n,v)),3.0);
          gl_FragColor=vec4(surface+cities+rim*vec3(0.08,0.23,0.65),1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
  }
  onReady();
  return {
    available: true,
    setData(items) {
      groups.clear();
      world.customLayerData(items.filter(d => d.distanceMapped));
    },
    select(id) {
      selectedId = id;
      for (const [key, group] of groups) {
        group.userData.marker.scale.setScalar(key === id ? 1.6 : 1);
        group.userData.ring.material.opacity = key === id ? .9 : (group.userData.hazardous ? .42 : .27);
      }
    },
    setPaused(value) { paused = value; controls.autoRotate = !value; },
    reset() { world.pointOfView(home(), reducedMotion ? 0 : 750); },
  };
}
