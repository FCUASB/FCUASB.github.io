/* Shared by the homepage and acceptance page. No remote video source before a click. */
const ProjectVideo=(()=>{
 const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#172438"/><circle cx="320" cy="200" r="46" fill="#ead8b5"/><path d="M307 175v50l39-25z" fill="#172438"/></svg>');
 const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function cover(media,label='影片封面'){
  const src=media.poster||(media.youtube?'https://i.ytimg.com/vi/'+encodeURIComponent(media.youtube)+'/hqdefault.jpg':placeholder);
  return `<img class="video-cover" data-video-cover src="${escape(src)}" alt="${escape(label)}" loading="lazy" decoding="async">`;
 }
 function player(media,label='影片'){
  return `<button type="button" class="video-start" data-play-video ${media.youtube?`data-video-youtube="${escape(media.youtube)}"`:`data-video-src="${escape(media.url)}"`} data-video-title="${escape(label)}" aria-label="播放${escape(label)}">${cover(media,label+'封面')}<span class="video-start-label">▶ 點擊播放影片</span></button>`;
 }
 function stop(root){
  root.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.querySelectorAll('source').forEach(source=>source.remove());video.load()});
  root.querySelectorAll('iframe[data-click-video]').forEach(frame=>{frame.removeAttribute('src');frame.remove()});
 }
 async function prepare(file){
  const fallback={blob:file,w:400,h:300,posterBlob:null};
  if(typeof document==='undefined')return fallback;
  return new Promise(resolve=>{
   const video=document.createElement('video'),url=URL.createObjectURL(file);let finished=false,capturing=false;
   const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);video.onloadedmetadata=video.onloadeddata=video.onseeked=video.onerror=null;video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);resolve(result)};
   const timer=setTimeout(()=>finish(fallback),12000);
   const capture=()=>{
    if(finished||capturing||video.readyState<2)return;capturing=true;
    try{
     const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return finish(fallback);
     const scale=Math.min(1,640/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
     const context=canvas.getContext('2d');if(!context)return finish(fallback);context.drawImage(video,0,0,canvas.width,canvas.height);
     canvas.toBlob(posterBlob=>finish({blob:file,w,h,posterBlob:posterBlob?.size>0&&posterBlob.size<=262144?posterBlob:null}),'image/jpeg',.75);
    }catch{finish(fallback)}
   };
   video.muted=true;video.playsInline=true;video.preload='auto';video.onerror=()=>finish(fallback);
   video.onloadedmetadata=()=>{const at=Number.isFinite(video.duration)?Math.min(1,video.duration/2):0;if(at>0){video.onseeked=capture;video.currentTime=at}else video.onloadeddata=capture};
   video.onloadeddata=()=>{if(!video.seeking)capture()};video.src=url;
  });
 }
 if(typeof document!=='undefined'){
  document.addEventListener('error',event=>{const img=event.target;if(img.matches?.('img[data-video-cover]')&&img.getAttribute('src')!==placeholder)img.src=placeholder},true);
  document.addEventListener('click',event=>{
   const button=event.target.closest('[data-play-video]');if(!button)return;
   const title=button.dataset.videoTitle||'影片';
   if(button.dataset.videoYoutube){
    const id=button.dataset.videoYoutube;if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;
    const wrap=document.createElement('div'),frame=document.createElement('iframe');wrap.className='embed-wrap';frame.dataset.clickVideo='true';frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?autoplay=1&rel=0';frame.title=title;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';wrap.append(frame);button.replaceWith(wrap);
   }else{
    const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label',title);
    video.addEventListener('error',()=>{const note=document.createElement('p');note.className='hint';note.textContent='此瀏覽器無法播放這個影片格式，請改用 MP4（H.264）。';video.after(note)},{once:true});
    video.src=button.dataset.videoSrc;button.replaceWith(video);void video.play().catch(()=>{});
   }
  });
 }
 return {cover,player,stop,prepare};
})();
