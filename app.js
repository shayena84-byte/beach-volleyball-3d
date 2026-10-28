import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#scene');
const wrapper = document.querySelector('#canvasWrap');
const loading = document.querySelector('#sceneLoading');
const errorBox = document.querySelector('#sceneError');
const timeline = document.querySelector('#timeline');
const timeLabel = document.querySelector('#timeLabel');
const stageCounter = document.querySelector('#stageCounter');
const stageDuration = document.querySelector('#stageDuration');
const stageTitle = document.querySelector('#stageTitle');
const stageDescription = document.querySelector('#stageDescription');
const stageFocus = document.querySelector('#stageFocus');
const playButton = document.querySelector('#playBtn');
const playIcon = document.querySelector('#playIcon');
const playText = document.querySelector('#playText');
const stageTiles = [...document.querySelectorAll('.stage-tile')];
const routesToggle = document.querySelector('#showRoutes');

const phases = [
  {title:'Выход в «крест»', badge:'ПОДГОТОВКА', desc:'Пасующий видит, что партнёр будет принимать, и заранее выходит в «крест».', focus:'В момент касания мяча пасующий уже должен быть в «кресте».'},
  {title:'Приём мяча',badge:'ПЕРВОЕ КАСАНИЕ',desc:'Нападающий подседает под мяч, наклоняет корпус вперёд и соединяет выпрямленные предплечья для нижнего приёма. Пасующий уже находится в «кресте».',focus:'В момент первого касания платформа из предплечий встречает мяч перед игроком; ноги сгибаются, руки не разводятся.'},
  {title:'Доводка и отход влево',badge:'СМЕНА ПОЗИЦИЙ',desc:'Мяч доводится вперёд, в «++». Нападающий отходит за левую боковую линию.',focus:'Игроки не пересекают путь друг друга: один идёт к мячу, второй освобождает пространство.'},
  {title:'Пасующий в зоне «++»',badge:'ТОЧКА ПЕРЕДАЧИ',desc:'Пасующий выходит под мяч ближе к сетке. Нападающий занимает точку старта разбега слева за площадкой.',focus:'«++» находится перед принимающим — это ориентир для качественной доводки.'},
  {title:'Высокая передача в зону 4',badge:'ВТОРОЕ КАСАНИЕ',desc:'Пасующий разворачивает корпус и взгляд к зоне 4, затем отправляет туда высокую передачу. Нападающий ещё готовится к разбегу.',focus:'Лицо пасующего и направление движения рук ориентированы к точке будущей атаки.'},
  {title:'Определение точки съёма',badge:'ЧТЕНИЕ ПЕРЕДАЧИ',desc:'После паса нападающий ждёт в точке разгона за левой боковой линией, следит за полётом мяча и определяет, где и когда сможет его снять.',focus:'Сначала прочитать траекторию высокой передачи и выбрать точку удара; ноги согнуты и готовы к мощному старту.'},
  {title:'Молниеносный разбег',badge:'ВЗРЫВНОЙ СТАРТ',desc:'Определив точку съёма, нападающий резко стартует с места и за короткое время проходит прямой коридор к зоне 4.',focus:'Взрывное ускорение после паузы, быстрые заключительные шаги лево–право–лево и своевременный прыжок.'},
  {title:'Синхронный удар',badge:'ТРЕТЬЕ КАСАНИЕ',desc:'Нападающий отталкивается двумя ногами, выводит ударную руку из положения «лук и стрела» и встречает мяч на максимальной высоте.',focus:'Контакт мяча с ладонью совпадает с завершающей фазой прыжка.'},
  {title:'Приземление и страховка',badge:'ЗАВЕРШЕНИЕ',desc:'После удара нападающий приземляется на обе ноги со сгибанием коленей, а пасующий занимает позицию для страховки.',focus:'Контролируемое приземление в песок и готовность к следующему действию.'},
];

const plan = (x,z,y=0) => new THREE.Vector3((x-189)*8/262,y,(z-75)*8/236);
const pathAttacker = [[103,272],[103,272],[25,227],[25,227],[25,227],[25,227],[25,227],[90,114],[95,134]].map(p=>plan(...p));
const pathSetter = [[266,268],[194,222],[156,181],[120,120],[120,120],[138,145],[146,155],[156,184],[162,192]].map(p=>plan(...p));
const ballFirst = [[103,36,4.4],[103,240,.65],[112,176,3.0],[120,103,2.44],[120,103,2.44]];
const plusPoint=plan(120,109), crossPoint=plan(194,222), attackPoint=plan(90,114), startPoint=plan(25,227);
let progress=0, playing=false, speed=1, lastTime=performance.now(), renderer, scene, camera, controls, attackPlayer, setPlayer, ballMesh, ballShadow, travelRoutes, aimMarker, aimLine, cameraPreset='isometric';
const clockDuration=16;
const viewPositions={isometric:[13.1,14.6,16.5],top:[0.01,21.5,4.0],attack:[14.8,7.9,4.1]};
let targetCamera=new THREE.Vector3(...viewPositions.isometric);
let targetOrbit=new THREE.Vector3(0,.6,0);
let wheelInteraction=false;

function mix(a,b,t){return a+(b-a)*t}
function smooth(t){return t*t*(3-2*t)}
function phasePosition(positions, phase,burst=false){
  let i=Math.min(positions.length-2,Math.floor(phase)),f=Math.max(0,Math.min(1,phase-i));
  if(burst&&i===6) f=smoothBetween(phase,6.12,6.94);
  return positions[i].clone().lerp(positions[i+1],f);
}
function stageAt(p){return Math.min(phases.length-1,Math.floor(p*phases.length+0.001))}
function threeMaterial(color,roughness=0.83,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness})}
function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);m.castShadow=true;m.receiveShadow=true;return m}
function sphere(parent,r,material,x=0,y=0,z=0,detail=24){return mesh(parent,new THREE.SphereGeometry(r,detail,detail/2),material,x,y,z)}
function capsule(parent,r,length,material,x=0,y=0,z=0){return mesh(parent,new THREE.CapsuleGeometry(r,length,8,14),material,x,y,z)}
function cylinderBetween(parent,start,end,r1,r2,mat){const direction=new THREE.Vector3().subVectors(end,start),mid=new THREE.Vector3().addVectors(start,end).multiplyScalar(.5);const m=mesh(parent,new THREE.CylinderGeometry(r1,r2,direction.length(),12),mat,mid.x,mid.y,mid.z);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return m}
function flatGroundMaterial(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,side:THREE.DoubleSide})}

function makeBallTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#f9f9f5';ctx.fillRect(0,0,1024,512);
  // Curved ten-panel layout, blue/yellow sweeping bands and orange-red dot transition.
  function band(center,width,color){ctx.fillStyle=color;ctx.beginPath();for(let y=-5;y<=517;y+=4){const x=center+Math.sin(y/512*Math.PI*2)*53+Math.sin(y/512*Math.PI*4)*13;if(y===-5)ctx.moveTo(x-width/2,y);else ctx.lineTo(x-width/2,y)}for(let y=517;y>=-5;y-=4){const x=center+Math.sin(y/512*Math.PI*2)*53+Math.sin(y/512*Math.PI*4)*13;ctx.lineTo(x+width/2,y)}ctx.closePath();ctx.fill()}
  for(let offset=-1024;offset<=2048;offset+=512){band(offset+166,170,'#1150B6');band(offset+310,115,'#FFD51D');}
  for(let offset=-1024;offset<=2048;offset+=512){
    for(let y=0;y<512;y+=7){const wav=Math.sin(y/512*Math.PI*2)*53+Math.sin(y/512*Math.PI*4)*13;const blueEdge=offset+166+85+wav;const yellowEdge=offset+310-57+wav;for(let d=0;d<25;d+=5){const coverage=Math.min(1,(25-d)/25);const rr=1.0+1.6*coverage;for(let k=-2;k<=2;k++){ctx.beginPath();ctx.arc(blueEdge-d+k*5,y+((k&1)*3),rr,0,Math.PI*2);ctx.fillStyle=`rgba(242,88,65,${0.26+0.54*coverage})`;ctx.fill()}}ctx.beginPath();ctx.arc(yellowEdge+12,y,1.4,0,Math.PI*2);ctx.fillStyle='#f77839';ctx.fill()}
  }
  // Fine leather embossing, printed seams and a small clean logo-like label.
  ctx.globalAlpha=.075;ctx.fillStyle='#3c5161';for(let y=2;y<512;y+=9){for(let x=2;x<1024;x+=9){ctx.beginPath();ctx.arc(x+(y%2)*3,y,1.3,0,Math.PI*2);ctx.fill()}}ctx.globalAlpha=1;
  ctx.lineWidth=2;ctx.strokeStyle='rgba(35,53,72,.2)';for(let x=0;x<=1024;x+=102.4){ctx.beginPath();for(let y=0;y<=512;y+=7){const xx=x+Math.sin(y/512*Math.PI*2)*14;y===0?ctx.moveTo(xx,y):ctx.lineTo(xx,y)}ctx.stroke()}
  ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.fillStyle='#1c2736';ctx.fillText('MIKASA',476,245);ctx.font='bold 21px Arial';ctx.fillText('BEACH PRO',475,275);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function makeNameSprite(text,bg){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(8,8,496,110,34);ctx.fill();ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.font='bold 40px Arial';ctx.fillText(text,256,80);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));sprite.scale.set(1.85,.46,1);return sprite}
function floorLabel(text,color,position){let c=document.createElement('canvas');c.width=512;c.height=256;const ct=c.getContext('2d');ct.fillStyle='rgba(255,255,255,.93)';ct.beginPath();ct.roundRect(35,45,442,155,30);ct.fill();ct.strokeStyle=color;ct.lineWidth=5;ct.stroke();ct.fillStyle=color;ct.font='bold 102px Arial';ct.textAlign='center';ct.textBaseline='middle';ct.fillText(text,256,125);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.65),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));sign.rotation.x=-Math.PI/2;sign.position.copy(position).add(new THREE.Vector3(0,.025,0));scene.add(sign);return sign}

function limbSegment(group,r,material){const m=mesh(group,new THREE.CylinderGeometry(r,r,1,12),material);m.castShadow=true;return m}
const UP=new THREE.Vector3(0,1,0);
function stretch(mesh,a,b){const vec=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=Math.max(.001,vec.length());mesh.quaternion.setFromUnitVectors(UP,vec.normalize())}
function createPlayer({shirt,shorts,skin,hair,accent,name,number}){
  const root=new THREE.Group();scene.add(root);
  const dark=threeMaterial(hair,.89),skinMat=threeMaterial(skin,.78),top=threeMaterial(shirt,.81),bottom=threeMaterial(shorts,.90),white=threeMaterial('#ffffff',.7),eye=threeMaterial('#1e303b',.55);
  const body=new THREE.Group();root.add(body);
  sphere(body,.32,bottom,0,1.05,0);
  const shirtMesh=sphere(body,.39,top,0,1.57,0);shirtMesh.scale.set(1,1.09,.74);
  sphere(body,.145,skinMat,0,2.02,0);
  sphere(body,.31,skinMat,0,2.27,0);
  const hairCap=sphere(body,.315,dark,0,2.42,.07);hairCap.scale.y=.52;
  for(const offset of [-.20,0,.20])sphere(body,.109,dark,offset,2.48,-.14);
  sphere(body,.050,skinMat,0,2.23,-.304);
  for(const side of [-1,1]){sphere(body,.046,eye,.124*side,2.31,-.276);sphere(body,.054,skinMat,.293*side,2.25,0)}
  const smile=new THREE.Mesh(new THREE.TorusGeometry(.085,.008,4,20,Math.PI),new THREE.MeshBasicMaterial({color:'#994e42'}));smile.rotation.x=Math.PI;smile.position.set(0,2.19,-.29);body.add(smile);
  const chest=new THREE.Mesh(new THREE.CircleGeometry(.13,24),white);chest.position.set(0,1.66,-.307);body.add(chest);
  const print=makeNameSprite(number,'#00000000');print.scale.set(.23,.19,1);print.position.set(0,1.66,-.32);body.add(print);
  const arms=[],legs=[];
  for(const sign of [-1,1]){
    const upper=limbSegment(body,.119,skinMat),lower=limbSegment(body,.098,skinMat);
    const elbow=sphere(body,.116,skinMat),palm=sphere(body,.122,skinMat);
    const sleeve=sphere(body,.15,top,sign*.36,1.79,0);
    arms.push({sign,upper,lower,elbow,palm,sleeve});
    const thigh=limbSegment(root,.145,skinMat),shin=limbSegment(root,.112,skinMat);
    const knee=sphere(root,.132,skinMat),ankle=sphere(root,.12,skinMat);
    const foot=sphere(root,.16,skinMat);foot.scale.set(1,.57,1.5);
    legs.push({sign,thigh,shin,knee,ankle,foot});
  }
  // A visible joined-hands silhouette reinforces the low bump technique.
  const clasp=sphere(body,.116,skinMat,0,1.18,-.83);clasp.scale.set(1.15,.7,1.0);clasp.visible=false;
  const label=makeNameSprite(name,accent);label.position.set(0,3.25,0);root.add(label);
  return {root,body,arms,legs,label,clasp,role:name};
}
function clamp01(x){return Math.min(1,Math.max(0,x))}
function smoothBetween(x,a,b){return smooth(clamp01((x-a)/(b-a)))}
function blendPose(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t)}
function setArms(player,posed){for(let i=0;i<2;i++){
  const part=player.arms[i],sign=part.sign,P=posed[i];
  const shoulder=new THREE.Vector3(sign*.365,1.78,0),elbow=new THREE.Vector3(...P.slice(0,3)),wrist=new THREE.Vector3(...P.slice(3,6));
  stretch(part.upper,shoulder,elbow);stretch(part.lower,elbow,wrist);part.elbow.position.copy(elbow);part.palm.position.copy(wrist);
}}
const armIdle=sign=>[sign*.48,1.40,-.06,sign*.51,1.13,-.29];
const armRun=(sign,wave)=>[sign*.49,1.48,wave*.11-.10,sign*.43,1.19,wave*.42-.12];
// Both elbows and wrists form one rigid, joined forearm platform in front of the hitter.
const armReceive=sign=>[sign*.21,1.49,-.43,sign*.055,1.18,-.83];
const armSetReady=sign=>[sign*.42,2.06,-.20,sign*.22,2.36,-.48];
const armSetPush=sign=>[sign*.35,2.33,-.26,sign*.17,2.77,-.42];
const armPlant=sign=>[sign*.57,1.23,.47,sign*.69,.93,.58];
const armLift=sign=>[sign*.44,2.05,-.20,sign*.33,2.51,-.38];
const armCock=sign=>sign>0?[.71,2.02,.30,.77,2.37,.55]:[-.37,2.25,-.22,-.22,2.66,-.38];
const armHit=sign=>sign>0?[.42,2.41,-.22,.19,2.79,-.53]:[-.53,1.60,-.15,-.31,1.26,-.34];
const armFollow=sign=>sign>0?[.31,1.42,-.44,.28,.96,-.52]:[-.52,1.38,-.10,-.47,1.09,-.34];

function buildScene(){
  scene=new THREE.Scene();scene.background=new THREE.Color('#a8dbdc');scene.fog=new THREE.Fog('#a8dbdc',22,68);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  camera=new THREE.PerspectiveCamera(38,1,.1,120);camera.position.copy(targetCamera);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.085;controls.enablePan=false;controls.minPolarAngle=.14;controls.maxPolarAngle=Math.PI/2.16;controls.minDistance=10;controls.maxDistance=39;controls.target.set(0,.5,0);controls.addEventListener('start',()=>{wheelInteraction=true;document.getElementById('cameraHint').style.opacity='0';document.querySelectorAll('.camera-btn').forEach(el=>{el.classList.remove('active');el.setAttribute('aria-pressed','false')})});
  const hemi=new THREE.HemisphereLight('#d5faff','#d19f68',2.1);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff5dd',3.2);sun.position.set(-8,17,11);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=19;sun.shadow.camera.bottom=-18;sun.shadow.normalBias=.02;sun.shadow.bias=-.0004;scene.add(sun);
  const sand=threeMaterial('#edd1a0',1);const world=mesh(scene,new THREE.PlaneGeometry(160,160),sand,0,-.10,0);world.rotation.x=-Math.PI/2;world.receiveShadow=true;world.castShadow=false;
  // Authentic footprint-scuffed sand texture made procedurally; no external image assets.
  const texCanvas=document.createElement('canvas');texCanvas.width=512;texCanvas.height=512;const c=texCanvas.getContext('2d');c.fillStyle='#edd0a0';c.fillRect(0,0,512,512);let seed=90210;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};for(let i=0;i<11000;i++){const v=Math.floor(rnd()*90);c.fillStyle=`rgba(${110+v},${86+v},${58+v},${.035+rnd()*.075})`;c.fillRect(rnd()*512,rnd()*512,rnd()*2+.5,rnd()*2+.5)}let sandTexture=new THREE.CanvasTexture(texCanvas);sandTexture.wrapS=sandTexture.wrapT=THREE.RepeatWrapping;sandTexture.repeat.set(12,12);sandTexture.colorSpace=THREE.SRGBColorSpace;world.material.map=sandTexture;world.material.needsUpdate=true;
  const playable=mesh(scene,new THREE.PlaneGeometry(8,16),threeMaterial('#f7ddac',1),0,-.06,0);playable.rotation.x=-Math.PI/2;playable.receiveShadow=true;playable.castShadow=false;
  const hintMat=new THREE.MeshBasicMaterial({color:'#e3854b',transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});const leftHighlight=mesh(scene,new THREE.PlaneGeometry(4,8),hintMat,-2,-.045,4);leftHighlight.rotation.x=-Math.PI/2;leftHighlight.castShadow=false;
  const boundaryMat=new THREE.MeshStandardMaterial({color:'#fff9f1',emissive:'#ddd1a7',emissiveIntensity:.12,roughness:.76});const circle=(p1,p2,r,material)=>cylinderBetween(scene,p1,p2,r,r,material);
  const border= [ [[-4,0,-8],[4,0,-8]], [[-4,0,8],[4,0,8]], [[-4,0,-8],[-4,0,8]], [[4,0,-8],[4,0,8]] ];
  for(const [[x1,y1,z1],[x2,y2,z2]] of border)circle(new THREE.Vector3(x1,.026,z1),new THREE.Vector3(x2,.026,z2),.045,boundaryMat);
  // Volleyball net, two pale poles, open mesh and white tape.
  const poleMat=threeMaterial('#f1f4f3',.42,.25);for(const x of [-4.13,4.13]){cylinderBetween(scene,new THREE.Vector3(x,0,0),new THREE.Vector3(x,2.75,0),.07,.07,poleMat);sphere(scene,.09,poleMat,x,2.76,0)}
  const netMat=new THREE.LineBasicMaterial({color:'#dce3e1',transparent:true,opacity:.82});for(let yy=.23;yy<=2.43;yy+=.17){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.11,yy,0),new THREE.Vector3(4.11,yy,0)]);scene.add(new THREE.Line(g,netMat))}for(let xx=-4.1;xx<=4.1;xx+=.23){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xx,.22,0),new THREE.Vector3(xx,2.43,0)]);scene.add(new THREE.Line(g,netMat))}
  const tape=threeMaterial('#f8fff5',.7);circle(new THREE.Vector3(-4.14,2.45,0),new THREE.Vector3(4.14,2.45,0),.055,tape);
  // Four gentle dune mounds and an ocean band in the distance.
  const duneMat=threeMaterial('#e6c48e',1);for(const [x,z,s] of [[-12,8,1.6],[13,5,1.7],[-13,-11,1.3],[11,-14,1.4]]){const dune=sphere(scene,3.2*s,duneMat,x,-2.8,z,20);dune.scale.set(1,.45,.75);dune.castShadow=false}
  const ocean=mesh(scene,new THREE.PlaneGeometry(170,42),new THREE.MeshBasicMaterial({color:'#64a9b7'}),0,-.4,-38);ocean.rotation.x=-Math.PI/2;ocean.castShadow=false;
  // Small coral posts and beach pennants in distant background.
  for(const [x,z] of [[-9,-11],[9,-10]]){circle(new THREE.Vector3(x,.1,z),new THREE.Vector3(x,2.4,z),.045,threeMaterial('#d9b879'));const flag=mesh(scene,new THREE.PlaneGeometry(.75,.45),new THREE.MeshBasicMaterial({color:x<0?'#e99b54':'#68b5b0',side:THREE.DoubleSide}),x+.38,2.1,z);flag.castShadow=false}
  // Training guides are objects in 3D, not part of a flat image.
  travelRoutes=new THREE.Group();scene.add(travelRoutes);
  function guide(points,color,width){const pts=points.map(p=>new THREE.Vector3(p.x,.065,p.z));const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,width,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false}));tube.castShadow=false;travelRoutes.add(tube)}
  guide([pathSetter[0],pathSetter[1],pathSetter[3]],'#2d9cce',.030);
  guide([pathAttacker[1],pathAttacker[2]],'#cb8758',.030);
  guide([pathAttacker[3],pathAttacker[6]],'#db7540',.050);
  const setTrajectory=new THREE.QuadraticBezierCurve3(new THREE.Vector3(plusPoint.x,2.44,plusPoint.z),new THREE.Vector3(-2.60,8.2,1.05),new THREE.Vector3(attackPoint.x+.09,3.47,attackPoint.z-.40));
  const throwLine=new THREE.Mesh(new THREE.TubeGeometry(setTrajectory,80,.014,6,false),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.75,depthWrite:false}));throwLine.castShadow=false;travelRoutes.add(throwLine);
  function ring(pos,r,color){const tor=new THREE.Mesh(new THREE.TorusGeometry(r,.048,8,60),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.86}));tor.rotation.x=-Math.PI/2;tor.position.copy(pos);tor.position.y=.09;tor.castShadow=false;travelRoutes.add(tor);return tor}
  ring(plusPoint,.58,'#48ad89');ring(crossPoint,.52,'#43a5d7');ring(startPoint,.44,'#dd8b57');floorLabel('++','#2b9a76',plusPoint);floorLabel('×','#208aaa',crossPoint);
  attackPlayer=createPlayer({shirt:'#e87946',shorts:'#293e43',skin:'#e5b28c',hair:'#49392e',accent:'#d8784a',name:'НАПАДАЮЩИЙ',number:'7'});
  setPlayer=createPlayer({shirt:'#2795bc',shorts:'#224455',skin:'#f0c29b',hair:'#634638',accent:'#2c94b9',name:'ПАСУЮЩИЙ',number:'2'});
  const realisticTexture=makeBallTexture();const bumpTex=makeBallBumpTexture();ballMesh=mesh(scene,new THREE.SphereGeometry(.205,64,48),new THREE.MeshStandardMaterial({map:realisticTexture,bumpMap:bumpTex,bumpScale:.012,roughness:.76,metalness:0}),0,2,0);ballMesh.castShadow=true;
  ballShadow=mesh(scene,new THREE.CircleGeometry(.24,36),new THREE.MeshBasicMaterial({color:'#48584b',transparent:true,opacity:.23,depthWrite:false}),0,.013,0);ballShadow.rotation.x=-Math.PI/2;ballShadow.castShadow=false;
  resize();new ResizeObserver(resize).observe(wrapper);setProgress(0);loading.style.display='none';
}
function makeBallBumpTexture(){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#858585';ctx.fillRect(0,0,c.width,c.height);let seed=4623;for(let y=2;y<c.height;y+=6)for(let x=2;x<c.width;x+=6){seed=(seed*1664525+1013904223)>>>0;let r=.9+(seed%100)/1000;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle='#b2b2b2';ctx.fill()}let tex=new THREE.CanvasTexture(c);tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;return tex}
function resize(){if(!renderer)return;const w=wrapper.clientWidth,h=wrapper.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
// Ball meets the swinging hand at phase 6, then crosses the net into the opposing court.
function interpolateBall(phase){
  if(phase<=4){let i=Math.min(3,Math.floor(phase)),f=Math.max(0,Math.min(1,phase-i));let p=ballFirst[i],q=ballFirst[i+1];return plan(mix(p[0],q[0],f),mix(p[1],q[1],f),mix(p[2],q[2],f))}
  const contact=new THREE.Vector3(attackPoint.x+.09,3.47,attackPoint.z-.40);
  if(phase<=7){let u=(phase-4)/3;return new THREE.QuadraticBezierCurve3(new THREE.Vector3(plusPoint.x,2.44,plusPoint.z),new THREE.Vector3(-2.60,8.2,1.05),contact).getPoint(u)}
  return new THREE.QuadraticBezierCurve3(contact,new THREE.Vector3(-2.3,3.3,-1.8),new THREE.Vector3(-1.25,1.02,-5.1)).getPoint(Math.min(1,phase-7));
}
function posePlayer(player,position,phase,role){
  const hitter=role==='attack',path=hitter?pathAttacker:pathSetter;
  player.root.position.copy(position);
  const i=Math.min(6,Math.floor(phase));const advance=path[i+1].clone().sub(path[i]);
  const running=hitter?(phase>1.18&&phase<2.95)||(phase>4.36&&phase<5.77):(phase<.96)||(phase>1.45&&phase<3.12)||(phase>4.15&&phase<5.5);
  // The model's eyes face LOCAL -Z. Under a positive Y rotation, -Z points
  // toward NEGATIVE world X: atan2(-dx,-dz), not atan2(dx,-dz).
  const heading=advance.lengthSq()>.005?Math.atan2(-advance.x,-advance.z):0;
  const passDirection=attackPoint.clone().sub(plusPoint);
  const setterFace=Math.atan2(-passDirection.x,-passDirection.z);
  const approach=pathSetter[3].clone().sub(pathSetter[2]);
  const approachFace=Math.atan2(-approach.x,-approach.z);
  const cover=pathSetter[5].clone().sub(pathSetter[4]);
  const coverFace=Math.atan2(-cover.x,-cover.z);
  const rotateToward=(from,to,t)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*t;
  // Turn smoothly during arrival, look straight toward zone 4 throughout the
  // overhead pass, and only then rotate toward the defensive coverage route.
  const setterFacing=phase<2.78?heading:
    phase<3.25?rotateToward(approachFace,setterFace,smoothBetween(phase,2.78,3.25)):
    phase<4.38?setterFace:rotateToward(setterFace,coverFace,smoothBetween(phase,4.38,4.80));
  const face=hitter?(phase<1.22?0:phase<3.15?heading:phase<4.4?0:heading):setterFacing;
  player.root.rotation.y=face;
  const runCycle=Math.sin(phase*(hitter?16.2:13.5));
  const runIntensity=running?(hitter&&phase>4.36?Math.min(1,.38+(phase-4.36)*.48):.78):0;
  // The receiver is already low BEFORE impact and remains low through touch.
  const passDip=hitter?(1-smoothBetween(phase,1.08,1.38))*smoothBetween(phase,.21,.80):0;
  const setterDip=!hitter?smoothBetween(phase,2.7,3.3)*(1-smoothBetween(phase,3.92,4.18)):.0;
  const plantDip=hitter?smoothBetween(phase,5.43,5.65)*(1-smoothBetween(phase,5.73,5.86))*.27:0;
  const landingDip=hitter?smoothBetween(phase,6.55,6.87)*.17:0;
  const crouch=passDip*.40+setterDip*.22+plantDip+landingDip;
  const jump=hitter?(smoothBetween(phase,5.67,5.93)*.68*(1-smoothBetween(phase,6.10,6.96))):0;
  player.root.position.y=jump+(running?Math.abs(runCycle)*.035:0);
  player.body.position.y=-crouch;
  player.body.rotation.x=hitter?(-.045-passDip*.20-plantDip*.24):(-setterDip*.07);
  player.body.rotation.z=hitter&&phase>5.75&&phase<6.30?-.055:0;
  // Three accelerating steps (left–right–left), two-foot plant and sand-absorbing landing.
  const feetSpread=hitter&&phase>=5.53&&phase<5.81?.35:(hitter?.20+passDip*.13:.20);
  const stride=runIntensity*runCycle*.32;
  player.legs.forEach(leg=>{
    const sign=leg.sign,footZ=runIntensity?(-sign*stride): (hitter&&phase>5.55&&phase<5.78?(sign>0?.30:-.15):.05);
    const x=sign*feetSpread;
    const hip=new THREE.Vector3(sign*.17,1.02-crouch,passDip*.11);
    const foot=new THREE.Vector3(x,.12,footZ-.09);
    // Knees advance over the toes while the hips drop into a receiving squat.
    const knee=new THREE.Vector3(sign*(feetSpread+.012),.54-crouch*.32,footZ*.45-.12-passDip*.38);
    if(jump>.06){knee.y=.57-crouch*.2;knee.z+=.22;foot.z+=.26;foot.y+=Math.sin(clamp01(jump/.75)*Math.PI)*.1}
    stretch(leg.thigh,hip,knee);stretch(leg.shin,knee,foot);
    leg.knee.position.copy(knee);leg.ankle.position.copy(foot);
    leg.foot.position.copy(foot).add(new THREE.Vector3(0,-.025,-.13));
  });
  let armPos;
  if(hitter){
    const rec=smoothBetween(phase,.16,.78)*(1-smoothBetween(phase,1.08,1.38));
    player.clasp.visible=rec>.55;
    armPos=[-1,1].map(sign=>blendPose(armRun(sign,runCycle*runIntensity),armReceive(sign),rec));
    if(phase>4.40){const plant=smoothBetween(phase,5.34,5.63);
      armPos=[-1,1].map(sign=>blendPose(armRun(sign,runCycle*runIntensity),armPlant(sign),plant));
      if(phase>5.65){const lift=smoothBetween(phase,5.65,5.80);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armLift(sign),lift))}
      if(phase>5.80){const cock=smoothBetween(phase,5.80,5.92);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armCock(sign),cock))}
      if(phase>5.92){const hit=smoothBetween(phase,5.93,6.0);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armHit(sign),hit))}
      if(phase>6.02){const follow=smoothBetween(phase,6.04,6.38);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armFollow(sign),follow))}
      if(phase>6.55){const settle=smoothBetween(phase,6.55,6.95);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armIdle(sign),settle))}
    }
  }else{
    const readiness=smoothBetween(phase,2.70,3.30);
    armPos=[-1,1].map(sign=>blendPose(armRun(sign,runCycle*runIntensity),armSetReady(sign),readiness));
    const release=smoothBetween(phase,3.90,4.05);
    armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armSetPush(sign),release));
    if(phase>4.12){const follow=smoothBetween(phase,4.12,4.6);armPos=[-1,1].map((sign,j)=>blendPose(armPos[j],armIdle(sign),follow))}
  }
  setArms(player,armPos);
  player.label.position.y=3.25+jump*.2;
}

function setProgress(p){progress=Math.max(0,Math.min(1,p));const phase=Math.min(8,progress*phases.length);timeline.value=Math.round(progress*1000);timeline.style.setProperty('--pct',`${progress*100}%`);const secs=Math.floor(progress*clockDuration);timeLabel.textContent=`00:${String(secs).padStart(2,'0')} / 00:16`;
  let current=stageAt(progress);stageCounter.textContent=`ЭТАП ${String(current+1).padStart(2,'0')} / 09`;stageDuration.textContent=phases[current].badge;stageTitle.textContent=phases[current].title;stageDescription.textContent=phases[current].desc;stageFocus.textContent=phases[current].focus;
  stageTiles.forEach((el,i)=>{el.classList.toggle('selected',i===current);el.setAttribute('aria-pressed',String(i===current))});
  if(attackPlayer){posePlayer(attackPlayer,phasePosition(pathAttacker,phase,true),phase,'attack');posePlayer(setPlayer,phasePosition(pathSetter,phase),phase,'set');ballMesh.position.copy(interpolateBall(phase));ballMesh.rotation.set(phase*.7,phase*1.1,phase*.38);ballShadow.position.set(ballMesh.position.x,.012,ballMesh.position.z);const s=1+ballMesh.position.y/4;ballShadow.scale.set(s,s,s);ballShadow.material.opacity=Math.max(.07,.27-ballMesh.position.y*.032)}
}
function setPlaying(active){playing=active;playIcon.textContent=playing?'Ⅱ':'▶';playText.textContent=playing?'Пауза':'Воспроизвести';playButton.setAttribute('aria-label',playing?'Приостановить воспроизведение':'Запустить воспроизведение')}
function view(name){cameraPreset=name;wheelInteraction=false;targetCamera.set(...viewPositions[name]);document.querySelectorAll('.camera-btn').forEach(el=>{const active=el.dataset.view===name;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))})}
function animate(now){requestAnimationFrame(animate);const delta=Math.min(.08,(now-lastTime)/1000);lastTime=now;if(playing){let n=progress+delta*speed/clockDuration;if(n>=1){n=1;setPlaying(false)}setProgress(n)}
  if(renderer){if(!wheelInteraction){camera.position.lerp(targetCamera,.05);controls.target.lerp(targetOrbit,.05)}controls.update();renderer.render(scene,camera)}}
function initEvents(){timeline.addEventListener('input',e=>{setPlaying(false);setProgress(+e.target.value/1000)});playButton.addEventListener('click',()=>{if(progress>=1)setProgress(0);setPlaying(!playing)});document.querySelector('#backBtn').addEventListener('click',()=>{setPlaying(false);setProgress(Math.max(0,(Math.ceil(progress*phases.length-.001)-1)/phases.length))});document.querySelector('#nextBtn').addEventListener('click',()=>{setPlaying(false);setProgress(Math.min(1,(Math.floor(progress*phases.length+.001)+1)/phases.length))});document.querySelector('#speed').addEventListener('change',e=>{speed=Number(e.target.value)});stageTiles.forEach(b=>b.addEventListener('click',()=>{setPlaying(false);setProgress(+b.dataset.stage/phases.length)}));document.querySelectorAll('.camera-btn').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));routesToggle.addEventListener('change',()=>{if(travelRoutes)travelRoutes.visible=routesToggle.checked});const help=document.querySelector('#helpDialog');document.querySelector('#helpButton').addEventListener('click',()=>help.showModal());document.querySelector('#closeHelp').addEventListener('click',()=>help.close());document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||help.open)return;if(e.code==='Space'){e.preventDefault();if(progress>=1)setProgress(0);setPlaying(!playing)}if(e.code==='ArrowRight'){e.preventDefault();setPlaying(false);setProgress(Math.min(1,(Math.floor(progress*phases.length+.001)+1)/phases.length))}if(e.code==='ArrowLeft'){e.preventDefault();setPlaying(false);setProgress(Math.max(0,(Math.ceil(progress*phases.length-.001)-1)/phases.length))}});document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false)})}

initEvents();
try{buildScene();requestAnimationFrame(animate)}catch(err){console.error('Failed to initialize 3D scene',err);loading.style.display='none';errorBox.hidden=false}