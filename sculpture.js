import * as THREE from './vendor/three.module.js';

// One four-plane sculpture for home, opening, return and Next. The ends are
// deliberately open: the opposite project is visible through them.
const runtime=window.portfolioRuntime;
if(runtime&&!matchMedia('(max-width:768px)').matches){
 try{
  const width=6.4,height=3.6,restScale=14/9,scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,100);
  camera.position.set(0,2.5,9);camera.lookAt(0,0,0);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.domElement.className='sculpture-canvas';renderer.domElement.setAttribute('aria-hidden','true');
  document.querySelector('#scene').append(renderer.domElement);
  const entry=new THREE.Group(),pose=new THREE.Group(),roll=new THREE.Group();
  scene.add(entry);entry.add(pose);pose.add(roll);
  pose.position.set(0,-.5,-5);pose.rotation.set(.25,-Math.PI/6,0);pose.scale.setScalar(restScale);
  const textures=new Map(),faces=[];
  let locked=false,step=0;
  const loader=new THREE.TextureLoader();
  const fit=texture=>{
   const source=texture.image,sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;
   if(!sw||!sh)return;
   const sourceRatio=sw/sh,ratio=width/height;
   texture.repeat.set(sourceRatio>ratio?ratio/sourceRatio:1,sourceRatio>ratio?1:sourceRatio/ratio);
   texture.offset.set((1-texture.repeat.x)/2,(1-texture.repeat.y)/2);
  };
  runtime.projects.forEach(project=>{
   const item={texture:null,poster:null,live:null};textures.set(project.id,item);
   const poster=loader.load(project.videoPoster||project.cover,texture=>{
    if(project.coverFit==='contain'){
     const image=texture.image,canvas=document.createElement('canvas');
     canvas.width=Math.ceil(Math.max(image.width,image.height*width/height));canvas.height=Math.ceil(canvas.width*height/width);
     const context=canvas.getContext('2d');context.fillStyle=project.coverBackground;context.fillRect(0,0,canvas.width,canvas.height);
     const scale=Math.min(canvas.width/image.width,canvas.height/image.height),iw=image.width*scale,ih=image.height*scale;
     context.drawImage(image,(canvas.width-iw)/2,(canvas.height-ih)/2,iw,ih);
     const composed=new THREE.CanvasTexture(canvas);composed.colorSpace=THREE.SRGBColorSpace;item.poster=composed;if(!item.live||item.texture!==item.live)item.texture=composed;texture.dispose();
    }else if(!project.previews&&!project.video){
     const image=texture.image,canvas=document.createElement('canvas');
     canvas.width=Math.ceil(Math.max(image.width/.7,image.height/.8*width/height));canvas.height=Math.ceil(canvas.width*height/width);
     const context=canvas.getContext('2d');context.fillStyle=project.color;context.fillRect(0,0,canvas.width,canvas.height);
     const scale=Math.min(canvas.width*.7/image.width,canvas.height*.8/image.height),iw=image.width*scale,ih=image.height*scale;
     context.drawImage(image,(canvas.width-iw)/2,(canvas.height-ih)/2,iw,ih);
     context.font=`800 ${canvas.width*.072}px Monument Ultra, sans-serif`;context.fillStyle='white';context.fillText(project.en,canvas.width*.08,canvas.height*.91);
     const composed=new THREE.CanvasTexture(canvas);composed.colorSpace=THREE.SRGBColorSpace;item.poster=composed;if(!item.live||item.texture!==item.live)item.texture=composed;texture.dispose();
    }else{fit(texture);texture.needsUpdate=true}
    setFaces(runtime.getFaces());render();
   });
   poster.colorSpace=THREE.SRGBColorSpace;poster.anisotropy=renderer.capabilities.getMaxAnisotropy();item.poster=poster;if(!item.live||item.texture!==item.live)item.texture=poster;
   const video=runtime.projectVideoElements.get(project.id);
   if(video){
    const live=new THREE.VideoTexture(video);item.live=live;live.colorSpace=THREE.SRGBColorSpace;live.minFilter=live.magFilter=THREE.LinearFilter;
    const reveal=()=>{if(video.readyState<2)return;fit(live);item.texture=live;setFaces(runtime.getFaces());render()};
    video.addEventListener('loadeddata',reveal);video.addEventListener('playing',reveal);
    video.addEventListener('loadedmetadata',()=>fit(live));
    if(video.readyState>=2)reveal();
   }
  });
  for(let i=0;i<4;i++){
   const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
   plane.rotation.x=-i*Math.PI/2;
   plane.position.set(0,Math.sin(i*Math.PI/2)*height/2,Math.cos(i*Math.PI/2)*height/2);
   roll.add(plane);faces.push(plane);
  }
  function setFaces(mapping){mapping.forEach(({face,id})=>{if(faces[face]){faces[face].material.map=textures.get(id)?.texture||null;faces[face].material.needsUpdate=true}})}
  function render(){renderer.render(scene,camera);const face=faces[((Math.round(step)%4)+4)%4];if(face){const points=[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]].map(([x,y])=>face.localToWorld(new THREE.Vector3(x,y,0)).project(camera)).map(p=>[(p.x+1)*innerWidth/2,(1-p.y)*innerHeight/2]);document.querySelector('#scene').dataset.sculptureBounds=JSON.stringify({left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))})}}
  const power2In=t=>t*t*t,power2Out=t=>1-(1-t)**3,power2InOut=t=>t<.5?4*t**3:1-(-2*t+2)**3/2,power3InOut=t=>t<.5?8*t**4:1-(-2*t+2)**4/2;
  function tween(duration,update){return new Promise(resolve=>{const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/duration);update(t);render();if(t<1)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)})}
  function zoomScale(){
   const direction=new THREE.Vector3(0,2.5,9).normalize(),centre=new THREE.Vector3(0,-5*2.5/9,-5);
   const project=runtime.projects.find(p=>p.id===runtime.getFaces()[1].id);
   const distance=camera.position.clone().sub(centre).dot(direction),focal=innerHeight/(2*Math.tan(Math.PI/8)),size=project?.coverFit==='contain'?Math.min(innerWidth/width,innerHeight/height):Math.max(innerWidth/width,innerHeight/height);
   return size*distance/(focal+size*height/2);
  }
  async function zoom(opening,nextStep=step){
   if(opening){step=nextStep;roll.rotation.x=step*Math.PI/2}
   locked=true;const from={x:pose.rotation.x,y:pose.rotation.y,z:pose.rotation.z,s:pose.scale.x,py:pose.position.y};
   const to=opening?{x:-Math.atan(2.5/9),y:0,z:0,s:zoomScale(),py:-5*2.5/9}:{x:.25,y:-Math.PI/6,z:0,s:restScale,py:-.5};
   await tween(opening?650:500,t=>{const e=opening?power3InOut(t):power2InOut(t);pose.rotation.set(from.x+(to.x-from.x)*e,from.y+(to.y-from.y)*e,from.z+(to.z-from.z)*e);pose.position.y=from.py+(to.py-from.py)*e;pose.scale.setScalar(from.s+(to.s-from.s)*e)});
   locked=false;
  }
  const api={
   setFaces,
   poster(id){const image=textures.get(id)?.texture?.image;return image instanceof HTMLCanvasElement?image.toDataURL('image/png'):null},
   frame(rotation,x,y){if(locked||runtime.getAnimating())return;if(document.querySelector('#detail').hidden){step=(rotation+14.3239449)/90;roll.rotation.x=step*Math.PI/2;pose.rotation.set(.25-y*Math.PI/100,-Math.PI/6+x*Math.PI/72,x*Math.PI/514);render()}},
   async entry(){locked=true;await tween(2200,t=>{const e=power2InOut(t);entry.position.x=19*(1-e);entry.rotation.z=-Math.PI*2*(1-e)});locked=false},
   zoom,
   async next(nextStep){
    locked=true;const full=pose.scale.x,endScale=zoomScale(),from=roll.rotation.x,to=nextStep*Math.PI/2;
    await tween(1300,t=>{const ms=t*1300,shrink=power2In(Math.min(1,ms/350)),flip=power2InOut(Math.max(0,Math.min(1,(ms-250)/900))),grow=power2Out(Math.max(0,Math.min(1,(ms-950)/350)));
     pose.scale.setScalar(ms<950?full+(restScale-full)*shrink:restScale+(endScale-restScale)*grow);roll.rotation.x=from+(to-from)*flip;
    });step=nextStep;render();locked=false;
   },
   hit(x,y){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);return ray.intersectObjects(faces).length>0},
   resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(!document.querySelector('#detail').hidden)pose.scale.setScalar(zoomScale());else{pose.scale.setScalar(restScale);pose.position.y=-.5}render()}
  };
  setFaces(runtime.getFaces());render();window.portfolioSculpture=api;document.body.classList.add('webgl-sculpture');
  addEventListener('resize',api.resize);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();delete window.portfolioSculpture;document.body.classList.remove('webgl-sculpture')});
 }catch(error){console.warn('Using CSS sculpture fallback',error)}
}
