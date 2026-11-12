import * as THREE from 'three';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js';

const $ = (id) => document.getElementById(id);
let startInProgress = false;
function beginGame(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  if (startInProgress || phase !== 'menu') return;
  startInProgress = true;
  try {
    selectedMode = $('mode-select').value;
    playerName = ($('player-name').value.trim() || 'Player').slice(0, 14);
    $('start-overlay').classList.add('hidden');
    $('home-button').classList.remove('hidden');
    if (document.documentElement.requestFullscreen) {
      const fullscreenResult = document.documentElement.requestFullscreen();
      fullscreenResult?.catch(() => {});
    }
    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
    startRound(true);
  } catch (error) {
    console.error('Could not start the game:', error);
    $('start-overlay').classList.remove('hidden');
    setToast('Start error: ' + (error?.message || String(error)));
    startInProgress = false;
  }
}
const startButton = $('start-button');
startButton.style.pointerEvents = 'auto';
startButton.addEventListener('pointerup', beginGame);
startButton.addEventListener('click', beginGame);
window.startMaryParkourGame = beginGame;

function returnHome() {
  clearTouchInput();
  player.jumpQueued = false;
  phase = 'menu';
  startInProgress = false;
  $('home-button').classList.add('hidden');
  $('result-overlay').classList.add('hidden');
  $('start-overlay').classList.remove('hidden');
  $('player-name').value = playerName === 'Player' ? $('player-name').value : playerName;
}
$('home-button').addEventListener('click', returnHome);
$('home-button').addEventListener('pointerup', event => {
  event.preventDefault();
  returnHome();
});
const root = $('game-root');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc7eaf7);
scene.fog = new THREE.Fog(0xc7eaf7, 30, 72);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(0, 11.5, 13.2);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff5fb, 0x8bb8a8, 2.6));
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xfff7ef, 2.8);
sun.position.set(-8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
scene.add(sun);

const arena = new THREE.Group();
scene.add(arena);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ color: 0xa8e6d0, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.5;
floor.receiveShadow = true;
scene.add(floor);

const GRID = 8, TILE = 2.22, GAP = 0.14, STEP = TILE + GAP;
const HALF = (GRID - 1) * STEP / 2;
const tileMeshes = [];
const tileLabels = [];
const actors = [];
const keys = new Set();
const clock = new THREE.Clock();
const player = { mesh: null, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, alive: true, speed: 3.35, onGround: true, jumpQueued: false };
let round = 0, timeLeft = 7, phase = 'menu', selectedMode = 'random', activeMode = 'colour';
let challenge = null, survivors = 10, soundOn = true, lastTime = 0, roundResolveTimer = 0, betweenTimer = 0, playerName = 'Player';
let joystickVector = { x: 0, y: 0 }, joystickPointer = null;
const touchDirections = new Set();
const npcNames = ['Luna','Mia','Daisy','Coco','Poppy','Ivy','Rosie','Bella','Mochi'];
const npcColors = [0xff91b8,0xb89aff,0x72c9f2,0xffc46b,0x78d8b5,0xf28bbd,0x9aabff,0xff9c82,0x9bdc8a];

function makeLabel(text, color = '#17243a') {
  const labelText = String(text).slice(0, 9);
  const isPictogram = /\p{Extended_Pictographic}/u.test(labelText) || /^[●★■♥▲◆]$/u.test(labelText);
  const isNumber = /^\d+$/.test(labelText);
  // Give picture and symbol labels a square canvas so their full artwork can
  // occupy most of the tile face instead of being squeezed into a wide strip.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = (isPictogram || isNumber) ? 256 : 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,.93)';
  if (isPictogram || isNumber) {
    roundRect(ctx, 8, 8, 240, 240, 36);
  } else {
    roundRect(ctx, 8, 8, 240, 112, 24);
  }
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isPictogram) {
    ctx.font = '122px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(labelText, 128, 130);
  } else if (isNumber) {
    ctx.fillStyle = color;
    // Keep numerals modest and relaxed; the tile should remain the main visual.
    const digitSize = labelText.length <= 2 ? 76 : labelText.length === 3 ? 64 : 52;
    ctx.font = `900 ${digitSize}px Arial, sans-serif`;
    ctx.fillText(labelText, 128, 130, 224);
  } else {
    ctx.fillStyle = color;
    ctx.font = '900 54px Arial, sans-serif';
    ctx.fillText(labelText, 128, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(isPictogram ? 1.02 : isNumber ? 0.95 : 1.78, isPictogram ? 1.02 : isNumber ? 0.95 : 0.89, 1);
  sprite.position.y = 0.28;
  return sprite;
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function createMaryActor(displayName='PLAYER') {
  const g=new THREE.Group();
  const mat=(color,roughness=.3)=>new THREE.MeshStandardMaterial({color,roughness});
  const skin=mat(0xffc4a9,.38), hair=mat(0xffbd18,.24), hair2=mat(0xffd438,.22), pink=mat(0xf47db6,.3), wing=mat(0xffead8,.42), blue=mat(0x0754b9,.2), white=mat(0xffffff,.2), gold=mat(0xffc32d,.2), dark=mat(0x75422f,.4);
  const ball=new THREE.SphereGeometry(1,28,22);
  const add=(geo,material,pos,scale,rot)=>{const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(scale)m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=true;g.add(m);return m;};
  const legPivots=[];
  for(const x of [-.15,.15]){
    const pivot=new THREE.Group();pivot.position.set(x,.48,0);g.add(pivot);
    const leg=new THREE.Mesh(ball,skin);leg.position.set(0,-.13,0);leg.scale.set(.105,.22,.12);leg.castShadow=true;pivot.add(leg);
    const foot=new THREE.Mesh(ball,skin);foot.position.set(0,-.29,.035);foot.scale.set(.135,.09,.16);foot.castShadow=true;pivot.add(foot);
    legPivots.push(pivot);
  }
  add(new THREE.CylinderGeometry(.245,.42,.58,40),pink,[0,1.01,0]);
  add(ball,pink,[0,1.24,0],[.29,.25,.25]);
  const armPivots=[];
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*.29,1.31,0);g.add(pivot);
    const sleeve=new THREE.Mesh(ball,pink);sleeve.position.set(side*.035,-.23,0);sleeve.scale.set(.13,.38,.15);sleeve.rotation.z=side*-.12;sleeve.castShadow=true;pivot.add(sleeve);
    const hand=new THREE.Mesh(ball,skin);hand.position.set(side*.06,-.48,.015);hand.scale.set(.12,.15,.13);hand.castShadow=true;pivot.add(hand);
    armPivots.push(pivot);
  }
  add(ball,skin,[0,1.37,.015],[.19,.18,.18]);add(ball,skin,[0,1.82,.035],[.51,.55,.43]);
  for(const x of [-.215,.215]){add(ball,blue,[x,1.87,.455],[.105,.145,.055]);add(ball,white,[x-.025,1.925,.505],[.027,.034,.018]);add(ball,hair,[x*.83,2.15,.455],[.095,.035,.035]);add(ball,mat(0xff927f,.5),[x*1.48,1.69,.405],[.105,.075,.025]);}
  add(ball,skin,[0,1.77,.51],[.075,.055,.055]);
  const smile=new THREE.CatmullRomCurve3([new THREE.Vector3(-.12,1.65,.49),new THREE.Vector3(0,1.60,.525),new THREE.Vector3(.12,1.65,.49)]);add(new THREE.TubeGeometry(smile,16,.018,8,false),dark,[0,0,0]);
  add(new THREE.SphereGeometry(1,32,20,0,Math.PI*2,0,Math.PI*.56),hair,[0,2.08,-.015],[.54,.39,.46]);
  add(ball,hair2,[-.24,2.02,.27],[.28,.21,.19],[0,0,-.52]);add(ball,hair2,[.24,2.02,.27],[.28,.21,.19],[0,0,.52]);
  for(const side of [-1,1]){add(ball,hair,[side*.61,1.92,-.015],[.17,.39,.18],[0,0,side*-.12]);add(ball,hair2,[side*.64,1.72,.02],[.15,.24,.17],[0,0,side*-.25]);}
  add(new THREE.TorusGeometry(.39,.065,12,40),gold,[0,2.66,-.015],[1,1,1],[Math.PI/2,0,0]);
  for(const side of [-1,1]){add(ball,wing,[side*.57,1.26,-.22],[.28,.22,.11],[0,0,side*-.25]);for(let k=0;k<3;k++)add(ball,wing,[side*(.64+.025*k),1.46-.17*k,-.24],[.25,.12,.09],[0,0,side*-.18]);}
  const front=(geo,material,x,y,z=.31,sx=1,sy=1,sz=1,rz=0)=>add(geo,material,[x,y,z],[sx,sy,sz],[0,0,rz]);
  for(const [radius,color] of [[.205,0xf05b9e],[.16,0xffc83d],[.115,0x42c98c]]){const arc=new THREE.Mesh(new THREE.TorusGeometry(radius,.025,8,28,Math.PI),mat(color,.28));arc.position.set(-.16,1.08,.30);arc.rotation.z=Math.PI;g.add(arc);}
  const heart=new THREE.Shape();heart.moveTo(0,-.09);heart.bezierCurveTo(-.2,.04,-.17,.19,0,.12);heart.bezierCurveTo(.17,.19,.2,.04,0,-.09);front(new THREE.ExtrudeGeometry(heart,{depth:.025,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.01}),mat(0xf04d9a,.24),.19,1.08,.31,.78,.78,.78);
  front(new THREE.CircleGeometry(.13,24),gold,-.23,.79,.32);
  for(const x of [-.045,.045])front(new THREE.CircleGeometry(.012,12),dark,-.23+x,.83,.34);
  front(new THREE.BoxGeometry(.12,.12,.035),mat(0xe84e9c,.25),.06,.84,.34,1,1,1,Math.PI/4);front(new THREE.BoxGeometry(.055,.055,.04),gold,.06,.84,.365,1,1,1,Math.PI/4);
  const star=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2===0?.17:.078,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)star.moveTo(x,y);else star.lineTo(x,y);}star.closePath();front(new THREE.ExtrudeGeometry(star,{depth:.025,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.008}),mat(0x45c8df,.28),.25,.77,.32,1,1,1,-.12);
  for(const side of [-1,1])front(ball,mat(0x9b59cf,.3),-.19+side*.075,.52,.32,.075,.052,.026,side*-.5);
  g.scale.setScalar(.9);
  g.userData.limbs={legs:legPivots,arms:armPivots};
  return g;
}

function makeActor(color, isPlayer = false, displayName = '', outfitIndex = 0) {
  if(isPlayer) return createMaryActor(displayName);
  // Soft, rounded toy-like characters with simple expressive faces.
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: .48 });
  const skin = new THREE.MeshStandardMaterial({ color: pick([0xffd7bd,0xf6c7a8,0xeab28e,0xffe0c9]), roughness: .62 });
  const pants = new THREE.MeshStandardMaterial({ color: pick([0x8f9fe8,0x83cdbb,0xf0a7c4,0x8db9df,0xe6b5a0]), roughness: .62 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x493c59, roughness: .5 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xff9bb5, roughness: .7 });
  const sphere = new THREE.SphereGeometry(1, 20, 16);
  const body = new THREE.Mesh(sphere, shirt);
  body.scale.set(.39,.47,.29); body.position.y=1.02; group.add(body);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.25,.055,8,24), new THREE.MeshStandardMaterial({color:0xfff2f7,roughness:.55}));
  collar.position.set(0,1.32,.05); collar.rotation.x=.25; group.add(collar);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34,24,20), skin);
  head.position.y=1.68; group.add(head);
  const hairColor = pick([0x593c38,0x342a3c,0x9a6545,0x4b334f,0x302a32]);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.355,20,14,0,Math.PI*2,0,Math.PI*.55), new THREE.MeshStandardMaterial({color:hairColor,roughness:.78}));
  hair.position.set(0,1.83,-.015); group.add(hair);
  for(const x of [-.125,.125]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,12,10),dark);
    eye.position.set(x,1.7,.307);group.add(eye);
  }
  for(const x of [-.205,.205]){
    const cheek=new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),blush);
    cheek.scale.set(1,.65,.25);cheek.position.set(x,1.61,.29);group.add(cheek);
  }
  const armGeo = new THREE.SphereGeometry(.14,16,12);
  for(const side of [-1,1]){
    const arm=new THREE.Mesh(armGeo,skin);arm.scale.set(.82,1.65,.82);arm.position.set(side*.43,1.03,.015);group.add(arm);
    const leg=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),pants);leg.scale.set(.9,1.65,1);leg.position.set(side*.17,.43,0);group.add(leg);
    const shoe=new THREE.Mesh(new THREE.SphereGeometry(.15,16,12),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.48}));
    shoe.scale.set(1,.58,1.35);shoe.position.set(side*.17,.18,.055);group.add(shoe);
  }
  // A little bow or flower gives each competitor a recognisable outfit.
  const accessoryColors=[0xff6fa8,0xffd05d,0x8d83ff,0x6bd5bd,0xff9b72];
  const accent=new THREE.MeshStandardMaterial({color:accessoryColors[outfitIndex%accessoryColors.length],roughness:.5});
  if(outfitIndex%3===0){
    for(const side of [-1,1]){
      const loop=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),accent);
      loop.scale.set(1,.68,.38);loop.position.set(side*.19,2.02,.035);group.add(loop);
    }
    const knot=new THREE.Mesh(new THREE.SphereGeometry(.07,12,10),accent);knot.position.set(0,2.02,.08);group.add(knot);
  } else if(outfitIndex%3===1){
    const hat=new THREE.Mesh(new THREE.SphereGeometry(.36,18,10,0,Math.PI*2,0,Math.PI*.5),accent);
    hat.scale.y=.52;hat.position.set(0,1.99,0);group.add(hat);
    const pom=new THREE.Mesh(new THREE.SphereGeometry(.09,12,10),new THREE.MeshStandardMaterial({color:0xffffff}));
    pom.position.set(0,2.16,0);group.add(pom);
  } else {
    for(const side of [-1,1]){
      const ear=new THREE.Mesh(new THREE.SphereGeometry(.105,14,10),accent);
      ear.scale.set(.62,1.8,.55);ear.position.set(side*.2,2.08,0);group.add(ear);
    }
  }
  if(isPlayer){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.045,8,24),new THREE.MeshStandardMaterial({color:0x75e6c0,emissive:0x164b39}));
    ring.rotation.x=Math.PI/2;ring.position.y=.035;group.add(ring);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.34,.055,10,32),new THREE.MeshStandardMaterial({color:0xffd66f,emissive:0x79521b,emissiveIntensity:.35,roughness:.4}));
    halo.position.y=2.25;halo.rotation.x=Math.PI/2;group.add(halo);
    const nameCanvas=document.createElement('canvas');nameCanvas.width=512;nameCanvas.height=128;
    const ctx=nameCanvas.getContext('2d');ctx.fillStyle='rgba(255,255,255,.94)';roundRect(ctx,8,8,496,112,28);ctx.fill();
    ctx.strokeStyle='#ff91b8';ctx.lineWidth=5;roundRect(ctx,8,8,496,112,28);ctx.stroke();
    ctx.fillStyle='#65445f';ctx.font='900 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((displayName||'PLAYER').toUpperCase(),256,65,450);
    const tagTexture=new THREE.CanvasTexture(nameCanvas);tagTexture.colorSpace=THREE.SRGBColorSpace;
    const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tagTexture,transparent:true,depthTest:false}));
    tag.scale.set(1.8,.45,1);tag.position.y=2.76;group.add(tag);
  }
  group.userData.limbs=[];
  group.scale.setScalar(1.12);
  group.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return group;
}
function createArena() {
  while (arena.children.length) {
    const child = arena.children.pop();
    child.traverse?.(o => { if(o.geometry) o.geometry.dispose(); if(o.material) { if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material.dispose(); } });
  }
  tileMeshes.length = 0; tileLabels.length = 0;
  const padGeo = new RoundedBoxGeometry(TILE, .28, TILE, 3, .075);
  for (let row=0; row<GRID; row++) for (let col=0; col<GRID; col++) {
    const x = (col-(GRID-1)/2)*STEP, z = (row-(GRID-1)/2)*STEP;
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .58, metalness: .02 });
    const mesh = new THREE.Mesh(padGeo, material);
    mesh.position.set(x, 0, z); mesh.receiveShadow = true; mesh.castShadow = true;
    arena.add(mesh);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(TILE+.035,.035,TILE+.035), new THREE.MeshStandardMaterial({color:0xffffff, roughness:.8}));
    edge.position.set(x,-.15,z); arena.add(edge);
    tileMeshes.push({ mesh, edge, x, z, label: null, value: null, falling: false, originalY: 0 });
  }
  const wallMat = new THREE.MeshStandardMaterial({color:0xffc3d8, roughness:.72});
  const railGeo = new THREE.BoxGeometry(GRID*STEP,.35,.35);
  for (const z of [-HALF-1.3, HALF+1.3]) {
    const rail = new THREE.Mesh(railGeo, wallMat); rail.position.set(0,.05,z); arena.add(rail);
  }
  const sideGeo = new THREE.BoxGeometry(.35,.35,GRID*STEP);
  for (const x of [-HALF-1.3, HALF+1.3]) {
    const rail = new THREE.Mesh(sideGeo, wallMat); rail.position.set(x,.05,0); arena.add(rail);
  }
}

const modes = ['colour','math','animal','emoji','word','shape','memory','odd','truefalse','pattern'];
const palettes = [
  {name:'PINK',hex:0xff7fa8},{name:'BLUE',hex:0x65bdf2},{name:'YELLOW',hex:0xffd45f},
  {name:'MINT',hex:0x65d5b0},{name:'PURPLE',hex:0xb28df2},{name:'PEACH',hex:0xffa078}
];
const animals = [
  {n:'CAT',e:'🐱'},{n:'DOG',e:'🐶'},{n:'LION',e:'🦁'},{n:'TIGER',e:'🐯'},{n:'ELEPHANT',e:'🐘'},
  {n:'GIRAFFE',e:'🦒'},{n:'ZEBRA',e:'🦓'},{n:'MONKEY',e:'🐵'},{n:'PANDA',e:'🐼'},{n:'BEAR',e:'🐻'},
  {n:'FOX',e:'🦊'},{n:'RABBIT',e:'🐰'},{n:'FROG',e:'🐸'},{n:'TURTLE',e:'🐢'},{n:'SNAKE',e:'🐍'},
  {n:'FISH',e:'🐟'},{n:'DOLPHIN',e:'🐬'},{n:'SHARK',e:'🦈'},{n:'BIRD',e:'🐦'},{n:'OWL',e:'🦉'},
  {n:'EAGLE',e:'🦅'},{n:'PENGUIN',e:'🐧'},{n:'HORSE',e:'🐴'},{n:'COW',e:'🐮'},{n:'SHEEP',e:'🐑'}
];
const emojis = [
  {n:'HEART',e:'❤️'},{n:'STAR',e:'⭐'},{n:'SUN',e:'☀️'},{n:'MOON',e:'🌙'},{n:'FLOWER',e:'🌸'},
  {n:'RAINBOW',e:'🌈'},{n:'PIZZA',e:'🍕'},{n:'BALL',e:'⚽'},{n:'CAKE',e:'🎂'},{n:'ICE CREAM',e:'🍦'},
  {n:'MUSIC',e:'🎵'},{n:'GIFT',e:'🎁'},{n:'CROWN',e:'👑'},{n:'KEY',e:'🔑'},{n:'UMBRELLA',e:'☂️'},
  {n:'ROCKET',e:'🚀'},{n:'BICYCLE',e:'🚲'},{n:'AIRPLANE',e:'✈️'},{n:'LIGHTNING',e:'⚡'},{n:'FIRE',e:'🔥'},
  {n:'LEAF',e:'🍃'},{n:'BUTTERFLY',e:'🦋'},{n:'CAMERA',e:'📷'},{n:'BOOK',e:'📚'},{n:'TROPHY',e:'🏆'}
];
const shapes = [{n:'CIRCLE',e:'●'},{n:'STAR',e:'★'},{n:'SQUARE',e:'■'},{n:'HEART',e:'♥'},{n:'TRIANGLE',e:'▲'},{n:'DIAMOND',e:'◆'},{n:'OVAL',e:'⬭'},{n:'HEXAGON',e:'⬡'},{n:'CRESCENT',e:'☾'},{n:'CROSS',e:'✚'}];
const words = [
  {n:'APPLE',e:'🍎'},{n:'HOUSE',e:'🏠'},{n:'RIVER',e:'🌊'},{n:'CLOUD',e:'☁️'},{n:'PLANT',e:'🪴'},
  {n:'TRAIN',e:'🚆'},{n:'MOUNTAIN',e:'⛰️'},{n:'BRIDGE',e:'🌉'},{n:'OCEAN',e:'🌊'},{n:'FLOWER',e:'🌷'},
  {n:'BOOK',e:'📖'},{n:'CLOCK',e:'🕒'},{n:'BOTTLE',e:'🍼'},{n:'CHAIR',e:'🪑'},{n:'LADDER',e:'🪜'},
  {n:'GUITAR',e:'🎸'},{n:'CAMERA',e:'📷'},{n:'BASKET',e:'🧺'},{n:'CASTLE',e:'🏰'},{n:'KITE',e:'🪁'}
];
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const shuffle = arr => [...arr].sort(()=>Math.random()-.5);
function mathQuestion() {
  const op = pick(['+','−','×']);
  let a = 10+Math.floor(Math.random()*50), b = 2+Math.floor(Math.random()*30), answer;
  if(op==='+') answer=a+b;
  if(op==='−') { if(b>a) [a,b]=[b,a]; answer=a-b; }
  if(op==='×') { a=2+Math.floor(Math.random()*12); b=2+Math.floor(Math.random()*9); answer=a*b; }
  const wrong = new Set();
  while(wrong.size<3) { const v=answer+pick([-12,-9,-6,-4,-2,2,3,5,7,10,12]); if(v>=0&&v!==answer) wrong.add(v); }
  return {prompt:a+' '+op+' '+b+' = ?', hint:'Work it out, then find the matching number.',answer:String(answer),options:shuffle([String(answer),...wrong].slice(0,4))};
}
function makeChallenge(mode) {
  if(mode==='colour') {
    const target=pick(palettes);
    return {mode,prompt:target.name,hint:'',answer:target.name,options:shuffle([target.name,...shuffle(palettes.filter(p=>p.name!==target.name).map(p=>p.name)).slice(0,3)]),colors:Object.fromEntries(palettes.map(p=>[p.name,p.hex]))};
  }
  if(mode==='math') {
    const q=mathQuestion();
    q.hint='';
    return {mode,...q};
  }
  if(mode==='animal') {
    const target=pick(animals);
    return {mode,prompt:target.n,hint:'',answer:target.n,options:shuffle([target.n,...shuffle(animals.filter(a=>a.n!==target.n).map(a=>a.n)).slice(0,3)]),icons:Object.fromEntries(animals.map(a=>[a.n,a.e]))};
  }
  if(mode==='emoji') {
    const target=pick(emojis);
    return {mode,prompt:'Find '+target.n+' '+target.e,hint:'',answer:target.n,options:shuffle([target.n,...shuffle(emojis.filter(e=>e.n!==target.n).map(e=>e.n)).slice(0,3)]),icons:Object.fromEntries(emojis.map(e=>[e.n,e.e]))};
  }
  if(mode==='word') {
    const target=pick(words);
    return {mode,prompt:target.n,hint:'',answer:target.n,options:shuffle([target.n,...shuffle(words.filter(w=>w.n!==target.n).map(w=>w.n)).slice(0,3)]),icons:Object.fromEntries(words.map(w=>[w.n,w.e]))};
  }
  if(mode==='shape') {
    const target=pick(shapes);
    return {mode,prompt:target.n,hint:'',answer:target.n,options:shuffle([target.n,...shuffle(shapes.filter(s=>s.n!==target.n).map(s=>s.n)).slice(0,3)]),icons:Object.fromEntries(shapes.map(s=>[s.n,s.e]))};
  }
  if(mode==='memory') {
    const target=pick(['3','5','7','8','9']);
    return {mode,prompt:target,hint:'',answer:target,options:shuffle(['2','3','5','7','8','9'].slice(0,4))};
  }
  if(mode==='odd') {
    const target=pick(['FISH','BIRD','CAT','DOG']);
    const options=['APPLE','CAR','TREE',target];
    return {mode,prompt:target,hint:'',answer:target,options:shuffle(options)};
  }
  if(mode==='truefalse') {
    const a=2+Math.floor(Math.random()*9), b=2+Math.floor(Math.random()*9);
    const truth=Math.random()>.5, result=truth?a+b:a+b+pick([1,2,3]);
    return {mode,prompt:a+' + '+b+' = '+result+'. Is it true?',hint:'',answer:truth?'TRUE':'FALSE',options:['TRUE','FALSE']};
  }
  const start=2+Math.floor(Math.random()*5), step=pick([2,3,4]);
  const answer=String(start+step*3);
  return {mode,prompt:'Complete the pattern: '+start+', '+(start+step)+', '+(start+2*step)+', ?',hint:'',answer,options:shuffle([answer,String(start+step*2),String(start+step*4),String(start+step*3+1)])};
}
const modeNames = {colour:'COLOUR RUSH',math:'MATHS RUN',animal:'ANIMAL KINGDOM',emoji:'EMOJI',word:'WORD CHALLENGE',shape:'SHAPE SHIFTER',memory:'MEMORY RUSH',odd:'ODD ONE OUT',truefalse:'TRUE OR FALSE',pattern:'PATTERN PANIC'};
function chooseMode() {
  if(selectedMode==='random') return pick(modes);
  return selectedMode;
}
function colorFor(value) {
  if(challenge.mode==='colour') return challenge.colors[value] || 0x6e7f91;
  if(challenge.mode==='truefalse') return value==='TRUE'?0x39c58b:0xf06a72;
  const palette=[0x73bff0,0xffc36c,0xb69af2,0x72d8b5];
  return palette[Math.max(0,challenge.options.indexOf(value))] || 0x7d91a8;
}
function labelFor(value) {
  if(challenge.icons?.[value]) return challenge.icons[value];
  return value;
}
function setupChallenge() {
  activeMode=chooseMode();
  challenge=makeChallenge(activeMode);
  $('mode-label').textContent=modeNames[activeMode];
  $('mode-chip').textContent=modeNames[activeMode];
  const promptEl=$('challenge-prompt');
  promptEl.textContent=challenge.prompt;
  $('challenge-hint').textContent='';
  const contrastingText={PINK:'#ff9bb9',BLUE:'#75c9f5',YELLOW:'#ffd45f',MINT:'#78dfbc',PURPLE:'#c0a5ff',PEACH:'#ffad8c'};
  promptEl.style.color=activeMode==='colour'?(contrastingText[challenge.answer]||'#ffffff'):'#ffffff';
  // Randomly scatter the safe answers across the entire arena; no edge or row is favoured.
  const baseSafeCount=Math.ceil(tileMeshes.length/challenge.options.length);
  const safeCount=Math.max(6,baseSafeCount-Math.floor((round-1)*1.1));
  const safeTiles=new Set(shuffle(tileMeshes).slice(0,safeCount));
  const distractors=shuffle(challenge.options.filter(value=>value!==challenge.answer));
  const remainingTiles=shuffle(tileMeshes.filter(tile=>!safeTiles.has(tile)));
  const distractorValues=shuffle(Array.from({length:remainingTiles.length},(_,i)=>distractors[i%distractors.length]));
  remainingTiles.forEach((tile,i)=>{tile.value=distractorValues[i];});
  tileMeshes.forEach(tile=>{
    if(safeTiles.has(tile)) tile.value=challenge.answer;
    tile.falling=false; tile.mesh.visible=true; tile.edge.visible=true;
    tile.mesh.position.set(tile.x,0,tile.z); tile.edge.position.set(tile.x,-.15,tile.z);
    tile.mesh.material.color.setHex(colorFor(tile.value));
    tile.mesh.material.emissive.setHex(0x000000);
    if(tile.label){
      tile.mesh.remove(tile.label);
      tile.label.material.map?.dispose();
      tile.label.material.dispose();
      tile.label=null;
    }
    // Colour Rush is a visual recognition challenge: show the colour itself,
    // not a text label that gives away the answer and clutters the tile.
    if(activeMode!=='colour'){
      tile.label=makeLabel(labelFor(tile.value), '#15243b');
      tile.mesh.add(tile.label);
    }
  });
}

function disposeActor(mesh) {
  if(!mesh) return;
  scene.remove(mesh);
  mesh.traverse(object=>{
    if(object.geometry) object.geometry.dispose();
    if(object.material){
      const materials=Array.isArray(object.material)?object.material:[object.material];
      materials.forEach(material=>{
        if(material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}
function spawnActors() {
  // Remove every character from the previous game before creating this game's cast.
  actors.forEach(a=>disposeActor(a.mesh));
  actors.length=0;
  disposeActor(player.mesh);
  player.mesh=null;
  player.mesh=makeActor(0xffa0c2,true,playerName); scene.add(player.mesh);
  player.x=0; player.z=HALF+0.5; player.y=0; player.vx=0; player.vz=0; player.vy=0; player.alive=true; player.onGround=true;
  for(let i=0;i<9;i++){
    const mesh=makeActor(npcColors[i],false,npcNames[i],i);
    scene.add(mesh);
    actors.push({mesh,name:npcNames[i],alive:true,x:(Math.random()-.5)*12,z:(Math.random()-.5)*12,target:null,speed:2.0+Math.random()*.65,decision:0});
  }
  updateActorPosition();
}
function updateActorPosition() {
  player.mesh.position.set(player.x,player.y,player.z);
  actors.forEach(a=>a.mesh.position.set(a.x,0,a.z));
}
function nearestTile(x,z) {
  let best=null, dist=Infinity;
  for(const t of tileMeshes){const d=(t.x-x)**2+(t.z-z)**2;if(d<dist){dist=d;best=t;}}
  return dist<STEP*STEP*1.8?best:null;
}
function chooseTarget() {
  const safe=tileMeshes.filter(t=>t.value===challenge.answer);
  if(!safe.length) return {x:0,z:0};
  return pick(safe);
}
function iSeed(x,z){return x*1.7+z*.9;}
function animateAvatar(mesh,running,t){
  const swing=running?Math.sin(t*2.8)*.48:0;
  mesh.rotation.z=running?Math.sin(t)*.025:Math.sin(t*.35)*.01;
  mesh.scale.y=1+(running?Math.sin(t*5.6)*.012:0);
  const limbs=mesh.userData.limbs;
  if(limbs && !Array.isArray(limbs)){
    limbs.legs?.forEach((leg,i)=>{leg.rotation.x=swing*(i===0?1:-1);});
    limbs.arms?.forEach((arm,i)=>{arm.rotation.x=-swing*(i===0?1:-1)*.65;});
  }
}
function directNPCs(dt) {
  for(const a of actors){
    if(!a.alive) continue;
    a.decision-=dt;
    if(!a.target||a.decision<=0){
      a.target=chooseTarget(); a.decision=2+Math.random()*2.5;
    }
    const dx=a.target.x-a.x,dz=a.target.z-a.z,dist=Math.hypot(dx,dz);
    if(dist>.25){a.x+=dx/dist*a.speed*dt;a.z+=dz/dist*a.speed*dt;}
    const running=dist>.25;
    a.mesh.position.set(a.x,Math.sin(performance.now()*.006+a.x)*.025,a.z);
    a.mesh.rotation.y=Math.atan2(dx,dz);
    animateAvatar(a.mesh,running,performance.now()*.012+iSeed(a.x,a.z));
  }
}
function setToast(message) {
  $('toast').textContent=message; $('toast').classList.add('show');
  clearTimeout(setToast.timer); setToast.timer=setTimeout(()=>$('toast').classList.remove('show'),1800);
}
function showMessage(message) {
  const el=$('round-message'); el.textContent=message; el.classList.add('show');
  clearTimeout(showMessage.timer); showMessage.timer=setTimeout(()=>el.classList.remove('show'),1500);
}
function updateHUD() {
  $('round-value').textContent=round+' / 10';
  $('alive-value').textContent=survivors;
  $('timer-value').textContent=Math.max(0,Math.ceil(timeLeft));
}
function startRound(first=false) {
  round++;
  createArena();
  setupChallenge();
  if(first||!player.alive) spawnActors();
  else {
    player.x=0; player.z=HALF+.3; player.y=0; player.vx=0; player.vz=0; player.vy=0; player.alive=true;
    player.mesh.visible=true;
    actors.forEach(a=>{if(a.alive){a.mesh.visible=true;a.x=(Math.random()-.5)*10;a.z=(Math.random()-.5)*10;a.target=null;a.decision=0;}});
  }
  actors.forEach(a=>{a.speed=(2.0+Math.random()*.65)*(1+(round-1)*.055);});
  survivors=(player.alive?1:0)+actors.filter(a=>a.alive).length;
  timeLeft=Math.max(4,7-(round-1)*0.3); phase='playing'; updateHUD();
  $('result-overlay').classList.add('hidden');
  showMessage('ROUND '+round+' — GO!');
}
function dropWrongTiles() {
  phase='falling';
  const playerTile=nearestTile(player.x,player.z);
  const playerSafe=player.alive&&playerTile&&playerTile.value===challenge.answer&&player.y<1.4;
  let eliminated=0;
  for(const a of actors){
    if(!a.alive) continue;
    const t=nearestTile(a.x,a.z);
    if(!t||t.value!==challenge.answer){a.alive=false;a.mesh.visible=false;eliminated++;}
  }
  if(!playerSafe){player.alive=false;player.mesh.visible=false;eliminated++;}
  survivors=(player.alive?1:0)+actors.filter(a=>a.alive).length;
  tileMeshes.forEach(t=>{
    if(t.value!==challenge.answer){t.falling=true;t.mesh.userData.fallSpeed=0;t.edge.visible=false;}
    else {t.mesh.material.emissive.setHex(0x183d2d);}
  });
  updateHUD();
  showMessage(playerSafe?'SAFE TILE!':'YOU FELL!');
  roundResolveTimer=1.2;
}
function resolveRound() {
  const championNPC=actors.find(a=>a.alive);
  if(!player.alive||survivors<=1||round>=10){
    phase='result';
    const playerWon=player.alive&&(survivors===1||round>=10);
    $('result-eyebrow').textContent=playerWon?'CHAMPION':'TOURNAMENT OVER';
    $('result-title').textContent=playerWon?'🏆 '+playerName+' WINS!':(survivors===1&&championNPC?championNPC.name+' WINS!':'You were eliminated');
    $('result-copy').textContent=playerWon?'You survived all 10 rounds and outlasted the competition!':(!player.alive?'Your run is over. The remaining competitors keep their places.':'The 10-round tournament has ended.');
    $('result-round').textContent=round+' / 10';
    $('result-alive').textContent=survivors;
    $('continue-button').textContent='PLAY AGAIN';
    $('result-overlay').classList.remove('hidden');
    return;
  }
  phase='between';
  betweenTimer=.35;
  showMessage('ROUND '+round+' COMPLETE!');
}
function movePlayer(dt) {
  if(!player.alive||phase!=='playing') return;
  let x=0,z=0;
  if(keys.has('KeyA')||keys.has('ArrowLeft')||touchDirections.has('left')) x-=1;
  if(keys.has('KeyD')||keys.has('ArrowRight')||touchDirections.has('right')) x+=1;
  if(keys.has('KeyW')||keys.has('ArrowUp')||touchDirections.has('up')) z-=1;
  if(keys.has('KeyS')||keys.has('ArrowDown')||touchDirections.has('down')) z+=1;
  x+=joystickVector.x; z+=joystickVector.y;
  const len=Math.hypot(x,z);
  if(len>1){x/=len;z/=len;}
  const desiredVX=x*player.speed, desiredVZ=z*player.speed;
  const response=len>.05?Math.min(1,dt*7):Math.min(1,dt*5);
  player.vx=THREE.MathUtils.lerp(player.vx,desiredVX,response);
  player.vz=THREE.MathUtils.lerp(player.vz,desiredVZ,response);
  player.x+=player.vx*dt; player.z+=player.vz*dt;
  player.x=THREE.MathUtils.clamp(player.x,-HALF-.4,HALF+.4);
  player.z=THREE.MathUtils.clamp(player.z,-HALF-.4,HALF+.4);
  if(player.jumpQueued&&player.onGround){player.vy=6.2;player.onGround=false;}
  player.jumpQueued=false;
  player.vy-=15*dt; player.y+=player.vy*dt;
  if(player.y<=0){player.y=0;player.vy=0;player.onGround=true;}
  player.mesh.position.set(player.x,player.y,player.z);
  if(len>.05) player.mesh.rotation.y=Math.atan2(x,z);
  animateAvatar(player.mesh,len>.05,performance.now()*.014);
}
function updateFalling(dt) {
  tileMeshes.forEach(t=>{
    if(!t.falling) return;
    t.mesh.userData.fallSpeed=(t.mesh.userData.fallSpeed||0)+17*dt;
    t.mesh.position.y-=t.mesh.userData.fallSpeed*dt;
    if(t.mesh.position.y< -12){t.mesh.visible=false;}
  });
}
function updateCamera(dt) {
  const target=new THREE.Vector3(player.x*.28,0,player.z*.28);
  camera.position.x=THREE.MathUtils.lerp(camera.position.x,target.x,Math.min(1,dt*2.5));
  camera.position.z=THREE.MathUtils.lerp(camera.position.z,13.2+target.z,Math.min(1,dt*2.0));
  camera.lookAt(player.x*.25,0,player.z*.25-.6);
}
function resize() {
  const rect=root.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width||root.clientWidth||window.innerWidth));
  const h=Math.max(1,Math.round(rect.height||root.clientHeight||window.innerHeight));
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(w,h,false);
}
let resizeFrame=0;
function scheduleResize(){
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(resize);
}
window.addEventListener('resize',scheduleResize,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(scheduleResize,120),{passive:true});
window.visualViewport?.addEventListener('resize',scheduleResize,{passive:true});
if(window.ResizeObserver){new ResizeObserver(scheduleResize).observe(root);}
resize();
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if(e.code==='Space') player.jumpQueued=true;
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function clearTouchInput(){
  touchDirections.clear();
  joystickVector={x:0,y:0};
  joystickPointer=null;
  keys.clear();
}
window.addEventListener('blur',clearTouchInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTouchInput();});
$('jump-button').addEventListener('pointerdown',e=>{
  e.preventDefault();
  if(e.isPrimary||e.pointerType==='touch') player.jumpQueued=true;
});
document.querySelectorAll('.move-button').forEach(button=>{
  const dir=button.dataset.direction;
  const down=e=>{
    e.preventDefault();
    touchDirections.add(dir);
    try{button.setPointerCapture(e.pointerId);}catch(_){}
  };
  const up=e=>{
    e.preventDefault();
    touchDirections.delete(dir);
  };
  button.addEventListener('pointerdown',down);
  button.addEventListener('pointerup',up);
  button.addEventListener('pointercancel',up);
  button.addEventListener('lostpointercapture',up);
});

$('continue-button').addEventListener('click',()=>{
  if(phase==='result'){round=0;player.alive=true;actors.forEach(a=>a.alive=true);startRound(true);}
  else startRound(false);
});
$('sound-button').addEventListener('click',()=>{
  soundOn=!soundOn;$('sound-button').textContent=soundOn?'♪':'×';setToast(soundOn?'Sound enabled':'Sound muted');
});
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(phase==='between'){
    betweenTimer-=dt;
    if(betweenTimer<=0) startRound(false);
  } else if(phase==='playing'){
    timeLeft-=dt;
    movePlayer(dt);directNPCs(dt);updateHUD();
    if(timeLeft<=0){timeLeft=0;dropWrongTiles();}
  } else if(phase==='falling'){
    updateFalling(dt);roundResolveTimer-=dt;
    if(roundResolveTimer<=0)resolveRound();
  }
  if(phase==='playing'||phase==='falling') updateCamera(dt);
  renderer.render(scene,camera);
}
createArena();
setupChallenge();
spawnActors();
actors.forEach(a=>{a.mesh.visible=false;});
player.mesh.visible=false;
animate();
