// Drive the same fixed-step simulation and camera that the playable build uses.
// The source recording begins 243 native frames after the first recorded input.
export function referencePlayback({inputs,timeline,advance,render,composer,updateMatrices}){
  const offset=243,fps=60;
  const draw=composer.render.bind(composer);
  timeline.reset(0);
  for(const e of inputs){
    if(e.repeat)continue;
    const ms=e.time_ns/1e6;
    timeline.enqueue(e.event==='key_press'?'down':'up',e.code,ms,ms);
  }
  let frame=-1;
  function show(seconds){
    const target=offset+Math.floor(Math.max(0,seconds)*fps+1e-5);
    if(target<frame)return 'rewind';
    if(frame===target)return 'ready';
    // Seek in short batches. Every intermediate frame advances cloth, camera,
    // particles and skeletons even when it isn't submitted to the compositor.
    const end=Math.min(frame+24,target);
    try{
      for(let next=frame+1;next<=end;next++){
        composer.render=next===target?draw:updateMatrices;
        advance(next*1000/fps);render(next?1/fps:0,(next-offset)/fps);
        frame=next;
      }
    }finally{composer.render=draw;}
    return frame===target?'ready':'seeking';
  }
  return {show};
}
