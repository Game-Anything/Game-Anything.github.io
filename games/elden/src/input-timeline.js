// Keep DOM input on the same fixed-step clock as combat. A slow render must
// not collapse a press and release onto the previous simulation frame.
export class InputTimeline {
 constructor(origin=0){this.stepMs=1000/120;this.reset(origin);}
 reset(origin){this.origin=origin;this.ticks=0;this.queue=[];this.lateEvents=0;this.maxLatenessMs=0;}
 get cursor(){return this.origin+this.ticks*this.stepMs;}
 enqueue(type,code,timeStamp,receivedAt,timeOrigin=0){
  let time=Number.isFinite(timeStamp)?timeStamp:receivedAt;
  // Older event implementations can report an epoch-based timestamp.
  if(time>receivedAt+60000)time-=timeOrigin;
  time=Math.min(receivedAt,Math.max(this.origin,time));
  const late=Math.max(0,this.cursor-time);
  if(late>.001){this.lateEvents++;this.maxLatenessMs=Math.max(this.maxLatenessMs,late);}
  const event={type,code,time:Math.max(this.cursor,time)};
  let i=this.queue.length;
  while(i>0&&this.queue[i-1].time>event.time)i--;
  this.queue.splice(i,0,event);
 }
 advance(now,step,apply,flushLiveInputs=false){
  // Limit work per frame, preserving any remaining debt and input order.
  // Never erase time or silently move future inputs into an earlier step.
  const due=Math.max(this.ticks,Math.floor((now-this.origin+.000001)/this.stepMs));
  const end=Math.min(due,this.ticks+600);
  while(this.ticks<end){
   const boundary=this.origin+(this.ticks+1)*this.stepMs;
   while(this.queue.length&&this.queue[0].time<=boundary+.000001)apply(this.queue.shift());
   step(this.stepMs/1000,!flushLiveInputs||this.ticks+1===end);this.ticks++;
  }
  // Buttons and mouse look sampled just before a draw should affect that draw.
  // The following physics tick sees the same keys. Keep input ordered behind
  // any outstanding catch-up work and leave recorded playback on fixed ticks.
  if(flushLiveInputs && this.ticks===due){
   while(this.queue.length && this.queue[0].time<=now)apply(this.queue.shift());
  }
 }
}
