'use strict';
const $=s=>document.querySelector(s),all=s=>Array.from(document.querySelectorAll(s));
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const compactViewport=matchMedia('(max-width:768px)');
const home=$('#home'),cube=$('#cube'),hit=$('#cube-hit'),detail=$('#detail'),viewer=$('#viewer'),cursor=$('#cursor-label'),soundToggle=$('#sound-toggle');
let motionStart=0,motionFrom=-14.3239449,motionDuration=900,lastMotionFrame=0;
let selected=0,turn=0,targetRotation=-14.3239449,rotation=-14.3239449,pointerX=0,pointerY=0,smoothedX=0,smoothedY=0,openProject=null,viewerIndex=0,animating=false,lastWheel=0,touchY=null,lastFocus=null;
let soundEnabled=true,heroScrollLockUntil=0;
let transitionProjectId=null,frozenProjectId=null,previewObserver=null;
const dramaPreviewElements=new Map();
const previewStops=new Set();
const modulo=(n,m)=>((n%m)+m)%m;
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Reuse prepared video elements across faces instead of swapping image posters for video.
const projectVideoElements=new Map(projects.filter(p=>p.video).map(p=>{const v=document.createElement('video');v.src=p.video;v.poster=p.videoPoster||p.cover;v.muted=true;v.loop=true;v.playsInline=true;v.preload='metadata';v.dataset.projectVideo=p.id;v.setAttribute('aria-hidden','true');return [p.id,v]}));
let audioContext=null,audioFallbackFrame=0,audioFallbackTime=0;
const audioChannels=new Map(),audioTargets=new Map();
function unlockProjectAudio(){
  if(!soundEnabled)return;
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!audioContext&&Context){
    try{audioContext=new Context();projectVideoElements.forEach(video=>{
      const gain=audioContext.createGain();gain.gain.value=0;
      const source=audioContext.createMediaElementSource(video);source.connect(gain);gain.connect(audioContext.destination);
      audioChannels.set(video,{source,gain,target:0});video.volume=1;video.muted=false;
    })}catch{/* Native-volume smoothing remains available when Web Audio is unsupported. */}
  }
  if(audioContext?.state==='suspended')audioContext.resume().then(updateSoundState).catch(()=>{});
}
function smoothNativeAudio(time){
  const dt=Math.min(64,Math.max(1,time-audioFallbackTime||16));audioFallbackTime=time;let unsettled=false;
  audioTargets.forEach((target,video)=>{
    if(audioChannels.has(video))return;
    const next=video.volume+(target-video.volume)*(1-Math.exp(-dt/75));
    video.volume=Math.abs(next-target)<.0001?target:next;
    if(video.muted&&target>0)video.muted=false;
    if(target===0&&video.volume===0)video.muted=true;
    if(video.volume!==target)unsettled=true;
  });
  audioFallbackFrame=unsettled?requestAnimationFrame(smoothNativeAudio):0;
}
function setProjectAudio(video,target){
  const channel=audioChannels.get(video);audioTargets.set(video,target);video.dataset.audioTarget=target.toFixed(4);
  if(channel){
    video.muted=false;
    if(Math.abs(channel.target-target)<.00001)return;
    // Retarget the audio-thread envelope from its current value, never mute/unmute per scroll.
    channel.gain.gain.setTargetAtTime(target,audioContext.currentTime,.075);channel.target=target;
  }else if(!audioFallbackFrame){audioFallbackTime=0;audioFallbackFrame=requestAnimationFrame(smoothNativeAudio)}
}
const homeCubeTransform=(x=rotation)=>`rotateY(${-30+smoothedX*2.5}deg) rotateX(${x-smoothedY*1.8}deg) rotateZ(${smoothedX*.35}deg)`;
function detailSoundLevel(){
  if(!soundEnabled||openProject===null||detail.hidden||!viewer.hidden||document.hidden||transitionProjectId!==null)return 0;
  const video=projectVideoElements.get(projects[openProject].id),cover=detail.querySelector('.detail-cover');
  if(!video||!cover)return 0;
  const start=Math.max(40,cover.clientHeight*.12),end=Math.max(start+1,cover.clientHeight*.62);
  const progress=Math.max(0,Math.min(1,(detail.scrollTop-start)/(end-start)));
  return 1-progress*progress*(3-2*progress);
}
function updateSoundState(){
  const level=detailSoundLevel(),activeVideo=openProject===null?null:projectVideoElements.get(projects[openProject].id);
  projectVideoElements.forEach(video=>setProjectAudio(video,video===activeVideo?level:0));
  const state=!soundEnabled?'off':level>.9?'on':'quiet';
  soundToggle.dataset.state=state;soundToggle.setAttribute('aria-pressed',String(soundEnabled));
  const label=soundEnabled?uiCopy[language].soundOn:uiCopy[language].soundOff;soundToggle.setAttribute('aria-label',label);soundToggle.title=label;
}
function syncProjectVideoPlayback(){
  const activeId=transitionProjectId||(detail.hidden?projects[selected].id:openProject===null?null:projects[openProject].id);
  const cover=detail.querySelector('.detail-cover');
  const heroVisible=detail.hidden||transitionProjectId!==null||!cover||detail.scrollTop<cover.offsetHeight;
  const visibleIds=detail.hidden||transitionProjectId!==null?new Set(getSculptureFaces().map(face=>face.id)):new Set([activeId]);
  projectVideoElements.forEach((video,id)=>{
    if(!reduced&&!document.hidden&&viewer.hidden&&heroVisible&&visibleIds.has(id)&&id!==frozenProjectId){video.preload='auto';if(video.paused)video.play().catch(()=>{})}
    else video.pause();
  });
  updateSoundState();
}
function cardMarkup(item,i=0,playable=true){if(item.video)return playable?`<video src="${item.src}" poster="${item.posterImage}" controls playsinline preload="metadata" aria-label="${escapeHTML(item.title)}"></video>`:`<img src="${item.posterImage}" alt="${escapeHTML(item.title)}" decoding="async" loading="lazy"><span class="video-badge">PLAY DEMO</span>`;return item.poster?`<div class="story-card"><small>SERIES ${String(i+1).padStart(2,'0')}</small><strong>${escapeHTML(item.title)}</strong></div>`:`<img src="${item.src}" alt="${escapeHTML(item.title)}"${item.width&&item.height?` width="${item.width}" height="${item.height}"`:''} decoding="async" loading="lazy">`}
function warmProjectVideo(index){const video=projectVideoElements.get(projects[modulo(index,projects.length)].id);if(!video)return;video.preload='auto';if(video.networkState===HTMLMediaElement.NETWORK_EMPTY)video.load()}
async function prepareProjectVideo(index){const video=projectVideoElements.get(projects[index].id);if(!video)return;warmProjectVideo(index);if(video.readyState>=2)return;await Promise.race([new Promise(resolve=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',resolve,{once:true})}),new Promise(resolve=>setTimeout(resolve,1200))])}
async function restartProjectVideo(index){const video=projectVideoElements.get(projects[index].id);if(!video||reduced)return;await prepareProjectVideo(index);if(video.readyState>=1)video.currentTime=0;video.muted=true;video.play().catch(()=>{});await Promise.race([new Promise(resolve=>{if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(resolve);else if(video.readyState>=2&&!video.seeking)resolve();else video.addEventListener('seeked',resolve,{once:true})}),new Promise(resolve=>setTimeout(resolve,700))])}
projects.forEach((p,i)=>{const button=document.createElement('button');button.type='button';button.dataset.index=i;button.textContent=p.en;button.setAttribute('aria-label',`选择${p.en}`);button.addEventListener('pointerenter',()=>warmProjectVideo(i));button.addEventListener('focus',()=>warmProjectVideo(i));button.addEventListener('click',()=>{if(animating)return;if(compactViewport.matches||i===selected)openDetail(i);else selectProject(i)});$('#project-names').append(button)});
function fitProjectNames(){const context=document.createElement('canvas').getContext('2d');all('.project-names button').forEach((button,i)=>{button.style.fontSize='';const style=getComputedStyle(button);context.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;const base=parseFloat(style.fontSize),available=i===0&&!compactViewport.matches?Math.min(innerWidth-36,$('.top-nav').getBoundingClientRect().left-32):innerWidth-36,measured=context.measureText(button.textContent).width;let size=Math.min(base,base*available/Math.max(1,measured));if(!compactViewport.matches)size=Math.min(size,(innerHeight-16-32-(projects.length-1)*6)/(projects.length*.85));button.style.fontSize=Math.max(compactViewport.matches?12:16,size)+'px'})}
function fitAboutClosing(){const el=$('.about-closing');if(!el||$('#about-panel').hidden)return;el.style.fontSize='13px';const context=document.createElement('canvas').getContext('2d'),style=getComputedStyle(el);context.font=style.fontWeight+' 13px '+style.fontFamily;el.style.fontSize=Math.min(13,13*el.clientWidth/context.measureText(el.textContent).width)+'px'}
let resizeFrame=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{fitProjectNames();fitAboutClosing()})});
function updateFaces(){
  // Four consecutive project textures wrap around the four rotating faces.
  for(let offset=-1;offset<=2;offset++){
    const virtual=turn+offset,index=modulo(selected+offset,projects.length),p=projects[index],face=$('.face-'+modulo(virtual,4));
    if(face.dataset.project===p.id)continue;
    face.dataset.project=p.id;face.classList.toggle('folder-face',!p.previews&&!p.video);face.style.setProperty('--face-color',p.color);
    if(p.video)face.replaceChildren(projectVideoElements.get(p.id));else face.innerHTML=`<img src="${p.cover}" alt="">${p.previews?'':`<span class="face-title">${escapeHTML(p.en)}</span>`}`;
  }
  window.portfolioSculpture?.setFaces(getSculptureFaces());
}
function getSculptureFaces(){return [-1,0,1,2].map(offset=>({face:modulo(turn+offset,4),id:projects[modulo(selected+offset,projects.length)].id}))}
function selectProject(index,{instant=false,direction=null}={}){
  const newIndex=modulo(index,projects.length);
  let delta=direction===null?newIndex-selected:direction;
  if(direction===null&&Math.abs(delta)>projects.length/2)delta-=Math.sign(delta)*projects.length;
  motionFrom=rotation;motionStart=performance.now();motionDuration=Math.min(900+Math.max(0,Math.abs(delta)-1)*250,2500);selected=newIndex;turn+=delta;targetRotation=-14.3239449+turn*90;
  if(instant||reduced){rotation=targetRotation;motionFrom=targetRotation}
  const p=projects[selected];document.documentElement.style.setProperty('--bg',p.background);document.documentElement.style.setProperty('--ink',p.ink);
  all('.project-names button').forEach((b,i)=>{b.classList.toggle('is-current',i===selected);b.setAttribute('aria-current',i===selected?'true':'false')});
  hit.setAttribute('aria-label',language==='zh'?`查看${p.en}项目`:`View ${p.en} project`);$('#mobile-name').textContent=p.en;$('#mobile-count').textContent=`${String(selected+1).padStart(2,'0')} / ${String(projects.length).padStart(2,'0')}`;
  updateFaces();syncProjectVideoPlayback();warmProjectVideo(selected+1);if(reduced)cube.style.transform=`rotateX(${rotation}deg) rotateY(-30deg) rotateZ(0deg)`;
}
function animate(time){
  if(!reduced&&!animating&&detail.hidden&&!document.hidden){
    const progress=Math.min(1,Math.max(0,(time-motionStart)/motionDuration));
    const eased=progress<.5?4*progress**3:1-((-2*progress+2)**3)/2;
    rotation=motionFrom+(targetRotation-motionFrom)*eased;
    const follow=1-Math.exp(-Math.min(64,time-lastMotionFrame)/180);
    smoothedX+=(pointerX-smoothedX)*follow;smoothedY+=(pointerY-smoothedY)*follow;
    cube.style.transform=homeCubeTransform();
  }
  lastMotionFrame=time;
  window.portfolioSculpture?.frame(rotation,smoothedX,smoothedY);
  requestAnimationFrame(animate)
}
document.addEventListener('visibilitychange',()=>{syncProjectVideoPlayback();if(document.hidden)previewStops.forEach(stop=>stop())});
soundToggle.addEventListener('click',()=>{
  soundEnabled=!soundEnabled;
  unlockProjectAudio();
  const video=openProject===null?null:projectVideoElements.get(projects[openProject].id);
  if(soundEnabled&&video&&!detail.hidden&&viewer.hidden&&!reduced)video.play().catch(()=>{});
  updateSoundState();
});
updateSoundState();
document.addEventListener('pointerdown',()=>{if(soundEnabled)unlockProjectAudio()},{passive:true});
document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!compactViewport.matches){pointerX=e.clientX/innerWidth*2-1;pointerY=e.clientY/innerHeight*2-1}cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
document.addEventListener('pointerleave',()=>{pointerX=pointerY=0});
home.addEventListener('pointermove',e=>{if(!window.portfolioSculpture||!detail.hidden||animating)return;cursor.style.opacity=!e.target.closest('.project-names')&&window.portfolioSculpture.hit(e.clientX,e.clientY)?1:0});
home.addEventListener('click',e=>{if(window.portfolioSculpture&&detail.hidden&&!e.target.closest('button')&&window.portfolioSculpture.hit(e.clientX,e.clientY))openDetail(selected)});
hit.addEventListener('pointerenter',()=>{if(matchMedia('(pointer:fine)').matches)cursor.style.opacity=1});hit.addEventListener('pointerleave',()=>cursor.style.opacity=0);hit.addEventListener('click',()=>openDetail(selected));
window.addEventListener('wheel',e=>{
  if(compactViewport.matches||!detail.hidden||!viewer.hidden||!$('#about-panel').hidden||!$('#contact-panel').hidden)return;
  e.preventDefault();if(animating)return;const now=performance.now();if(now-lastWheel<420||Math.abs(e.deltaY)<4)return;lastWheel=now;const direction=e.deltaY>0?1:-1;selectProject(selected+direction,{direction});
},{passive:false});
home.addEventListener('touchstart',e=>{if(compactViewport.matches)return;touchY=e.touches[0].clientY},{passive:true});home.addEventListener('touchend',e=>{if(compactViewport.matches||touchY===null)return;const d=touchY-e.changedTouches[0].clientY;if(Math.abs(d)>45){const dir=d>0?1:-1;selectProject(selected+dir,{direction:dir})}touchY=null},{passive:true});
function closePopups(){for(const name of ['about','contact']){$('#'+name+'-panel').hidden=true;$('#'+name+'-toggle').setAttribute('aria-expanded','false')}}
for(const name of ['about','contact'])$('#'+name+'-toggle').addEventListener('click',()=>{const panel=$('#'+name+'-panel'),wasOpen=!panel.hidden;closePopups();panel.hidden=wasOpen;$('#'+name+'-toggle').setAttribute('aria-expanded',String(!wasOpen));if(name==='about')fitAboutClosing()});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.popup,.top-nav'))closePopups()});
// Only publish a confirmed Gmail address.
const gmailAddress='zhanghejing6542@gmail.com';
if(gmailAddress){$('#gmail-link').href='mailto:'+gmailAddress;$('#gmail-link b').textContent=gmailAddress;$('#gmail-link').hidden=false}
const clockFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});function updateClock(){$('#china-clock').textContent='CST '+clockFormatter.format(new Date())}updateClock();setInterval(updateClock,1000);
function projectURL(index,item=null){return '#/project/'+projects[index].id+(item===null?'':'/media/'+(item+1))}
function renderDetail(index){
  previewObserver?.disconnect();previewObserver=null;previewStops.forEach(stop=>stop());previewStops.clear();dramaPreviewElements.forEach(v=>v.pause());
  all('.cube-face video').forEach(v=>{if(v.dataset.projectVideo!==projects[index].id)v.pause()});
  detail.style.removeProperty('--bg');
  openProject=index;const p=projects[index];document.documentElement.style.setProperty('--bg',p.background);
  const mediaButtons=p.gallery.map((item,i)=>`<button class="${item.poster?'story-card':'gallery-item'}${item.clipHeight?' artwork-crop':''}"${item.clipHeight?` style="aspect-ratio:${item.width}/${item.clipHeight}"`:''} data-media="${i}" aria-label="查看${escapeHTML(item.title)}">${item.poster?`<small>SERIES ${String(i+1).padStart(2,'0')}</small><strong>${escapeHTML(item.title)}</strong>`:cardMarkup(item,i)}</button>`).join('');
  $('#detail-body').innerHTML=`<div class="detail-cover ${p.previews?'':'is-folder'}"><button data-media="0" aria-label="放大${escapeHTML(p.title)}作品"><img src="${p.cover}" alt="${escapeHTML(p.title)}"></button></div><div class="case-layout"><div class="case-gallery${p.id==='drama'?' drama-gallery':''}">${mediaButtons}</div><article class="case-copy">${renderCaseCopy(index)}</article></div><footer class="case-foot"><span>NEXT PROJECT</span><button id="case-next">${escapeHTML(projects[(index+1)%projects.length].en)}</button></footer>`;
  if(p.coverFit==='contain'){detail.querySelector('.detail-cover').classList.add('preserve-cover');detail.querySelector('.detail-cover').style.background=p.coverBackground}
  if(p.id==='drama')all('.drama-gallery img').forEach((image,i)=>{image.loading='eager';image.fetchPriority=i<2?'high':'auto';image.decode?.().catch(()=>{})});
  if(p.video){const video=projectVideoElements.get(p.id);video.controls=reduced;video.removeAttribute('aria-hidden');video.muted=true;video.loop=true;video.autoplay=!reduced;video.playsInline=true;video.setAttribute('aria-label',p.en+' DEMO');detail.querySelector('.detail-cover button').replaceWith(video);if(!reduced)video.play().catch(()=>{})}
  else if(!p.previews){const poster=window.portfolioSculpture?.poster(p.id);if(poster)detail.querySelector('.detail-cover img').src=poster}
  // The cover already plays the demo: do not repeat its poster or play badge below.
  all('.case-gallery [data-media]').forEach(b=>{if(p.gallery[Number(b.dataset.media)].video)b.remove()});
  if(p.id==='modelgem')detail.querySelector('.case-gallery [data-media="0"]')?.remove();
  if(['portrait','sound','ipx','pinhaofan'].includes(p.id)){const gallery=detail.querySelector('.case-gallery'),sheet=document.createElement('div');sheet.className='project-sheet';sheet.setAttribute('aria-label',p.en+' 连续作品长图');gallery.classList.add('seamless-gallery');Array.from(gallery.children).forEach(el=>{if(!p.gallery[Number(el.dataset.media)].video)sheet.append(el)});gallery.append(sheet)}
  all('[data-media]').forEach(b=>b.addEventListener('click',()=>openViewer(Number(b.dataset.media))));detail.querySelector('.case-foot')?.remove();detail.scrollTop=0;updateDetailLanguage();applyArtworkFrames();setupDramaPreviews();updateDetailColor();
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitForAnimations=(animations,duration)=>Promise.race([Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))),wait(duration+80)]);
function homeTransitionScale(){
  const width=hit.offsetWidth,height=hit.offsetHeight,perspective=1800,size=Math.max(innerWidth/Math.max(1,width),innerHeight/Math.max(1,height));
  return perspective*size/(perspective+height/2*size);
}
function animateHomeProject(opening){
  const duration=opening?650:500,scale=homeTransitionScale(),rest=homeCubeTransform(targetRotation),flat=`rotateY(0deg) rotateX(${turn*90}deg) rotateZ(0deg)`;
  home.style.setProperty('--home-duration',duration+'ms');
  home.classList.add('opening');
  const hitAnimation=hit.animate(opening?[{transform:'scale(1)'},{transform:`scale(${scale})`}]:[{transform:`scale(${scale})`},{transform:'scale(1)'}],{duration,easing:'cubic-bezier(.645,.045,.355,1)',fill:'forwards'});
  const cubeAnimation=cube.animate(opening?[{transform:rest},{transform:flat}]:[{transform:flat},{transform:rest}],{duration,easing:'cubic-bezier(.645,.045,.355,1)',fill:'forwards'});
  return {animations:[hitAnimation,cubeAnimation],duration};
}
function finishHomeProjectTransition(transition){
  transition?.animations.forEach(animation=>animation.cancel());
  hit.style.transform='';cube.style.transform=homeCubeTransform(targetRotation);home.classList.remove('opening');
}
function projectHeroSource(project,captureVideo=false){
  if(captureVideo&&project.video){
    const video=projectVideoElements.get(project.id);
    if(video?.readyState>=2&&video.videoWidth){
      try{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);return canvas.toDataURL('image/jpeg',.94)}catch{}
    }
  }
  if(project.video)return project.videoPoster||project.cover;
  if(project.previews&&project.gallery[0]?.src)return project.gallery[0].src;
  return project.cover;
}
function createProjectSwitch(fromIndex,toIndex){
  const from=projects[fromIndex],to=projects[toIndex],stage=document.createElement('div');
  stage.className='project-switch-stage';stage.setAttribute('aria-hidden','true');
  const fromBackground=document.createElement('div'),toBackground=document.createElement('div'),switchCube=document.createElement('div'),currentFace=document.createElement('div'),nextFace=document.createElement('div');
  fromBackground.className='project-switch-bg';fromBackground.style.background=from.background;
  toBackground.className='project-switch-bg project-switch-bg-next';toBackground.style.background=to.background;
  switchCube.className='project-switch-cube';currentFace.className='project-switch-face project-switch-current';nextFace.className='project-switch-face project-switch-next';
  const images=[];
  for(const [face,project,isCurrent] of [[currentFace,from,true],[nextFace,to,false]]){
    face.style.background=project.color||project.background;
    const image=project.video?projectVideoElements.get(project.id):document.createElement('img');if(!project.video){image.src=projectHeroSource(project,isCurrent);image.alt='';image.decoding='async';images.push(image)}
    if(!project.previews&&!project.video)face.classList.add('is-folder');
    face.append(image);
  }
  switchCube.append(currentFace,nextFace);stage.append(fromBackground,toBackground,switchCube);document.body.append(stage);
  return {stage,toBackground,switchCube,images};
}
async function openDetail(index,{route=true,instant=false}={}){
  if(animating)return;animating=true;closePopups();cursor.style.opacity=0;lastFocus=document.activeElement;selectProject(index,{instant:true});
  const animateTransition=!reduced&&!instant&&!compactViewport.matches&&detail.hidden;
  warmProjectVideo(index);
  const openingVideo=projectVideoElements.get(projects[index].id);if(openingVideo?.readyState>=1)openingVideo.currentTime=0;
  const sculpture=window.portfolioSculpture;
  const transition=animateTransition&&!sculpture?animateHomeProject(true):null;
  if(animateTransition&&sculpture){home.classList.add('opening');await sculpture.zoom(true,turn)}
  else if(transition)await waitForAnimations(transition.animations,transition.duration);
  await restartProjectVideo(index);renderDetail(index);detail.hidden=false;home.inert=true;void detail.offsetWidth;detail.classList.add('is-open');syncProjectVideoPlayback();
  if(route)history.pushState({project:index},'',projectURL(index));
  if(transition)await wait(180);
  finishHomeProjectTransition(transition);detail.scrollTop=0;heroScrollLockUntil=performance.now()+320;animating=false;
}
async function closeDetail({route=true}={}){
  if(animating)return;animating=true;
  all('.detail video').forEach(v=>v.pause());previewObserver?.disconnect();dramaPreviewElements.forEach(v=>v.pause());
  all('.cube-face').forEach(face=>delete face.dataset.project);updateFaces();
  if(!viewer.hidden)closeViewer({route:false});
  const animateTransition=!reduced&&!compactViewport.matches;
  const sculpture=window.portfolioSculpture;
  const transition=animateTransition&&!sculpture?animateHomeProject(false):null;
  detail.classList.remove('is-open');detail.hidden=true;home.inert=false;closePopups();openProject=null;$('#detail-body').innerHTML='';document.title='qing · Creative Portfolio';
  if(route)history.pushState({},'','#/');
  syncProjectVideoPlayback();
  if(animateTransition&&sculpture){home.classList.add('opening');await sculpture.zoom(false)}
  else if(transition)await waitForAnimations(transition.animations,transition.duration);
  finishHomeProjectTransition(transition);syncProjectVideoPlayback();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});animating=false;
}
async function nextDetail(){
  if(openProject===null||animating)return;
  const nextIndex=modulo(selected+1,projects.length);
  animating=true;
  frozenProjectId=projects[openProject].id;projectVideoElements.get(frozenProjectId)?.pause();updateSoundState();
  warmProjectVideo(nextIndex);await prepareProjectVideo(nextIndex);
  all('.detail video').forEach(v=>v.pause());dramaPreviewElements.forEach(v=>v.pause());
  if(reduced||compactViewport.matches){
    selectProject(nextIndex,{direction:1,instant:true});await restartProjectVideo(nextIndex);renderDetail(nextIndex);frozenProjectId=null;syncProjectVideoPlayback();history.pushState({project:nextIndex},'',projectURL(nextIndex));animating=false;return;
  }
  const sculpture=window.portfolioSculpture;
  if(sculpture&&!compactViewport.matches){
    if(detail.scrollTop>20){const fade=detail.animate([{opacity:1},{opacity:0}],{duration:120,fill:'forwards'});await waitForAnimations([fade],120);fade.cancel()}
    detail.classList.add('switching');home.classList.add('opening');transitionProjectId=projects[nextIndex].id;
    selectProject(nextIndex,{direction:1,instant:true});syncProjectVideoPlayback();
    await sculpture.next(turn);
    await restartProjectVideo(nextIndex);renderDetail(nextIndex);detail.classList.remove('switching');home.classList.remove('opening');transitionProjectId=null;frozenProjectId=null;
    syncProjectVideoPlayback();history.pushState({project:nextIndex},'',projectURL(nextIndex));animating=false;return;
  }
  const fromIndex=openProject,{stage,toBackground,switchCube,images}=createProjectSwitch(fromIndex,nextIndex),duration=1300,perspective=1800,fullScale=perspective/(perspective+innerHeight/2),smallScale=fullScale*.34;
  await Promise.race([Promise.all(images.map(image=>image.decode?.().catch(()=>{})||Promise.resolve())),wait(1200)]);
  detail.classList.add('switching');selectProject(nextIndex,{direction:1,instant:true});updateSoundState();
  const turnAnimation=switchCube.animate([
    {offset:0,transform:`scale(${fullScale}) rotateX(0deg)`,easing:'cubic-bezier(.645,.045,.355,1)'},
    {offset:.31,transform:`scale(${smallScale}) rotateX(0deg)`,easing:'cubic-bezier(.645,.045,.355,1)'},
    {offset:.64,transform:`scale(${smallScale}) rotateX(90deg)`,easing:'cubic-bezier(.645,.045,.355,1)'},
    {offset:1,transform:`scale(${fullScale}) rotateX(90deg)`}
  ],{duration,fill:'forwards'});
  const backgroundAnimation=toBackground.animate([{offset:0,opacity:0},{offset:.42,opacity:0},{offset:.72,opacity:1},{offset:1,opacity:1}],{duration,fill:'forwards'});
  await waitForAnimations([turnAnimation,backgroundAnimation],duration);
  rotation=targetRotation;await restartProjectVideo(nextIndex);renderDetail(nextIndex);frozenProjectId=null;detail.classList.remove('switching');syncProjectVideoPlayback();stage.remove();
  history.pushState({project:nextIndex},'',projectURL(nextIndex));
  animating=false;
}
$('#return-home').addEventListener('click',()=>closeDetail());$('#next-project').addEventListener('click',nextDetail);
function artworkMeta(src){return artworkPresentation[(src||'').split('/').pop()]}
function applyArtworkFrames(){
  all('.project-sheet .gallery-item').forEach(button=>{
    const item=projects[openProject].gallery[Number(button.dataset.media)],meta=artworkMeta(item.src),img=button.querySelector('img');
    if(!meta||!img)return;
    const [w,h]=meta.size,[l,r,t,b]=meta.trim,cw=w-l-r,ch=h-t-b;
    button.classList.add('trimmed-artwork');button.style.aspectRatio=cw+'/'+ch;
    img.style.width=(w/cw*100)+'%';img.style.left=(-l/cw*100)+'%';img.style.top=(-t/ch*100)+'%';
  });
  all('.case-gallery img').forEach(img=>img.addEventListener('load',updateDetailColor,{once:true}));
}
function linearRGB(value){value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4}
function rgbToLab(rgb){
 const [r,g,b]=rgb.map(linearRGB),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
// Folder-face hues sampled from the supplied artwork, not individual gallery pages.
const detailPaletteSpecs={
 portrait:{rgb:[253,76,111],light:.83,deep:.68,chroma:.17},
 sound:{rgb:[162,79,251],light:.83,deep:.68,chroma:.13},
 fireman:{rgb:[255,173,67],light:.90,deep:.77,chroma:.12},
 ipx:{rgb:[135,194,9],light:.89,deep:.76,chroma:.17},
 pinhaofan:{rgb:[255,176,152],light:.90,deep:.77,chroma:.09},
 modelgem:{rgb:[172,241,38],light:.93,deep:.80,chroma:.22},
 drama:{hue:80,light:.34,deep:.22,chroma:.018,dark:true},
 shadows:{hue:0,light:.54,deep:.30,chroma:0,dark:true}
};
function labToLinearRGB(L,C,H){
 const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180);
 const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
 return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
function projectTone(id,progress){
 const spec=detailPaletteSpecs[id],lab=spec.rgb&&rgbToLab(spec.rgb),H=spec.hue??((Math.atan2(lab[2],lab[1])*180/Math.PI+360)%360);
 const t=Math.max(0,Math.min(1,progress)),eased=t*t*(3-2*t),L=spec.light+(spec.deep-spec.light)*eased;
 let C=spec.chroma;
 while(labToLinearRGB(L,C,H).some(v=>v<0||v>1)&&C>.001)C-=.001;
 return {background:`oklch(${L.toFixed(4)} ${Math.max(0,C).toFixed(4)} ${H.toFixed(3)})`,ink:spec.dark?'oklch(.97 0 0)':'oklch(.19 .008 285)',L,C,H};
}
function updateDetailColor(){
 if(openProject===null)return;
 const p=projects[openProject],cover=detail.querySelector('.detail-cover'),maxScroll=Math.max(1,detail.scrollHeight-detail.clientHeight);
 // Short cases still get the full scroll runway, not a compressed change after the hero.
 const start=Math.min((cover?.offsetHeight||0)*.6,maxScroll*.15);
 const progress=Math.max(0,detail.scrollTop-start)/Math.max(1,maxScroll-start);
 const tone=projectTone(p.id,progress);
 detail.style.setProperty('--bg',tone.background);detail.style.setProperty('--ink',tone.ink);
 detail.dataset.toneProgress=progress.toFixed(4);
}
function setupDramaPreviews(){
 if(projects[openProject].id!=='drama'||reduced)return;
  previewObserver='IntersectionObserver'in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const video=entry.target.querySelector('.drama-preview');video.preload='auto';if(video.networkState===HTMLMediaElement.NETWORK_EMPTY)video.load();previewObserver.unobserve(entry.target)}),{root:detail,rootMargin:'180px 0px'}):null;
 all('.case-gallery [data-media]').forEach(card=>{
  const item=projects[openProject].gallery[Number(card.dataset.media)];if(!item.preview)return;
  let v=dramaPreviewElements.get(item.preview);if(!v){v=document.createElement('video');v.src=item.preview;v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.className='drama-preview';v.setAttribute('aria-hidden','true');dramaPreviewElements.set(item.preview,v)}v.onplaying=v.onloadeddata=v.onstalled=v.onerror=null;card.classList.add('preview-card');card.append(v);previewObserver?.observe(card);
  let active=false,hasFrame=false;const reveal=()=>{if(active&&v.readyState>=2){hasFrame=true;card.classList.add('previewing')}};
  const stop=()=>{active=false;hasFrame=false;card.classList.remove('previewing');v.pause();if(v.readyState>=1)v.currentTime=0};previewStops.add(stop);
  card.querySelector('img').draggable=false;card.addEventListener('dragstart',e=>e.preventDefault());card.addEventListener('pointercancel',stop);card.addEventListener('blur',stop);
  v.onplaying=reveal;v.onloadeddata=reveal;v.onstalled=()=>{if(!hasFrame)card.classList.remove('previewing')};v.onerror=()=>card.classList.remove('previewing');
  card.addEventListener('pointerenter',e=>{if(e.pointerType==='touch'||!matchMedia('(hover:hover)').matches)return;active=true;hasFrame=false;v.preload='auto';if(v.networkState===HTMLMediaElement.NETWORK_EMPTY)v.load();if(v.readyState>=1&&v.currentTime>0)v.currentTime=0;reveal();v.play().then(reveal).catch(()=>{})});
  card.addEventListener('pointerleave',stop);
  card.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){active=!active;if(active){v.preload='auto';v.play().then(reveal).catch(()=>{});e.preventDefault()}else{card.classList.remove('previewing');v.pause()}}});
 });
}
let colorFrame=0;
detail.addEventListener('wheel',e=>{if(animating||performance.now()<heroScrollLockUntil)e.preventDefault()},{passive:false});
detail.addEventListener('touchmove',e=>{if(animating||performance.now()<heroScrollLockUntil)e.preventDefault()},{passive:false});
detail.addEventListener('scroll',()=>{if(performance.now()<heroScrollLockUntil&&detail.scrollTop!==0)detail.scrollTop=0;if(colorFrame)return;colorFrame=requestAnimationFrame(()=>{colorFrame=0;updateDetailColor();syncProjectVideoPlayback()})},{passive:true});
window.addEventListener('resize',()=>{updateDetailColor();updateSoundState()});
function openViewer(index,{route=true}={}){
  all('.detail video,.viewer video').forEach(v=>v.pause());
  if(openProject===null)return;viewerIndex=modulo(index,projects[openProject].gallery.length);const p=projects[openProject],item=p.gallery[viewerIndex];const markup=cardMarkup(item,viewerIndex);$('#viewer-figure').innerHTML=item.clipHeight?`<div class="viewer-artwork-crop" style="aspect-ratio:${item.width}/${item.clipHeight}">${markup}</div>`:markup;$('#viewer-title').textContent=item.title;$('#viewer-count').textContent=`${String(viewerIndex+1).padStart(2,'0')} / ${String(p.gallery.length).padStart(2,'0')}`;viewer.hidden=false;detail.inert=true;updateSoundState();$('#viewer-close').focus({preventScroll:true});if(route)history.pushState({project:openProject,media:viewerIndex},'',projectURL(openProject,viewerIndex))
}
function closeViewer({route=true}={}){viewer.hidden=true;detail.inert=false;if(route&&openProject!==null)history.pushState({project:openProject},'',projectURL(openProject));$('#viewer-figure').innerHTML='';detail.querySelector('[data-media="'+viewerIndex+'"]')?.focus({preventScroll:true});syncProjectVideoPlayback()}
$('#viewer-close').addEventListener('click',()=>closeViewer());$('#viewer-next').addEventListener('click',()=>openViewer(viewerIndex+1));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!viewer.hidden)closeViewer();else if(!$('#about-panel').hidden||!$('#contact-panel').hidden)closePopups();else if(!detail.hidden)closeDetail();return}
  if(!viewer.hidden){if(e.key==='ArrowRight')openViewer(viewerIndex+1);if(e.key==='ArrowLeft')openViewer(viewerIndex-1);if(e.key==='Tab'){const controls=all('.viewer button'),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}return}
  if(detail.hidden&&(e.key==='ArrowDown'||e.key==='ArrowRight')){e.preventDefault();selectProject(selected+1,{direction:1,instant:true})}else if(detail.hidden&&(e.key==='ArrowUp'||e.key==='ArrowLeft')){e.preventDefault();selectProject(selected-1,{direction:-1,instant:true})}
});
async function restoreRoute(){const route=location.hash.match(/^#\/project\/([^/]+)(?:\/media\/(\d+))?$/);if(!route){if(!detail.hidden)closeDetail({route:false});return}const index=projects.findIndex(p=>p.id===route[1]);if(index<0)return;if(openProject!==index||detail.hidden)await openDetail(index,{route:false,instant:true});if(route[2])openViewer(Number(route[2])-1,{route:false});else if(!viewer.hidden)closeViewer({route:false})}
window.addEventListener('popstate',restoreRoute);
compactViewport.addEventListener('change',()=>{fitProjectNames();updateSoundState()});
async function loadPortfolio(){
  const loadStarted=performance.now();
  const sources=[...new Set(projects.filter(p=>!p.video).map(p=>p.cover))];let done=0;
  let targetProgress=0,shownProgress=0;
  function progress(){targetProgress=Math.round(done/(sources.length+1)*100)}
  const smoothProgress=new Promise(resolve=>{function frame(){shownProgress=reduced||document.hidden?targetProgress:Math.min(targetProgress,(performance.now()-loadStarted)/32);const value=Math.floor(shownProgress);$('#load-bar').style.transform=`scaleX(${value/100})`;$('#load-percent').textContent=`LOADING: ${value}%`;if(value===100)resolve();else if(document.hidden)setTimeout(frame,32);else requestAnimationFrame(frame)}if(document.hidden)setTimeout(frame,0);else requestAnimationFrame(frame)});
  const imageTasks=sources.map(src=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=()=>{done++;progress();resolve()};image.src=src}));
  const fontTask=document.fonts.ready.then(()=>{done++;progress();fitProjectNames()});await Promise.all([...imageTasks,fontTask]);targetProgress=100;await smoothProgress;syncProjectVideoPlayback();
  await sculptureReady;
  if(!reduced)await new Promise(r=>setTimeout(r,450));if(location.hash!=='#/')history.replaceState({},'',location.pathname+location.search+'#/');$('#loader').classList.add('loaded');if(!reduced&&!compactViewport.matches){if(window.portfolioSculpture)window.portfolioSculpture.entry();else{home.classList.add('entering');setTimeout(()=>home.classList.remove('entering'),2200)}}setTimeout(()=>{$('#loader').hidden=true},reduced?0:700)
}
window.portfolioRuntime={projects,projectVideoElements,getFaces:getSculptureFaces,getAnimating:()=>animating};
const sculptureReady=import('./sculpture.js').catch(()=>{});
// Shared fixed-hue palettes; iπ has the user's exact homepage color override.
projects.forEach(p=>{const tone=projectTone(p.id,0);p.background=p.id==='ipx'?'#98c724':tone.background;p.ink=tone.ink});
$('#language-toggle').addEventListener('click',()=>{language=language==='zh'?'en':'zh';applyLanguage()});
selectProject(0,{instant:true});applyLanguage();requestAnimationFrame(animate);
loadPortfolio();
