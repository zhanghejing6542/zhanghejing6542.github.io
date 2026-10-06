'use strict';
// Each fresh visit starts in English; switches persist within this visit only.
let language='en';
const uiCopy={
 zh:{about:'ABOUT ME',contact:'CONTACT',back:'/ RETURN',next:'NEXT',view:'查看项目',projects:'项目',soundOn:'关闭网页声音',soundOff:'开启网页声音',switch:'Switch to English',phone:'电话',wechat:'微信',samePhone:'与手机同号',portfolio:'作品集',resume:'简历'},
 en:{about:'ABOUT ME',contact:'CONTACT',back:'/ RETURN',next:'NEXT',view:'VIEW PROJECT',projects:'Projects',soundOn:'Turn sound off',soundOff:'Turn sound on',switch:'切换到中文',phone:'PHONE',wechat:'WECHAT',samePhone:'Same as my phone number',portfolio:'PORTFOLIO',resume:'RÉSUMÉ'}
};
function renderCaseCopy(index){
 const p=projects[index],copy=projectCopy[language][p.id];
 const sections=['role','project','deliverables','capabilities'].map(key=>{
   const content=key==='project'?`<p>${escapeHTML(copy[key])}</p>`:`<ul class="case-lines">${copy[key].split(' · ').map(line=>`<li>${escapeHTML(line.trim())}</li>`).join('')}</ul>`;
   return `<h2>${key.toUpperCase()}</h2>${content}`;
 }).join('');
 // Match the latest uploaded labels/order while retaining the verified destinations.
 const destinations={
   PORTFOLIO:['portrait','sound','ipx','pinhaofan'].includes(p.id)?'/assets/docs/portfolio-zhang-qing.pdf':null,
   DEMO:p.visits.find(link=>link.label==='VIEW THE WEBSITE')?.href,
   WEBSITE:p.visits.find(link=>link.label==='VIEW THE WEBSITE')?.href,
   ARTICLE:p.visits.find(link=>link.label==='PROJECT ARTICLE')?.href,
   VIDEO:p.id==='fireman'?p.video:p.visits.find(link=>link.label==='VIEW MORE')?.href
 };
 const links=Array.from(copy.visit.matchAll(/\[([A-Z]+)\]/g),match=>({label:match[1],href:destinations[match[1]]})).filter(link=>link.href);
 const visit=links.length?`<h2>VISIT</h2><div class="visit-links">${links.map(link=>`<a class="external" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer">[${escapeHTML(link.label)}]</a>`).join('')}</div>`:'';
 return `<h1 id="detail-title">${escapeHTML(copy.title)}</h1><p class="case-year">${escapeHTML(copy.year)}</p>${sections}${visit}`;
}
let aboutChineseHTML=null;
function applyLanguage(){
 const text=uiCopy[language];document.documentElement.lang=language==='zh'?'zh-CN':'en';
 for(const [id,key] of [['about-toggle','about'],['contact-toggle','contact'],['return-home','back'],['viewer-close','back'],['next-project','next'],['viewer-next','next'],['cursor-label','view']])document.getElementById(id).textContent=text[key];
 const toggle=document.getElementById('language-toggle');toggle.textContent=language==='zh'?'EN':'中';toggle.title=text.switch;toggle.setAttribute('aria-label',text.switch);
 document.getElementById('project-names').setAttribute('aria-label',text.projects);
 document.querySelectorAll('.project-names button').forEach((button,i)=>button.setAttribute('aria-label',(language==='zh'?'选择':'Select ')+projects[i].en));
 const about=document.getElementById('about-panel');
 if(aboutChineseHTML===null)aboutChineseHTML=about.innerHTML;
 if(language==='zh')about.innerHTML=aboutChineseHTML;
 else about.innerHTML=`<h2>ABOUT ME</h2><p><strong>Hi, I’m Qing Zhang 👋</strong></p><p>A designer born and raised in Wuhan, now living and working in Shanghai.</p><p>I enjoy exploring what makes an experience interesting and why people want to take part. I like trying new ideas and tools, bringing them to life, and refining the details.</p><p>Outside work, I enjoy music 🎶, climbing 🧗, an occasional drink 🥂, and mystery stories. If we share an interest, feel free to get in touch!</p><p class="about-closing">A growing collection of my projects, experiments & unexpected ideas.</p><div class="small-actions"><a class="pill" href="/assets/docs/portfolio-zhang-qing.pdf" target="_blank" rel="noreferrer">PORTFOLIO</a><a class="pill" href="/assets/docs/resume-zhang-qing.pdf" target="_blank" rel="noreferrer">RÉSUMÉ</a></div>`;
 document.querySelector('#contact-panel h2').textContent=text.contact;
 document.querySelector('#contact-panel [href^="tel:"] span').textContent=text.phone;
 document.querySelector('.wechat-contact span').textContent=text.wechat;
 document.querySelector('.wechat-contact p').textContent=text.samePhone;
 document.querySelector('#wechat-qr').alt=language==='zh'?'张清微信二维码':'Qing Zhang’s WeChat QR code';
 if(openProject!==null&&!detail.hidden){
   // Only the text column changes. Keep the media node, audio graph and scroll position intact.
   const scroll=detail.scrollTop;detail.querySelector('.case-copy').innerHTML=renderCaseCopy(openProject);updateCopyStickyOffset();detail.scrollTop=scroll;updateDetailColor();updateDetailLanguage();
 }
 hit.setAttribute('aria-label',(language==='zh'?'查看':'View ')+projects[selected].en+(language==='zh'?'项目':' project'));
 fitProjectNames();fitAboutClosing();updateSoundState();
}
function updateDetailLanguage(){
 const p=projects[openProject];document.title=(language==='zh'?p.title:p.en)+' · qing';
 detail.querySelectorAll('[data-media]').forEach(button=>{const item=p.gallery[Number(button.dataset.media)];button.setAttribute('aria-label',(language==='zh'?'查看':'View ')+(item?.title||p.en))});
 detail.querySelector('.detail-cover img')?.setAttribute('alt',p.en);
 detail.querySelector('.project-sheet')?.setAttribute('aria-label',p.en+(language==='zh'?' 连续作品长图':' portfolio sheets'));
 requestAnimationFrame(updateCopyStickyOffset);
}
function updateCopyStickyOffset(){
 const copy=detail.querySelector('.case-copy');if(!copy||detail.hidden)return;
 // Longer line-by-line lists must be able to scroll fully into view before sticking.
 copy.style.top=Math.min(100,detail.clientHeight-copy.scrollHeight-24)+'px';
}
window.addEventListener('resize',updateCopyStickyOffset);
