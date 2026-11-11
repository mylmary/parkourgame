import * as THREE from 'three';

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
const root = $('game-root');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dbbd1);
scene.fog = new THREE.Fog(0x9dbbd1, 25, 58);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(0, 13, 16);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x52627a, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
scene.add(sun);

const arena = new THREE.Group();
scene.add(arena);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ color: 0x71899a, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.5;
floor.receiveShadow = true;
scene.add(floor);

const GRID = 10, TILE = 1.62, GAP = 0.09, STEP = TILE + GAP;
const HALF = (GRID - 1) * STEP / 2;
const tileMeshes = [];
const tileLabels = [];
const actors = [];
const keys = new Set();
const clock = new THREE.Clock();
const player = { mesh: null, x: 0, z: 0, y: 0, vy: 0, alive: true, speed: 4.8, onGround: true, jumpQueued: false };
let round = 0, timeLeft = 5, phase = 'menu', selectedMode = 'random', activeMode = 'colour';
let challenge = null, survivors = 16, soundOn = true, lastTime = 0, roundResolveTimer = 0, betweenTimer = 0, playerName = 'Player';
let joystickVector = { x: 0, y: 0 }, joystickPointer = null;
const touchDirections = new Set();
const npcNames = ['Milo','Zara','Kai','Luna','Theo','Mia','Leo','Nia','Ari','Ezra','Ivy','Noah','Ava','Finn','Remy'];
const npcColors = [0xff776d,0xffbd4a,0x8c79ef,0x37c6a0,0x5aa8ef,0xe979b5,0xd1e45d,0xff8a45,0x63d7df,0xa0a8ff,0xe6a45c,0x65c48b,0xd78df0,0xf07158,0x7ca8dc];

function makeLabel(text, color = '#17243a') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(255,255,255,.93)';
  roundRect(ctx, 8, 8, 240, 112, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '900 54px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text).slice(0, 9), 128, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.12, 0.56, 1);
  sprite.position.y = 0.28;
  return sprite;
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function makeActor(color, isPlayer = false, displayName = '') {
  // Block-built avatar inspired by the familiar Roblox toy-like proportions.
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: .72 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2bd91, roughness: .82 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x263d68, roughness: .8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17243a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.66,.72,.36), shirt);
  torso.position.y=1.02; group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.54,.54,.54), skin);
  head.position.y=1.68; group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(.56,.16,.56), new THREE.MeshStandardMaterial({color:pick([0x34271f,0x553624,0x171717,0x8c5b32])}));
  hair.position.y=2.02; group.add(hair);
  for(const x of [-.12,.12]){
    const eye=new THREE.Mesh(new THREE.BoxGeometry(.055,.065,.025),dark);
    eye.position.set(x,1.72,.285);group.add(eye);
  }
  const leftArm=new THREE.Group(),rightArm=new THREE.Group();
  leftArm.position.set(-.43,1.32,0);rightArm.position.set(.43,1.32,0);
  for(const arm of [leftArm,rightArm]){
    const limb=new THREE.Mesh(new THREE.BoxGeometry(.22,.62,.25),skin);
    limb.position.y=-.30;arm.add(limb);group.add(arm);
  }
  const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
  leftLeg.position.set(-.19,.67,0);rightLeg.position.set(.19,.67,0);
  for(const leg of [leftLeg,rightLeg]){
    const limb=new THREE.Mesh(new THREE.BoxGeometry(.27,.64,.3),pants);
    limb.position.y=-.31;leg.add(limb);group.add(leg);
  }
  if(isPlayer){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.045,8,24),new THREE.MeshStandardMaterial({color:0x7ff0ba,emissive:0x174d38}));
    ring.rotation.x=Math.PI/2;ring.position.y=.035;group.add(ring);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.34,.065,10,32),new THREE.MeshStandardMaterial({color:0xffd75e,emissive:0x9b650e,emissiveIntensity:.7,metalness:.55,roughness:.25}));
    halo.position.y=2.22;halo.rotation.x=Math.PI/2;group.add(halo);
    const nameCanvas=document.createElement('canvas');nameCanvas.width=512;nameCanvas.height=128;
    const ctx=nameCanvas.getContext('2d');ctx.fillStyle='rgba(10,25,45,.84)';roundRect(ctx,8,8,496,112,28);ctx.fill();
    ctx.strokeStyle='#ffd75e';ctx.lineWidth=5;roundRect(ctx,8,8,496,112,28);ctx.stroke();
    ctx.fillStyle='#ffffff';ctx.font='900 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((displayName||'PLAYER').toUpperCase(),256,65,450);
    const tagTexture=new THREE.CanvasTexture(nameCanvas);tagTexture.colorSpace=THREE.SRGBColorSpace;
    const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tagTexture,transparent:true,depthTest:false}));
    tag.scale.set(1.8,.45,1);tag.position.y=2.72;group.add(tag);
  }
  group.userData.limbs=[leftArm,rightArm,leftLeg,rightLeg];
  group.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return group;
}

function createArena() {
  while (arena.children.length) {
    const child = arena.children.pop();
    child.traverse?.(o => { if(o.geometry) o.geometry.dispose(); if(o.material) { if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material.dispose(); } });
  }
  tileMeshes.length = 0; tileLabels.length = 0;
  const padGeo = new THREE.BoxGeometry(TILE, .28, TILE);
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
  const wallMat = new THREE.MeshStandardMaterial({color:0x526d83, roughness:.9});
  const railGeo = new THREE.BoxGeometry(17,.35,.35);
  for (const z of [-HALF-1.3, HALF+1.3]) {
    const rail = new THREE.Mesh(railGeo, wallMat); rail.position.set(0,.05,z); arena.add(rail);
  }
  const sideGeo = new THREE.BoxGeometry(.35,.35,17);
  for (const x of [-HALF-1.3, HALF+1.3]) {
    const rail = new THREE.Mesh(sideGeo, wallMat); rail.position.set(x,.05,0); arena.add(rail);
  }
}

const modes = ['colour','math','animal','word','shape','memory','odd','truefalse','pattern'];
const palettes = [
  {name:'RED',hex:0xf45d65},{name:'BLUE',hex:0x438fe8},{name:'YELLOW',hex:0xf4c84d},
  {name:'GREEN',hex:0x35bd83},{name:'PURPLE',hex:0x9a75e8},{name:'ORANGE',hex:0xf08a45}
];
const animals = [{n:'CAT',e:'🐱'},{n:'DOG',e:'🐶'},{n:'LION',e:'🦁'},{n:'FISH',e:'🐟'},{n:'BIRD',e:'🐦'},{n:'PANDA',e:'🐼'}];
const shapes = [{n:'CIRCLE',e:'●'},{n:'STAR',e:'★'},{n:'SQUARE',e:'■'},{n:'HEART',e:'♥'},{n:'TRIANGLE',e:'▲'},{n:'DIAMOND',e:'◆'}];
const words = [{n:'APPLE',e:'APPLE'},{n:'HOUSE',e:'HOUSE'},{n:'RIVER',e:'RIVER'},{n:'CLOUD',e:'CLOUD'},{n:'PLANT',e:'PLANT'},{n:'TRAIN',e:'TRAIN'}];
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
  if(mode==='word') {
    const target=pick(words);
    return {mode,prompt:target.n,hint:'',answer:target.n,options:shuffle([target.n,...shuffle(words.filter(w=>w.n!==target.n).map(w=>w.n)).slice(0,3)])};
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
const modeNames = {colour:'COLOUR RUSH',math:'MATH MADNESS',animal:'ANIMAL KINGDOM',word:'WORD CHALLENGE',shape:'SHAPE SHIFTER',memory:'MEMORY RUSH',odd:'ODD ONE OUT',truefalse:'TRUE OR FALSE',pattern:'PATTERN PANIC'};
function chooseMode() {
  if(selectedMode==='random') return pick(modes);
  return selectedMode;
}
function colorFor(value) {
  if(challenge.mode==='colour') return challenge.colors[value] || 0x6e7f91;
  if(challenge.mode==='truefalse') return value==='TRUE'?0x39c58b:0xf06a72;
  const palette=[0x4e9de8,0xf0ad4e,0x9a7be8,0x42b9a1];
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
  const contrastingText={RED:'#438fe8',BLUE:'#ffd34f',YELLOW:'#f45d65',GREEN:'#a88aff',PURPLE:'#ffd34f',ORANGE:'#438fe8'};
  promptEl.style.color=activeMode==='colour'?(contrastingText[challenge.answer]||'#ffffff'):'#ffffff';
  const values=[];
  while(values.length<tileMeshes.length) values.push(challenge.options[values.length%challenge.options.length]);
  const shuffled=shuffle(values);
  tileMeshes.forEach((tile,i)=>{
    tile.value=shuffled[i]; tile.falling=false; tile.mesh.visible=true; tile.edge.visible=true;
    tile.mesh.position.set(tile.x,0,tile.z); tile.edge.position.set(tile.x,-.15,tile.z);
    tile.mesh.material.color.setHex(colorFor(tile.value));
    tile.mesh.material.emissive.setHex(0x000000);
    if(tile.label){tile.mesh.remove(tile.label);tile.label.material.map.dispose();tile.label.material.dispose();}
    tile.label=makeLabel(labelFor(tile.value), '#15243b');
    tile.mesh.add(tile.label);
  });
}

function spawnActors() {
  actors.forEach(a=>scene.remove(a.mesh));
  actors.length=0;
  player.mesh=makeActor(0x17bd85,true,playerName); scene.add(player.mesh);
  player.x=0; player.z=HALF+0.5; player.y=0; player.vy=0; player.alive=true; player.onGround=true;
  for(let i=0;i<15;i++){
    const mesh=makeActor(npcColors[i]);
    scene.add(mesh);
    actors.push({mesh,name:npcNames[i],alive:true,x:(Math.random()-.5)*12,z:(Math.random()-.5)*12,target:null,speed:3.3+Math.random()*1.5,decision:0});
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
  const limbs=mesh.userData.limbs;if(!limbs)return;
  const swing=running?Math.sin(t)*.62:0;
  limbs[0].rotation.x=swing;limbs[1].rotation.x=-swing;
  limbs[2].rotation.x=-swing;limbs[3].rotation.x=swing;
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
    player.x=0; player.z=HALF+.3; player.y=0; player.vy=0; player.alive=true;
    player.mesh.visible=true;
    actors.forEach(a=>{if(a.alive){a.mesh.visible=true;a.x=(Math.random()-.5)*10;a.z=(Math.random()-.5)*10;a.target=null;a.decision=0;}});
  }
  survivors=(player.alive?1:0)+actors.filter(a=>a.alive).length; timeLeft=5; phase='playing'; updateHUD();
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
  player.x+=x*player.speed*dt; player.z+=z*player.speed*dt;
  player.x=THREE.MathUtils.clamp(player.x,-HALF-.4,HALF+.4);
  player.z=THREE.MathUtils.clamp(player.z,-HALF-.4,HALF+.4);
  if(player.jumpQueued&&player.onGround){player.vy=7.4;player.onGround=false;}
  player.jumpQueued=false;
  player.vy-=18*dt; player.y+=player.vy*dt;
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
  camera.position.z=THREE.MathUtils.lerp(camera.position.z,16+target.z,Math.min(1,dt*2.5));
  camera.lookAt(player.x*.2,0,player.z*.2-1);
}
function resize() {
  const rect=root.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width||root.clientWidth||window.innerWidth));
  const h=Math.max(1,Math.round(rect.height||root.clientHeight||window.innerHeight));
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
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
