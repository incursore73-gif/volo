/* ============================================================
   MICRO RACING 3D — gara dall'alto stile "micro machine"
   SX: gas + freno · DX: sterzo · fuori pista = si rallenta
   ============================================================ */
import * as THREE from 'three';

/* ---------- utilità ---------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
const UP=new THREE.Vector3(0,1,0);
const wrapA=a=>{a=(a+Math.PI)%TAU;if(a<0)a+=TAU;return a-Math.PI;};
const $=id=>document.getElementById(id);
const fmt=t=>{if(t<=0)return'0:00.00';const m=Math.floor(t/60),s=t-m*60;
  return m+':'+String(Math.floor(s)).padStart(2,'0')+'.'+String(Math.floor((s%1)*100)).padStart(2,'0');};
const ord=r=>r+'º';

/* ---------- costanti ---------- */
const ROAD_HALF=7, CURB_W=1.6, SHOULDER=6.5, LIM=ROAD_HALF+SHOULDER;
const LAPS=3, N=500, STEP=1/60;
const VMAX=34, ACCEL=17, BRAKE=34, TURN_MAX=2.4, WB=2.6, A_LAT=17;
const NOS_ACC=13, NOS_VMAX=42, SMOKE_N=70;

/* ---------- renderer / scena ---------- */
const renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xbfe4f4);
scene.fog=new THREE.Fog(0xbfe4f4,170,430);
const cam=new THREE.PerspectiveCamera(55,1,0.5,700);
scene.add(new THREE.HemisphereLight(0xfff6e0,0x9a7f4e,0.95));
const sun=new THREE.DirectionalLight(0xfff1cf,1.15);
sun.position.set(80,120,40); scene.add(sun);

/* ---------- texture procedurali ---------- */
function canvasTex(w,h,draw,rx=1,ry=1){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'));
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
const rnd=Math.random;
function speckle(g,w,h,n,cols,a){for(let i=0;i<n;i++){g.globalAlpha=a*rnd();
  g.fillStyle=cols[(rnd()*cols.length)|0];g.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1+rnd()*2);}g.globalAlpha=1;}
const roadTex=canvasTex(256,256,g=>{
  g.fillStyle='#3c3f44';g.fillRect(0,0,256,256);
  speckle(g,256,256,1400,['#33363b','#45484e','#54575d'],0.5);
  g.fillStyle='#e9e9e9';g.fillRect(0,4,256,9);g.fillRect(0,243,256,9); // bordi bianchi
  g.fillRect(0,120,120,16); // linea tratteggiata centrale
});
const curbTex=canvasTex(64,64,g=>{g.fillStyle='#e02020';g.fillRect(0,0,32,64);g.fillStyle='#f4f4f4';g.fillRect(32,0,32,64);});
const wallTex=canvasTex(128,64,g=>{for(let i=0;i<4;i++){g.fillStyle=i%2?'#f4f4f4':'#e02020';g.fillRect(i*32,0,32,64);}});
const sandTex=canvasTex(256,256,g=>{
  g.fillStyle='#d7a95e';g.fillRect(0,0,256,256);
  speckle(g,256,256,1600,['#c29148','#e2ba74','#caa055'],0.45);
  for(let i=0;i<14;i++){g.globalAlpha=0.07;g.fillStyle='#b98a41';
    g.beginPath();g.arc(rnd()*256,rnd()*256,8+rnd()*26,0,TAU);g.fill();}
  g.globalAlpha=1;
},46,46);
const checkTex=canvasTex(128,32,g=>{
  const s=16;for(let y=0;y<2;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?'#111':'#fafafa';g.fillRect(x*s,y*s,s,s);}
},4,1);
const bannerTex=canvasTex(512,96,g=>{
  g.fillStyle='#15181c';g.fillRect(0,0,512,96);
  for(let x=0;x<32;x++){g.fillStyle=x%2?'#fafafa':'#e02020';g.fillRect(x*16,0,16,14);g.fillRect(x*16,82,16,14);}
  g.fillStyle='#ffd400';g.font='800 52px "Barlow Condensed",Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillText('MICRO RACING 3D',256,48);
});

/* ---------- tracciato ---------- */
const CP=[[-90,-70],[-30,-85],[40,-80],[95,-60],[112,-15],[88,32],[35,42],
          [-8,62],[-52,78],[-96,62],[-118,18],[-122,-32]];
const curve=new THREE.CatmullRomCurve3(CP.map(p=>new THREE.Vector3(p[0],0,p[1])),true,'catmullrom',0.6);
const trackLen=curve.getLength(), ds=trackLen/N;
const pts=[],nrm=[],hl=[],curvArr=[],scArr=[];
for(let i=0;i<N;i++){
  const t=i/N, p=curve.getPointAt(t), tg=curve.getTangentAt(t);
  pts.push({x:p.x,z:p.z});
  nrm.push({x:tg.z,z:-tg.x});
  hl.push(Math.atan2(tg.x,tg.z));
}
for(let i=0;i<N;i++){
  const dh=wrapA(hl[(i+1)%N]-hl[i]);
  curvArr.push(Math.abs(dh)/ds); scArr.push(dh/ds);
}
/* ---------- costruzione geometrie lungo il tracciato ---------- */
function ribbon(o1,o2,y,mat,uPeriod){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const k=i%N,p=pts[k],n=nrm[k],d=(i===N?trackLen:i*ds);
    pos.push(p.x+n.x*o1,y,p.z+n.z*o1, p.x+n.x*o2,y,p.z+n.z*o2);
    uv.push(d/uPeriod,0, d/uPeriod,1);
  }
  for(let i=0;i<N;i++){const a=i*2;idx.push(a,a+2,a+1, a+1,a+2,a+3);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g,mat);
}
function wall(offset,h,mat){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const k=i%N,p=pts[k],n=nrm[k],d=(i===N?trackLen:i*ds);
    pos.push(p.x+n.x*offset,0,p.z+n.z*offset, p.x+n.x*offset,h,p.z+n.z*offset);
    uv.push(d/3.5,0, d/3.5,1);
  }
  for(let i=0;i<N;i++){const a=i*2;idx.push(a,a+1,a+2, a+1,a+3,a+2);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat); m.material.side=THREE.DoubleSide; return m;
}
/* terreno sabbioso */
const ground=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100),new THREE.MeshLambertMaterial({map:sandTex}));
ground.rotation.x=-Math.PI/2; scene.add(ground);
/* specchio d'acqua decorativo */
const water=new THREE.Mesh(new THREE.PlaneGeometry(260,560),new THREE.MeshLambertMaterial({color:0x2fa6d8}));
water.rotation.x=-Math.PI/2; water.position.set(330,0.02,-30); scene.add(water);
/* asfalto + cordoli + barriere */
const roadMat=new THREE.MeshLambertMaterial({map:roadTex});
const curbMat=new THREE.MeshLambertMaterial({map:curbTex});
const wallMat=new THREE.MeshLambertMaterial({map:wallTex});
const curbL=ribbon(-ROAD_HALF-CURB_W,-ROAD_HALF,0.045,curbMat,3);
const curbR=ribbon(ROAD_HALF,ROAD_HALF+CURB_W,0.045,curbMat,3);
const roadMesh=ribbon(-ROAD_HALF,ROAD_HALF,0.02,roadMat,9);
scene.add(curbL,curbR,roadMesh);
scene.add(wall(ROAD_HALF+SHOULDER+0.6,0.95,wallMat));
scene.add(wall(-(ROAD_HALF+SHOULDER+0.6),0.95,wallMat));
/* striscia di partenza + cancella */
{
  const p0=pts[0],h0=hl[0],n0=nrm[0];
  const stripGeo=new THREE.PlaneGeometry((ROAD_HALF+CURB_W)*2,3.4); stripGeo.rotateX(-Math.PI/2);
  const strip=new THREE.Mesh(stripGeo,new THREE.MeshLambertMaterial({map:checkTex}));
  strip.position.set(p0.x,0.06,p0.z); strip.rotation.y=h0; scene.add(strip);
  const postG=new THREE.BoxGeometry(0.6,6,0.6), postM=new THREE.MeshLambertMaterial({color:0x2a2e33});
  for(const s of[-1,1]){
    const post=new THREE.Mesh(postG,postM);
    post.position.set(p0.x+n0.x*s*11,3,p0.z+n0.z*s*11); scene.add(post);
  }
  const bmats=[postM,postM,postM,postM,
    new THREE.MeshLambertMaterial({map:bannerTex}),new THREE.MeshLambertMaterial({map:bannerTex})];
  const ban=new THREE.Mesh(new THREE.BoxGeometry(22.6,1.6,0.35),bmats);
  ban.position.set(p0.x,6.4,p0.z); ban.rotation.y=h0; scene.add(ban);
}
/* scena: palmi, coni, pneumatici */
function palm(x,z){
  const g=new THREE.Group();
  const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.45,5.2,7),new THREE.MeshLambertMaterial({color:0x8a5a2b}));
  tr.position.y=2.6; tr.rotation.z=(rnd()-0.5)*0.25; g.add(tr);
  const lm=new THREE.MeshLambertMaterial({color:0x2e8b3a,flatShading:true});
  for(let i=0;i<6;i++){
    const leaf=new THREE.Mesh(new THREE.ConeGeometry(0.55,3.4,4),lm);
    leaf.position.y=5.2;
    leaf.rotation.z=1.25; leaf.rotation.y=i/6*TAU;
    leaf.translateY(1.1);
    g.add(leaf);
  }
  g.position.set(x,0,z); g.rotation.y=rnd()*TAU; scene.add(g);
}
function cone(x,z){const c=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.05,9),
  new THREE.MeshLambertMaterial({color:0xff6a00}));c.position.set(x,0.52,z);scene.add(c);}
function tires(x,z){
  const m=new THREE.MeshLambertMaterial({color:0x17191c});
  for(let i=0;i<3;i++){const t=new THREE.Mesh(new THREE.TorusGeometry(0.75,0.3,8,14),m);
    t.rotation.x=Math.PI/2;t.position.set(x,0.32+i*0.6,z);scene.add(t);}
}
function distTrack(x,z){let bd=1e9;for(let i=0;i<N;i+=3){const dx=pts[i].x-x,dz=pts[i].z-z;const d=dx*dx+dz*dz;if(d<bd)bd=d;}return Math.sqrt(bd);}
for(let i=0;i<N;i+=6){
  const cv=Math.abs(curvArr[i]);
  if(cv>0.016){
    const s=Math.sign(scArr[i])||1;
    cone(pts[i].x-nrm[i].x*s*(ROAD_HALF+3),pts[i].z-nrm[i].z*s*(ROAD_HALF+3));
    if(cv>0.03&&i%12===0)tires(pts[i].x+nrm[i].x*s*(ROAD_HALF+5),pts[i].z+nrm[i].z*s*(ROAD_HALF+5));
  }
}
for(let i=0;i<70;i++){
  const x=-150+rnd()*330,z=-140+rnd()*270;
  if(distTrack(x,z)>17)palm(x,z);
}
/* ---------- auto giocattolo ---------- */
function buildCar(color){
  const g=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color,flatShading:true});
  const dark=new THREE.MeshLambertMaterial({color:0x14181c});
  const glass=new THREE.MeshLambertMaterial({color:0x9fd4ea,flatShading:true});
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.62,4.0),mat); body.position.y=0.62; g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.55,1.9),glass); cab.position.set(0,1.15,-0.25); g.add(cab);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(1.78,0.14,1.95),mat); roof.position.set(0,1.45,-0.25); g.add(roof);
  const sp=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.1,0.55),dark); sp.position.set(0,1.08,-2.0); g.add(sp);
  const wSteer=[],wSpin=[];
  const wheel=(x,z,st)=>{
    const ws=new THREE.Group(); ws.position.set(x,0.42,z);
    const wp=new THREE.Group();
    const cyl=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.36,10),dark);
    cyl.rotation.z=Math.PI/2; wp.add(cyl); ws.add(wp); g.add(ws);
    if(st)wSteer.push(ws); wSpin.push(wp);
  };
  wheel(-1.05,1.35,true); wheel(1.05,1.35,true);
  wheel(-1.05,-1.35,false); wheel(1.05,-1.35,false);
  const sh=new THREE.Mesh(new THREE.CircleGeometry(1,20),
    new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.28,depthWrite:false}));
  sh.scale.set(1.5,2.4,1); sh.rotation.x=-Math.PI/2; sh.position.y=0.1; g.add(sh);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(0.4,1.5,7),
    new THREE.MeshBasicMaterial({color:0xffa63d}));
  flame.rotation.x=-Math.PI/2; flame.position.set(0,0.62,-2.7); flame.visible=false; g.add(flame);
  scene.add(g);
  return {g,wSteer,wSpin,flame};
}
function makeCar(color,isAI,skill,laneOff){
  const v=buildCar(color);
  return {g:v.g,wSteer:v.wSteer,wSpin:v.wSpin,flame:v.flame,
    color:'#'+color.toString(16).padStart(6,'0'),isAI,skill,laneOff,
    x:0,z:0,h:0,vx:0,vz:0,along:0,lat:0,spin:0,
    d:0,hint:-1,lastU:0,prog:0,lapFloor:-1,lapStart:0,bestLap:0,finished:0,
    input:{th:0,br:0,st:0,nos:false},stuck:0,rev:0,markT:0,onRoad:true,
    nitro:100,boost:false,wrongT:0,backDist:0,smokeT:0};
}
const cars=[
  makeCar(0xffd400,true,1.03,-2.6),
  makeCar(0x18a84a,true,0.98,0),
  makeCar(0x2e6cff,true,0.93,2.6),
  makeCar(0xe8200f,false,1,0) // giocatore (ultima casella: deve rimontare!)
];
const player=cars[3];

/* ---------- segni di derapata (instanced) ---------- */
const skidGeo=new THREE.PlaneGeometry(0.4,1.4); skidGeo.rotateX(-Math.PI/2);
const skids=new THREE.InstancedMesh(skidGeo,
  new THREE.MeshBasicMaterial({color:0x1c1c1c,transparent:true,opacity:0.5,depthWrite:false}),160);
skids.frustumCulled=false; skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(skids);
const skA=[]; let skCur=0;
for(let i=0;i<160;i++)skA.push({age:99,x:0,z:0,h:0});
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
function spawnMark(x,z,h){const m=skA[skCur++%160];m.age=0;m.x=x;m.z=z;m.h=h;}
function updateSkids(dt){
  for(let i=0;i<160;i++){
    const m=skA[i]; m.age+=dt;
    const s=Math.max(0,1-m.age/8);
    _q.setFromAxisAngle(UP,m.h); _p.set(m.x,0.07,m.z); _s.set(1,1,s);
    _m.compose(_p,_q,_s); skids.setMatrixAt(i,_m);
  }
  skids.instanceMatrix.needsUpdate=true;
}

/* ---------- fumo di derapata / nitro (instanced) ---------- */
const smokeGeo=new THREE.PlaneGeometry(1,1); smokeGeo.rotateX(-Math.PI/2);
const smokes=new THREE.InstancedMesh(smokeGeo,
  new THREE.MeshBasicMaterial({color:0xefe6d4,transparent:true,opacity:0.55,depthWrite:false}),SMOKE_N);
smokes.frustumCulled=false; smokes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(smokes);
const smA=[]; let smCur=0;
for(let i=0;i<SMOKE_N;i++)smA.push({age:99,x:0,z:0,dr:0});
function spawnSmoke(x,z){const m=smA[smCur++%SMOKE_N];m.age=0;m.x=x;m.z=z;m.dr=rnd()*TAU;}
const SMOKE_LIFE=0.75;
function updateSmoke(dt){
  for(let i=0;i<SMOKE_N;i++){
    const m=smA[i]; m.age+=dt;
    const t=m.age/SMOKE_LIFE;
    const s=t>=1?0:(0.8+t*2.4)*(1-t*0.85);
    _q.setFromAxisAngle(UP,m.dr); _p.set(m.x,0.35+(t>=1?0:t*0.9),m.z); _s.set(s,1,s);
    _m.compose(_p,_q,_s); smokes.setMatrixAt(i,_m);
  }
  smokes.instanceMatrix.needsUpdate=true;
}

/* ---------- proiettore del tracciato ---------- */
function nearest(x,z,hint){
  let best=0,bd=1e9;
  if(hint>=0){
    for(let o=-45;o<=45;o++){const k=(hint+o+N)%N;
      const dx=pts[k].x-x,dz=pts[k].z-z,d=dx*dx+dz*dz;
      if(d<bd){bd=d;best=k;}}
    if(bd<(ds*4)*(ds*4))return best;
    bd=1e9;
  }
  for(let k=0;k<N;k+=2){const dx=pts[k].x-x,dz=pts[k].z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;best=k;}}
  return best;
}
function project(x,z,k){
  let bd=1e9,bu=0,qx=0,qz=0;
  for(const j of[(k-1+N)%N,k]){
    const k2=(j+1)%N;
    const ax=pts[j].x,az=pts[j].z,abx=pts[k2].x-ax,abz=pts[k2].z-az;
    const L2=abx*abx+abz*abz||1e-9;
    const t=clamp(((x-ax)*abx+(z-az)*abz)/L2,0,1);
    const px=ax+abx*t,pz=az+abz*t;
    const d=Math.hypot(x-px,z-pz);
    if(d<bd){bd=d;bu=((j+t)/N)%1;qx=px;qz=pz;}
  }
  return {d:bd,u:bu,qx,qz};
}
/* ---------- fisica auto ---------- */
function stepCar(c,dt){
  const inp=c.input;
  const fx=Math.sin(c.h),fz=Math.cos(c.h);
  let along=c.vx*fx+c.vz*fz;
  let lat=c.vx*-fz+c.vz*fx;
  const onRoad=c.d<=ROAD_HALF+1.2;
  c.onRoad=onRoad;
  // nitro: consuma/ricarica
  c.boost=!!inp.nos&&inp.th>0&&c.nitro>0;
  if(c.boost)c.nitro=Math.max(0,c.nitro-30*dt);
  else c.nitro=Math.min(100,c.nitro+(c.isAI?9:7)*dt);
  // sterzo: angolo ridotto in velocità
  const steer=inp.st*(0.52/(1+Math.abs(along)*0.028));
  const rate=clamp((along/WB)*Math.tan(steer),-TURN_MAX,TURN_MAX);
  c.h=(c.h+rate*dt%TAU+TAU)%TAU;
  // motore / freni / resistenze
  let a=inp.th*ACCEL+(c.boost?NOS_ACC:0);
  a-=inp.br*(Math.abs(along)>0.3?BRAKE*Math.sign(along):6);
  a-=(onRoad?0.006:0.014)*along*Math.abs(along);
  a-=(onRoad?0.8:2.4)*Math.sign(along);
  if(!onRoad)a-=1.2*along;           // sabbia: rallenta forte
  along+=a*dt;
  const vmax=onRoad?(c.boost?NOS_VMAX:VMAX):13;
  if(along>vmax)along=Math.max(vmax,along-22*dt); // scende dolce a fine nitro
  if(along<-9)along=-9;
  // aderenza: meno grip = derapate
  const damp=clamp(onRoad?9-Math.abs(along)*0.12:2.0,2.5,9);
  lat*=Math.exp(-damp*dt);
  const fx2=Math.sin(c.h),fz2=Math.cos(c.h);
  c.vx=fx2*along-fz2*lat;
  c.vz=fz2*along+fx2*lat;
  c.x+=c.vx*dt; c.z+=c.vz*dt;
  // distanza dal tracciato + limite oltre la sabbia
  const k=nearest(c.x,c.z,c.hint); c.hint=k;
  const pr=project(c.x,c.z,k);
  c.d=pr.d;
  if(c.d>LIM){
    let nx=c.x-pr.qx,nz=c.z-pr.qz;const L=Math.hypot(nx,nz)||1;nx/=L;nz/=L;
    c.x=pr.qx+nx*LIM; c.z=pr.qz+nz*LIM;
    const vn=c.vx*nx+c.vz*nz;
    if(vn>0){
      c.vx-=nx*vn; c.vz-=nz*vn;      // via la componente verso il muro
      c.vx*=0.985; c.vz*=0.985;      // strisciata: un po' d'attrito
      // il muso scivola lungo la barriera, così si può ripartire
      const t1x=-nz,t1z=nx,s=(c.vx*t1x+c.vz*t1z)>=0?1:-1;
      const wh=Math.atan2(t1x*s,t1z*s);
      c.h+=clamp(wrapA(wh-c.h),-3*dt,3*dt);
      if(!c.isAI&&vn>5&&scrapeCd<=0){scrapeCd=0.3;beep(120,0.09);
        navigator.vibrate&&navigator.vibrate(18);}
    }
    c.d=LIM;
  }
  // progresso continuo (giri e classifica)
  let du=pr.u-c.lastU;
  if(du<-0.5)du+=1;else if(du>0.5)du-=1;
  c.prog+=du*trackLen; c.lastU=pr.u;
  c.along=along; c.lat=lat;
  // senso contrario (solo giocatore): retrocessione reale > 2,5 m
  if(!c.isAI){
    c.backDist=du<0?(c.backDist||0)-du*trackLen:0;
    c.wrongT=(c.backDist>2.5&&along>2)?(c.wrongT||0)+dt:0;
  }
  // segni di derapata
  c.markT-=dt;
  if(c.markT<=0&&(Math.abs(lat)>3.8||(!onRoad&&Math.abs(along)>4))){
    c.markT=0.03;
    const rx=c.x-fx2*1.45,rz=c.z-fz2*1.45;
    const sx=Math.cos(c.h),sz=-Math.sin(c.h);
    spawnMark(rx+sx*1.0,rz+sz*1.0,c.h);
    spawnMark(rx-sx*1.0,rz-sz*1.0,c.h);
  }
  // fumo: derapata, sabbia o nitro
  c.smokeT-=dt;
  if(c.smokeT<=0&&((c.boost&&onRoad)||Math.abs(lat)>5||(!onRoad&&Math.abs(along)>6))){
    c.smokeT=0.06;
    spawnSmoke(c.x-fx2*2.1+(rnd()-0.5)*1.2,c.z-fz2*2.1+(rnd()-0.5)*1.2);
  }
  // visuale
  c.g.position.set(c.x,0,c.z);
  c.g.rotation.y=c.h;
  const sv=inp.st*0.45;
  for(const w of c.wSteer)w.rotation.y=sv;
  c.spin+=along/0.42*dt;
  for(const w of c.wSpin)w.rotation.x=c.spin;
  c.flame.visible=c.boost;
  if(c.boost)c.flame.scale.set(1,0.65+rnd()*0.6,1);
}
function collide(){
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const A=cars[i],B=cars[j];
    const dx=B.x-A.x,dz=B.z-A.z,d=Math.hypot(dx,dz);
    if(d<2.6&&d>0.001){
      const nx=dx/d,nz=dz/d,push=(2.6-d)/2;
      A.x-=nx*push;A.z-=nz*push;B.x+=nx*push;B.z+=nz*push;
      const vrel=(A.vx-B.vx)*nx+(A.vz-B.vz)*nz;
      if(vrel>0){const p=vrel*0.65;
        A.vx-=nx*p;A.vz-=nz*p;B.vx+=nx*p;B.vz+=nz*p;
        if((A===player||B===player)&&vrel>7&&collCd<=0){collCd=0.18;
          beep(85,0.1);navigator.vibrate&&navigator.vibrate(25);}
      }
    }
  }
}
/* ---------- AI ---------- */
function aiThink(c,dt){
  const inp=c.input;
  if(state!=='run'){inp.th=0;inp.br=0;inp.st=0;inp.nos=false;return;}
  if(c.rev>0){c.rev-=dt;inp.th=0;inp.br=1;inp.st=c.rev>0.55?0.5:-0.5;inp.nos=false;return;}
  const k=c.hint;
  const la=(k+Math.max(3,Math.round((5+Math.abs(c.along)*0.55)/ds)))%N;
  const off=clamp(c.laneOff-Math.sign(scArr[k]||1)*3.0,-5.5,5.5);
  const tx=pts[la].x+nrm[la].x*off,tz=pts[la].z+nrm[la].z*off;
  inp.st=clamp(wrapA(Math.atan2(tx-c.x,tz-c.z)-c.h)*2.2,-1,1);
  const w=Math.max(6,Math.round((10+Math.abs(c.along)*1.5)/ds));
  let cm=0;
  for(let o=2;o<2+w;o++)cm=Math.max(cm,curvArr[(k+o)%N]);
  // rubber band leggera: se è lontana dal giocatore si adegua
  const gap=player.prog-c.prog;
  const band=gap>26?1.12:gap<-26?0.93:1;
  const vT=clamp(Math.sqrt(A_LAT/Math.max(cm,1e-4))*band,9,VMAX*c.skill);
  inp.th=c.along<vT?1:0;
  inp.br=c.along>vT+2?0.7:0;
  inp.nos=cm<0.006&&c.along>vT*0.8&&c.nitro>25;   // nitro in rettilineo
  if(Math.abs(c.along)<1.2){c.stuck+=dt;if(c.stuck>1.6){c.rev=1.1;c.stuck=0;}}else c.stuck=0;
}
/* ---------- input ---------- */
let gasOn=false,brkOn=false,nosOn=false;
function pedal(el,set){
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);
    set(true);el.classList.add('on');initAudio();});
  const off=()=>{set(false);el.classList.remove('on');};
  el.addEventListener('pointerup',off);
  el.addEventListener('pointercancel',off);
  el.addEventListener('lostpointercapture',off);
}
pedal($('gas'),v=>gasOn=v);
pedal($('brk'),v=>brkOn=v);
pedal($('nos'),v=>nosOn=v);
let steerId=null,steerVal=0,steerActive=false;
const wz=$('wheelzone'),wheelEl=$('wheel');
const updSteer=e=>{
  const r=wheelEl.getBoundingClientRect();
  steerVal=clamp((e.clientX-(r.left+r.width/2))/80,-1,1);
};
wz.addEventListener('pointerdown',e=>{e.preventDefault();
  if(steerId!==null)return;
  steerId=e.pointerId;wz.setPointerCapture(e.pointerId);steerActive=true;updSteer(e);initAudio();});
wz.addEventListener('pointermove',e=>{if(e.pointerId===steerId)updSteer(e);});
const wUp=e=>{if(e.pointerId===steerId){steerId=null;steerActive=false;steerVal=0;}};
wz.addEventListener('pointerup',wUp); wz.addEventListener('pointercancel',wUp);
const keys={};
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  if(e.code==='Enter'&&state==='menu')startRace();
});
addEventListener('keyup',e=>{keys[e.code]=false;});
document.addEventListener('contextmenu',e=>e.preventDefault());
function playerInput(dt){
  const tSt=steerActive?steerVal:
    (keys.ArrowLeft||keys.KeyA?-1:0)+(keys.ArrowRight||keys.KeyD?1:0);
  player.input.st=lerp(player.input.st,tSt,1-Math.exp(-dt*10));
  player.input.th=(gasOn||keys.ArrowUp||keys.KeyW)?1:0;
  player.input.br=(brkOn||keys.ArrowDown||keys.KeyS)?1:0;
  player.input.nos=(nosOn||keys.Space||keys.ShiftLeft)&&player.input.th>0;
  $('nosbar').firstElementChild.style.width=Math.round(player.nitro)+'%';
  wheelEl.style.transform='rotate('+Math.round(player.input.st*120)+'deg)';
}

/* ---------- audio ---------- */
let actx=null,engOsc=null,engGain=null,muted=false;
function initAudio(){
  if(actx)return;
  try{
    actx=new(window.AudioContext||window.webkitAudioContext)();
    engOsc=actx.createOscillator();engOsc.type='sawtooth';
    const f=actx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;
    engGain=actx.createGain();engGain.gain.value=0;
    engOsc.connect(f).connect(engGain).connect(actx.destination);
    engOsc.start();
  }catch(e){}
}
function beep(fr,d){
  if(!actx||muted)return;
  try{
    const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;
    o.type='square';o.frequency.value=fr;g.gain.value=0.07;
    o.connect(g).connect(actx.destination);
    g.gain.setValueAtTime(0.07,t+d-0.04);g.gain.linearRampToValueAtTime(0,t+d);
    o.start(t);o.stop(t+d+0.02);
  }catch(e){}
}
function updateAudio(){
  if(!actx)return;
  const on=!muted&&state==='run';
  engGain.gain.setTargetAtTime(on?0.03+0.025*player.input.th+(player.boost?0.012:0):0,actx.currentTime,0.08);
  engOsc.frequency.setTargetAtTime(55+Math.abs(player.along)*3.4+(player.boost?55:0),actx.currentTime,0.05);
}
$('snd').addEventListener('click',()=>{muted=!muted;$('snd').textContent=muted?'🔇':'🔊';});
/* ---------- logica di gara ---------- */
let state='menu',cd=0,lastCd=4,raceT=0,msgT=0,finishCount=0,menuT=0,collCd=0,scrapeCd=0;
const rankOf=c=>{let r=1;for(const o of cars)if(o!==c&&o.prog>c.prog)r++;return r;};
function gapText(){
  const sp=Math.max(6,Math.abs(player.along));
  let bd=1e9,other=null;
  for(const o of cars){
    if(o===player)continue;
    const d=o.prog-player.prog;
    if(Math.abs(d)<Math.abs(bd)){bd=d;other=o;}
  }
  if(!other||Math.abs(bd)<1)return'';
  return(bd>0?'+':'-')+(Math.abs(bd)/sp).toFixed(1)+'s';
}
function msgShow(t,d){const m=$('msg');m.textContent=t;m.style.opacity=1;msgT=d;}
function lapEvents(c){
  const nf=Math.floor(c.prog/trackLen);
  if(nf>c.lapFloor){
    c.lapFloor=nf;
    if(nf===0)c.lapStart=raceT;
    if(nf>=1){
      const lt=raceT-c.lapStart;c.lapStart=raceT;
      if(!c.isAI&&(!c.bestLap||lt<c.bestLap)){c.bestLap=lt;
        if(nf<LAPS)msgShow('GIRO VELOCE! '+fmt(lt),1.4);}
      if(nf>=LAPS&&!c.finished){c.finished=++finishCount;if(!c.isAI)endRace();}
    }
  }
}
function endRace(){
  if(state!=='run')return;
  state='end';
  const r=rankOf(player);
  $('endpos').textContent=r===1?'🏆 VITTORIA!':ord(r)+' POSTO';
  $('endtime').textContent='Tempo totale: '+fmt(raceT);
  let extra='Miglior giro: '+fmt(player.bestLap);
  const rec=parseFloat(localStorage.getItem('micro3d_best')||'0');
  if(!rec||raceT<rec){localStorage.setItem('micro3d_best',raceT);extra+=' · NUOVO RECORD! 🏅';}
  else extra+=' · Record: '+fmt(rec);
  $('endbest').textContent=extra;
  $('end').classList.remove('hidden');
  updateMenuRec();
}
function updateMenuRec(){
  const rec=parseFloat(localStorage.getItem('micro3d_best')||'0');
  $('rec').textContent=rec?'Il tuo record: '+fmt(rec):'Nessun record: stabilisci il primo!';
}
function resetRace(){
  finishCount=0;raceT=0;msgT=0;
  for(const m of skA)m.age=99;
  cars.forEach((c,i)=>{
    const row=i>>1,col=i&1,back=13+row*9;
    const u0=(((1-back/trackLen)%1)+1)%1;
    const k=Math.round(u0*N)%N,lat=col?3.4:-3.4;
    c.x=pts[k].x+nrm[k].x*lat; c.z=pts[k].z+nrm[k].z*lat; c.h=hl[k];
    c.vx=c.vz=c.along=c.lat=c.spin=0;
    c.hint=nearest(c.x,c.z,-1);
    const pr=project(c.x,c.z,c.hint);
    c.d=pr.d; c.lastU=pr.u;
    c.prog=pr.u*trackLen; if(c.prog>trackLen/2)c.prog-=trackLen;
    c.lapFloor=Math.floor(c.prog/trackLen);
    c.lapStart=0;c.bestLap=0;c.finished=0;c.stuck=0;c.rev=0;
    c.input.th=0;c.input.br=0;c.input.st=0;c.input.nos=false;
    c.nitro=100;c.boost=false;c.wrongT=0;c.backDist=0;c.smokeT=0;
    c.flame.visible=false;
    c.g.position.set(c.x,0,c.z); c.g.rotation.y=c.h;
  });
  cam.position.set(player.x,60,player.z+30);
  $('end').classList.add('hidden');
}
function startRace(){
  initAudio();
  if(actx&&actx.state==='suspended')actx.resume();
  try{
    if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});
    screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{});
  }catch(e){}
  $('menu').classList.add('hidden');
  resetRace();
  state='count';cd=3.2;lastCd=4;
}
$('play').addEventListener('click',startRace);
$('again').addEventListener('click',startRace);
$('rst').addEventListener('click',()=>{if(state!=='menu')startRace();});
updateMenuRec();

/* ---------- minimappa ---------- */
const mm=$('mm'),dpr=Math.min(devicePixelRatio,2);
const MMW=150;
mm.width=MMW*dpr; mm.height=MMW*dpr;
const mmx=mm.getContext('2d');
let mnx=1e9,mnz=1e9,mxx=-1e9,mxz=-1e9;
for(const p of pts){mnx=Math.min(mnx,p.x);mnz=Math.min(mnz,p.z);mxx=Math.max(mxx,p.x);mxz=Math.max(mxz,p.z);}
const msc=(MMW-26)/Math.max(mxx-mnx,mxz-mnz);
const mapPt=p=>[(p.x-mnx)*msc+13,(p.z-mnz)*msc+13];
const mapPath=new Path2D();
{const[a,b]=mapPt(pts[0]);mapPath.moveTo(a,b);
 for(let i=4;i<N;i+=4){const[x,y]=mapPt(pts[i]);mapPath.lineTo(x,y);}
 mapPath.closePath();}
function drawMinimap(){
  mmx.setTransform(dpr,0,0,dpr,0,0);
  mmx.clearRect(0,0,MMW,MMW);
  mmx.lineJoin='round';mmx.lineCap='round';
  mmx.strokeStyle='rgba(255,255,255,.9)';mmx.lineWidth=9;mmx.stroke(mapPath);
  mmx.strokeStyle='#45484e';mmx.lineWidth=5.5;mmx.stroke(mapPath);
  const n0=nrm[0],[ax,ay]=mapPt(pts[0]);
  mmx.strokeStyle='#ffd400';mmx.lineWidth=3;mmx.beginPath();
  mmx.moveTo(ax-n0.x*msc*10,ay-n0.z*msc*10);mmx.lineTo(ax+n0.x*msc*10,ay+n0.z*msc*10);mmx.stroke();
  for(let i=cars.length-1;i>=0;i--){
    const c=cars[i],[x,y]=mapPt(c);
    mmx.beginPath();mmx.arc(x,y,c.isAI?3.6:4.6,0,TAU);
    mmx.fillStyle=c.color;mmx.fill();
    mmx.lineWidth=1.6;mmx.strokeStyle=c.isAI?'rgba(0,0,0,.5)':'#fff';mmx.stroke();
  }
}

/* ---------- HUD ---------- */
function updateHUD(){
  $('pos').textContent=ord(rankOf(player));
  $('lap').textContent='GIRO '+clamp(player.lapFloor+1,1,LAPS)+'/'+LAPS;
  $('tm').textContent=fmt(raceT);
  $('bl').textContent=player.bestLap?'GIRO '+fmt(player.bestLap):'';
  $('spd').textContent=Math.round(Math.abs(player.along)*3.6)+' km/h';
  $('off').style.opacity=(state==='run'&&!player.onRoad)?1:0;
  $('gap').textContent=state==='run'?gapText():'';
  $('ww').style.opacity=(state==='run'&&(player.wrongT||0)>0.8)?1:0;
  $('nosbar').style.opacity=(state==='run'||state==='count')?1:0;
}

/* ---------- camera ---------- */
function updateCam(dt){
  if(state==='menu'){
    menuT+=dt*0.08;
    cam.position.set(Math.cos(menuT)*165,125,Math.sin(menuT)*165);
    cam.lookAt(-5,0,-3);
    return;
  }
  const H=44+Math.abs(player.along)*0.5;
  const s=1-Math.exp(-dt*5);
  cam.position.x=lerp(cam.position.x,player.x,s);
  cam.position.y=lerp(cam.position.y,H,s);
  cam.position.z=lerp(cam.position.z,player.z+H*0.5,s);
  cam.lookAt(player.x,0,player.z-8);
}

/* ---------- ciclo principale ---------- */
function tick(){
  if(state==='run')raceT+=STEP;
  for(const c of cars){
    if(c.isAI)aiThink(c,STEP);
    else if(state!=='run'){c.input.th=0;c.input.br=0;c.input.st*=0.9;}
    stepCar(c,STEP);
  }
  collide();
  for(const c of cars)lapEvents(c);
  updateSkids(STEP);
  updateSmoke(STEP);
  collCd-=STEP; scrapeCd-=STEP;
}
let last=performance.now(),acc=0;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(state==='count'){
    cd-=dt;
    const ci=Math.ceil(cd);
    if(ci!==lastCd&&ci>0){lastCd=ci;msgShow(String(ci),0.8);beep(440,0.18);}
    if(cd<=0){state='run';raceT=0;msgShow('VIA!',0.9);beep(880,0.45);}
  }
  if(state!=='menu'){
    playerInput(dt);
    acc+=dt;
    let n=0;
    while(acc>=STEP&&n++<4){tick();acc-=STEP;}
  }
  if(msgT>0){msgT-=dt;$('msg').style.opacity=Math.min(1,Math.max(0,msgT*3));}
  updateCam(dt);
  updateHUD();
  drawMinimap();
  updateAudio();
  renderer.render(scene,cam);
}
function resize(){
  renderer.setSize(innerWidth,innerHeight);
  cam.aspect=innerWidth/innerHeight;
  cam.updateProjectionMatrix();
}
addEventListener('resize',resize);
resize();
// hook di debug/strumenti (usato anche dai test)
window.MICRO={ver:4,get state(){return state},set state(v){state=v},cars,player,resetRace,startRace,
  get raceT(){return raceT},get trackLen(){return trackLen},get playerNitro(){return player.nitro},
  stepCar,collide,tick,nearest,project,smokes,skids,
  pts,nrm,hl,curvArr,scArr,roadMesh,curbL,curbR,scene,cam,renderer};
requestAnimationFrame(frame);
