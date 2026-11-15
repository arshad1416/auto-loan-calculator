import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  FogExp2,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  WebGLRenderer,
  type Texture,
} from 'three';
import { diamond, glow, lanePanel, limitSign, tab, taxDistanceSign, treeline } from './signTextures';

/**
 * The hero scene: a first-person night drive down a three-lane highway.
 * Signs carrying the calculator's own rules come out of the dark and pass
 * overhead. Everything is procedural, so there are no image assets to load.
 */

export interface NightDrive {
  /** 0 at the top of the page, 1 once the hero has scrolled away. */
  setScroll(progress: number): void;
  /** Pointer position across the hero, each axis -1..1. */
  setPointer(x: number, y: number): void;
  dispose(): void;
}

const FOG_COLOR = new Color(0x040a09);
const FOG_DENSITY = 0.0105;
/** Metres after which the sign sequence repeats. */
const LOOP = 380;
const LANE = 3.7;
const ROAD_LENGTH = 620;
/** The treeline texture is 8:1, so one tile covers eight times a wall's height. */
const TREE_ASPECT = 8;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uAspect, uHorizon, uCentre;
  uniform vec3 uFog;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float h = vUv.y - uHorizon;
    float up = max(h, 0.0);
    vec3 zenith = vec3(0.004, 0.009, 0.013);
    vec3 dusk = vec3(0.022, 0.078, 0.074);
    vec3 col = mix(zenith, dusk, exp(-up * 6.5));

    // A town somewhere past the horizon.
    float town = exp(-pow((vUv.x - uCentre) * 2.6, 2.0)) * exp(-up * 24.0);
    col += vec3(0.16, 0.085, 0.02) * town;

    // Stars, fewer near the horizon haze.
    vec2 sp = vec2(vUv.x * uAspect, vUv.y) * 190.0;
    float r = hash(floor(sp));
    float star = step(0.9962, r) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
    col += star * smoothstep(0.03, 0.3, h) * (0.45 + 0.4 * sin(uTime * 1.3 + r * 80.0));

    // Northern lights: three slow curtains with a hard lower hem.
    float ax = vUv.x * uAspect;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float hem = 0.2 + 0.085 * fi
        + 0.05 * sin(ax * 1.15 + uTime * 0.045 + fi * 2.3)
        + 0.022 * sin(ax * 3.4 - uTime * 0.07 + fi * 1.1);
      float d = h - hem;
      float curtain = smoothstep(-0.012, 0.004, d) * exp(-max(d, 0.0) * (8.0 - fi * 1.6));
      float rays = 0.5 + 0.5 * sin(ax * 34.0 + sin(ax * 6.0 + uTime * 0.16 + fi) * 3.2 + fi * 4.0);
      rays = mix(0.55, 1.0, rays * rays);
      vec3 tint = mix(vec3(0.07, 0.72, 0.36), vec3(0.14, 0.42, 0.62), clamp(d * 5.0, 0.0, 1.0));
      col += tint * curtain * rays * (0.115 - fi * 0.022);
    }

    col = mix(uFog, col, smoothstep(-0.004, 0.012, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const ROAD_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform float uOffset, uFogDensity, uCamX;
  uniform vec3 uFog;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float stripe(float x, float centre, float halfWidth, float aa) {
    return 1.0 - smoothstep(halfWidth, halfWidth + aa, abs(x - centre));
  }

  void main() {
    float x = vWorld.x;
    float d = max(-vWorld.z, 0.0);
    float s = d + uOffset;
    float aa = fwidth(x) * 1.25;

    // Aggregate up close, long wear streaks along the lane; both fade out
    // with distance so the far road does not shimmer.
    // Octaves are rotated against each other so the lattice never lines up.
    vec2 g = vec2(x, s);
    vec2 gr = mat2(0.8, -0.6, 0.6, 0.8) * g;
    float grit = mix(0.5, noise(g * 31.0), exp(-d / 14.0));
    float blotch = mix(0.5, noise(gr * 2.3), exp(-d / 60.0));
    float wear = noise(vec2(x * 2.2, s * 0.12));
    float grain = grit * 0.45 + blotch * 0.25 + wear * 0.3;
    vec3 asphalt = vec3(0.058, 0.06, 0.06) * (0.7 + 0.6 * grain);
    vec3 verge = vec3(0.02, 0.034, 0.022) * (0.5 + grain);
    float onRoad = 1.0 - smoothstep(${(LANE * 1.5 + 1.1).toFixed(2)}, ${(LANE * 1.5 + 1.5).toFixed(2)}, abs(x));
    vec3 ground = mix(verge, asphalt, onRoad);

    // 3 m dash, 6 m gap.
    float dash = step(fract(s / 9.0), 0.3333);
    float lanes = (stripe(x, -${(LANE / 2).toFixed(2)}, 0.065, aa) + stripe(x, ${(LANE / 2).toFixed(2)}, 0.065, aa)) * dash;
    float rightEdge = stripe(x, ${(LANE * 1.5).toFixed(2)}, 0.075, aa);
    float leftEdge = stripe(x, -${(LANE * 1.5).toFixed(2)}, 0.075, aa);
    vec3 paint = (lanes + rightEdge) * vec3(0.96, 0.95, 0.9) + leftEdge * vec3(1.0, 0.76, 0.08);

    // Low beams: a bright pool close in, a longer throw down the lane.
    float bx = x - uCamX;
    float spread = exp(-pow(bx / (2.4 + d * 0.12), 2.0));
    float reach = smoothstep(1.0, 7.0, d) * (1.7 * exp(-d / 20.0) + 0.55 * exp(-d / 70.0));
    float beam = spread * reach;

    // Paint is retroreflective, so it carries much further than the asphalt.
    vec3 col = ground * (0.09 + beam * 3.0)
             + paint * (0.72 + 0.5 * grain) * (0.03 + beam * 1.7 + 0.75 * exp(-d / 150.0) * exp(-pow(bx / (5.0 + d * 0.1), 2.0)));

    float fog = 1.0 - exp(-pow(d * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  }
`;

const PASS_THROUGH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const WORLD_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

interface Station {
  group: Group;
  /** Metres from the start of the loop. */
  at: number;
}

/** Distance travelled after `t` seconds: fast out of the gate, settling to a cruise. */
const travelled = (t: number) => 20 * t + 90 * (1 - Math.exp(-t / 3));

export function createNightDrive(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): NightDrive {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(FOG_COLOR);

  const scene = new Scene();
  scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);

  const camera = new PerspectiveCamera(52, 1, 0.1, 1200);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.3, 0);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // ── Sky ────────────────────────────────────────────────────────────
  const skyMaterial = track(
    new ShaderMaterial({
      vertexShader: PASS_THROUGH_VERT,
      fragmentShader: SKY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uHorizon: { value: 0.5 },
        uCentre: { value: 0.5 },
        uFog: { value: FOG_COLOR },
      },
    }),
  );
  const sky = new Mesh(track(new PlaneGeometry(2, 2)), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ── Road ───────────────────────────────────────────────────────────
  const roadMaterial = track(
    new ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: ROAD_FRAG,
      uniforms: {
        uOffset: { value: 0 },
        uCamX: { value: 0 },
        uFogDensity: { value: FOG_DENSITY },
        uFog: { value: FOG_COLOR },
      },
    }),
  );
  const road = new Mesh(track(new PlaneGeometry(90, ROAD_LENGTH)), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -ROAD_LENGTH / 2 + 12;
  scene.add(road);

  // ── Treeline: two depths per side for parallax ─────────────────────
  const treeTextures: Texture[] = [];
  const addTrees = (x: number, height: number, seed: number) => {
    const map = track(treeline(seed));
    map.wrapS = RepeatWrapping;
    map.repeat.x = ROAD_LENGTH / (TREE_ASPECT * height);
    treeTextures.push(map);
    const material = track(
      new MeshBasicMaterial({ map, color: 0x010403, transparent: true, alphaTest: 0.5, fog: false }),
    );
    const wall = new Mesh(track(new PlaneGeometry(ROAD_LENGTH, height)), material);
    wall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    wall.position.set(x, height / 2 - 0.4, -ROAD_LENGTH / 2 + 12);
    wall.userData.direction = x < 0 ? 1 : -1;
    wall.userData.tile = TREE_ASPECT * height;
    scene.add(wall);
    return wall;
  };
  const treeWalls = [addTrees(-21, 11, 7), addTrees(21, 11, 91), addTrees(-40, 17, 233), addTrees(40, 17, 1021)];

  // ── Roadside reflectors ────────────────────────────────────────────
  const REFLECTORS = 26;
  const REFLECTOR_GAP = 24;
  const reflectorGeometry = track(new PlaneGeometry(0.11, 0.2));
  const makeReflectors = (color: number) => {
    const mesh = new InstancedMesh(reflectorGeometry, track(new MeshBasicMaterial({ color })), REFLECTORS);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const rightReflectors = makeReflectors(0xf4f1e2);
  const leftReflectors = makeReflectors(0xffb21a);
  const dummy = new Object3D();

  // ── Signs ──────────────────────────────────────────────────────────
  const steel = track(new MeshBasicMaterial({ color: 0x0c1110 }));
  const unitBox = track(new BoxGeometry(1, 1, 1));
  const unitPlane = track(new PlaneGeometry(1, 1));

  const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const m = new Mesh(unitBox, steel);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    return m;
  };

  const face = (texture: Texture, w: number, h: number, x: number, y: number, transparent = false) => {
    const material = track(new MeshBasicMaterial({ map: track(texture), transparent, alphaTest: transparent ? 0.5 : 0 }));
    const m = new Mesh(unitPlane, material);
    m.scale.set(w, h, 1);
    m.position.set(x, y, 0.22);
    return m;
  };

  const gantry = (panels: Mesh[]) => {
    const g = new Group();
    const half = LANE * 1.5 + 3.1;
    g.add(box(0.42, 9.4, 0.42, -half, 4.7), box(0.42, 9.4, 0.42, half, 4.7));
    g.add(box(half * 2, 0.22, 0.22, 0, 9.1), box(half * 2, 0.22, 0.22, 0, 7.9));
    // Truss webbing between the two chords.
    for (let x = -half + 0.9; x < half; x += 1.8) g.add(box(0.1, 1.2, 0.1, x, 8.5));
    g.add(...panels);
    return g;
  };

  const roadside = (parts: Mesh[], postHeight: number) => {
    const g = new Group();
    g.add(box(0.12, postHeight, 0.12, 0, postHeight / 2, 0.1));
    g.add(...parts);
    g.position.x = LANE * 1.5 + 3.6;
    g.rotation.y = -0.16;
    // Oversized, the way freeway signs are, so they read from the far lane.
    g.scale.setScalar(1.3);
    return g;
  };

  const stations: Station[] = [
    {
      at: 95,
      group: gantry([
        face(
          taxDistanceSign([
            ['Ontario', 'HST 13%'],
            ['Québec', 'GST + QST 14.975%'],
            ['Alberta', 'GST 5%'],
          ]),
          10.6,
          4.15,
          0,
          6.75,
        ),
      ]),
    },
    {
      at: 150,
      group: roadside(
        [face(diamond(['LUXURY', 'TAX'], 'yellow'), 3.4, 3.4, 0, 3.7, true), face(tab('OVER $100,000', 'yellow'), 2.5, 0.86, 0, 1.75)],
        4.2,
      ),
    },
    {
      at: 200,
      group: roadside([face(limitSign(['MAXIMUM', 'TERM'], '96', 'MONTHS'), 2.1, 3.0, 0, 3.3)], 3.4),
    },
    {
      at: 250,
      group: roadside(
        [face(diamond(['NEGATIVE', 'EQUITY'], 'orange'), 3.4, 3.4, 0, 3.7, true), face(tab('40% CAP', 'orange'), 2.5, 0.86, 0, 1.75)],
        4.2,
      ),
    },
    {
      at: 310,
      group: gantry([
        face(lanePanel('Payment', 'price in, payment out'), 5.0, 3.45, -3.0, 6.9),
        face(lanePanel('Max price', 'budget in, price out', 'REVERSE'), 5.0, 3.45, 3.0, 6.9),
      ]),
    },
  ];
  stations.forEach((s) => scene.add(s.group));

  // ── Other traffic ──────────────────────────────────────────────────
  const headlightTexture = track(glow('rgba(255,250,235,1)', 'rgba(255,236,190,0.55)'));
  const taillightTexture = track(glow('rgba(255,70,40,1)', 'rgba(230,20,10,0.5)'));
  const lightSprite = (map: Texture, scale: number) => {
    const sprite = new Sprite(track(new SpriteMaterial({ map, blending: AdditiveBlending, depthWrite: false, fog: true })));
    sprite.scale.setScalar(scale);
    scene.add(sprite);
    return sprite;
  };

  const oncoming = [0, 1, 2].map((i) => ({
    left: lightSprite(headlightTexture, 1.9),
    right: lightSprite(headlightTexture, 1.9),
    /** Metres ahead when the clock starts; they close at combined speed. */
    lead: 260 + i * 310,
  }));
  const ahead = [lightSprite(taillightTexture, 0.85), lightSprite(taillightTexture, 0.85)];

  // ── Frame loop ─────────────────────────────────────────────────────
  let width = 0;
  let height = 0;
  let shift = 0;
  let scroll = 0;
  const pointer = { x: 0, y: 0, easedX: 0, easedY: 0 };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 70 : camera.aspect < 1.2 ? 60 : 52;
    // On wide screens the vanishing point slides right, leaving the left for the headline.
    shift = camera.aspect > 1.25 ? 0.4 : 0;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -shift;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    skyMaterial.uniforms.uAspect.value = camera.aspect;
    skyMaterial.uniforms.uCentre.value = 0.5 + shift / 2;
  };

  const wrap = (value: number, period: number) => ((value % period) + period) % period;

  const render = (t: number) => {
    resize();
    const offset = travelled(t);

    pointer.easedX += (pointer.x - pointer.easedX) * 0.04;
    pointer.easedY += (pointer.y - pointer.easedY) * 0.04;
    const pitch = -0.032 + scroll * 0.3 + pointer.easedY * -0.012 + Math.sin(t * 2.1) * 0.0012;
    camera.rotation.x = pitch;
    camera.rotation.y = -pointer.easedX * 0.03 + Math.sin(t * 0.33) * 0.004;
    camera.rotation.z = Math.sin(t * 0.47) * 0.004;
    // We hold the left lane, tight to the yellow line, so the headline has
    // the dark verge behind it and the line clears the copy.
    camera.position.x = -LANE - 0.4 + Math.sin(t * 0.21) * 0.12;
    roadMaterial.uniforms.uCamX.value = camera.position.x;
    camera.position.y = 1.3 + Math.sin(t * 5.3) * 0.006;

    const halfFov = (camera.fov * Math.PI) / 360;
    skyMaterial.uniforms.uHorizon.value = 0.5 - Math.tan(pitch) / Math.tan(halfFov) / 2;
    skyMaterial.uniforms.uTime.value = t;
    roadMaterial.uniforms.uOffset.value = offset;

    treeWalls.forEach((wall, i) => {
      treeTextures[i].offset.x = (wall.userData.direction * offset) / wall.userData.tile;
    });

    for (let i = 0; i < REFLECTORS; i++) {
      const d = wrap(i * REFLECTOR_GAP - offset, REFLECTORS * REFLECTOR_GAP);
      dummy.position.set(LANE * 1.5 + 1.25, 0.85, -d);
      dummy.updateMatrix();
      rightReflectors.setMatrixAt(i, dummy.matrix);
      dummy.position.x = -(LANE * 1.5 + 1.25);
      dummy.updateMatrix();
      leftReflectors.setMatrixAt(i, dummy.matrix);
    }
    rightReflectors.instanceMatrix.needsUpdate = true;
    leftReflectors.instanceMatrix.needsUpdate = true;

    for (const station of stations) {
      const d = wrap(station.at - offset, LOOP);
      station.group.position.z = -d;
      station.group.visible = d > 1.5;
    }

    // Oncoming cars on the far carriageway, closing at our speed plus theirs.
    const closing = offset + t * 29;
    for (const car of oncoming) {
      const d = wrap(car.lead - closing, 930) - 30;
      car.left.position.set(-15.2, 0.72, -d);
      car.right.position.set(-13.7, 0.72, -d);
    }
    // One car holding station ahead of us, a lane over.
    const gap = 96 + Math.sin(t * 0.11) * 24;
    ahead[0].position.set(-0.72, 0.82, -gap);
    ahead[1].position.set(0.72, 0.82, -gap);

    renderer.render(scene, camera);
  };

  let raf = 0;
  let running = false;
  let clock = 0;
  let last = 0;

  const frame = (now: number) => {
    clock += Math.min((now - last) / 1000, 0.1);
    last = now;
    render(clock);
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running || opts.reducedMotion) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // Only burn frames while the hero is on screen and the tab is in front.
  let onScreen = true;
  const sync = () => (onScreen && !document.hidden ? start() : stop());
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  visibility.observe(canvas);
  document.addEventListener('visibilitychange', sync);

  // Still frame for reduced motion: the first gantry, comfortably in view.
  const STILL_AT = 2.05;
  const renderStill = () => render(STILL_AT);
  if (opts.reducedMotion) {
    renderStill();
    window.addEventListener('resize', renderStill);
  } else {
    render(0);
    sync();
  }

  return {
    setScroll(progress) {
      scroll = Math.max(0, Math.min(1, progress));
      if (opts.reducedMotion) renderStill();
    },
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
    },
    dispose() {
      stop();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', renderStill);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
