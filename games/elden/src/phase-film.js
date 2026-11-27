// Prerender of the game's native phase scene. The source recording skips it.
export function createPhaseFilm(hudCanvas){
 const video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='auto';video.hidden=true;
 video.title='Miquella and Radahn — arena cinematic';
 video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:black;pointer-events:none';
 hudCanvas.before(video);
 let active=false,loading=null,failed=false,started=false,decoded=false,initialTime=0,session=0;
 let requestedFrame=-1,seekSince=0;
 function prepare(){
  if(loading)return loading;
  const asset=new URL('../assets/phase-transition.mp4',"https://radahn-offline.invalid/src/phase-film.js");
  if(asset.origin===location.origin&&/^https?:$/.test(location.protocol)){
   video.src=asset.href;video.load();return loading=Promise.resolve();
  }
  loading=fetch(asset)
   .then(response=>{if(!response.ok)throw Error('Missing phase film');return response.blob();})
   .then(blob=>{video.src=URL.createObjectURL(blob);video.load();})
   .catch(()=>{failed=true;});
  return loading;
 }
 function stop(){
  if(!active)return;
  session++;active=false;started=false;decoded=false;video.pause();video.hidden=true;
 }
 video.addEventListener('error',()=>{failed=true;decoded=false;video.hidden=true;});
 document.addEventListener('visibilitychange',()=>{
  if(!active||!started)return;
  if(document.hidden)video.pause();
  else if(!video.ended)video.play().catch(()=>{failed=true;});
 });
 return {stop,prepare,
  // Exporters step the simulation by frame. Decode the matching film frame
  // while paused, then paint it into the same HUD canvas as the live capture.
  sample(ctx,time){
   if(failed||time<0)return 'fallback';
   prepare();
   const frame=Math.max(0,Math.floor(time*60+1e-5));
   if(frame!==requestedFrame){requestedFrame=frame;seekSince=performance.now();}
   if(performance.now()-seekSince>6000)return 'fallback';
   if(video.readyState<1)return 'seeking';
   const at=Math.min((frame+.15)/60,video.duration-.008);
   if(Math.abs(video.currentTime-at)>.003){video.currentTime=at;return 'seeking';}
   if(video.seeking||video.readyState<2)return 'seeking';
   ctx.drawImage(video,0,0,1280,720);return 'ready';
  },
  // Asynchronous loads keep the real-time scene visible until a frame from
  // the requested chapter is decoded. Skip and combat still own the stage.
  show(time){
   if(failed){video.hidden=true;return false;}
   if(!active){active=true;initialTime=time>1?time:0;prepare();}
   if(time<0||video.readyState<2)return false;
   if(!started){
    started=true;
    video.currentTime=Math.min(initialTime,video.duration-.05);
    const token=session;
    const reveal=(_,metadata)=>{
     if(token!==session||!active||failed)return;
     if(metadata&&(video.seeking||metadata.mediaTime+.04<initialTime)){video.requestVideoFrameCallback(reveal);return;}
     decoded=true;video.hidden=false;
    };
    if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(reveal);
    else video.addEventListener('playing',reveal,{once:true});
    video.play().catch(()=>{if(token===session){failed=true;video.hidden=true;}});
   }
   return decoded;
  },
  clock(){return active&&decoded&&!failed?video.currentTime:null;},
  ended(){return active&&decoded&&!failed&&video.ended;}
 };
}
