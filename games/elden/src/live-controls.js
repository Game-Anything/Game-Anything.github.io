// Translate physical devices to the encounter's original input timeline.
// Recorded fights already contain the original codes and bypass this adapter.
const keyboard = {
  KeyW:'KeyW', KeyA:'KeyA', KeyS:'KeyS', KeyD:'KeyD', AltLeft:'Walk',
  Space:'KeyE', KeyF:'Space', KeyX:'KeyF', KeyQ:'KeyG', KeyR:'KeyQ',
  F7:'Layout', F8:'Graphics', F9:'KeyM', KeyE:'Interact', Escape:'Enter', KeyH:'KeyH', KeyG:'Map',
  ArrowUp:'ArrowUp', ArrowDown:'ArrowDown', ArrowLeft:'ArrowLeft', ArrowRight:'ArrowRight'
};
const currentKeyboard = {...keyboard, AltLeft:null, KeyX:'Walk', ShiftLeft:'KeyE', Space:'Space',
  KeyG:'KeyF', KeyF:'KeyC', KeyM:'Map'};
const padButtons = ['Space','KeyE','KeyQ','Interact','KeyZ','KeyX','KeyC','KeyV','Map',
  'Enter','KeyF','KeyG','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
const menuKeys = {F7:'Layout',F8:'Graphics',F9:'KeyM',KeyE:'Space',Enter:'Space',KeyQ:'MenuBack',Backspace:'MenuBack',KeyX:'MenuTabNext',KeyZ:'MenuTabPrev',KeyR:'MenuRemove',KeyY:'MenuDetail',KeyC:'MenuPageUp',KeyV:'MenuPageDown',
  Escape:'Enter',KeyH:'KeyH',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight'};
const menuButtons = {0:'Space',1:'MenuBack',2:'MenuRemove',4:'MenuTabPrev',5:'MenuTabNext'};

export function controlLabel(device, keyboardLabel, xbox, ps){
  return device==='ps' ? ps : device==='xbox' ? xbox : keyboardLabel;
}

function stick(axes,offset){
  const x=axes[offset]||0,y=axes[offset+1]||0;
  const length=Math.hypot(x,y);
  if(length<=.16)return [0,0];
  const scale=Math.min(1,(length-.16)/.84)/length;
  return [x*scale,y*scale];
}

export function attachLiveControls(canvas, state, send, unlockAudio){
  const sources=new Map();
  const usedInteractions=new Set();
  let previousButtons=[],padIndex=null,previousAxes=[0,0,0,0],suspended=false,ignoreHeldOnReturn=false;
  let wasLocked=false,hadOverlay=false,escapeSeen=false;
  const device=name=>{state.inputDevice=name;};
  function press(source,code,time){
    if(!code||sources.has(source))return;
    const alreadyHeld=Array.from(sources.values()).includes(code);
    sources.set(source,code);
    // E / Y is both interact and the two-hand modifier. Resolve a plain tap
    // on release so changing grip at the fog gate doesn't enter the arena.
    if(code==='Interact'){
      if(!alreadyHeld)send('down','PouchHeld',time);
      return;
    }
    if(!alreadyHeld)send('down',code,time);
  }
  function release(source,time,cancel=false){
    const code=sources.get(source);
    if(!code)return;
    sources.delete(source);
    if(code==='Interact'){
      const used=usedInteractions.delete(source);
      if(!Array.from(sources.values()).includes(code))send(cancel?'cancel':'up','PouchHeld',time);
      if(!cancel&&!used&&!state.menu&&!state.arenaMap&&!state.help&&!Array.from(sources.values()).includes(code)){
        send('down',code,time);send('up',code,time);
      }
      return;
    }
    if(!Array.from(sources.values()).includes(code))send(cancel?'cancel':'up',code,time);
  }
  function tap(source,code,time){press(source,code,time);release(source,time);}
  function chord(source,code){
    if(!state.menu&&!state.help&&!state.arenaMap&&sources.get(source)==='Interact'){
      usedInteractions.add(source);
      return code;
    }
    return null;
  }
  function clear(){
    if(padIndex!==null)ignoreHeldOnReturn=true;
    sources.clear();usedInteractions.clear();previousButtons=[];previousAxes=[0,0,0,0];padIndex=null;
    send('clear',null,performance.now());
  }
  window.addEventListener('blur',()=>{suspended=true;clear();});
  window.addEventListener('focus',()=>{suspended=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  window.addEventListener('keydown',e=>{
    const bindings=state.currentLayout?currentKeyboard:keyboard;
    let code=(state.menu?menuKeys:bindings)[e.code];
    if(state.arenaMap&&(e.code==='KeyQ'||e.code==='Backspace'))code='MenuBack';
    if(e.code==='F7'&&!state.help)return;
    if(code?.startsWith('Arrow'))code=chord('KeyE','Pouch'+code.slice(5))||code;
    if(!code||e.metaKey||(e.ctrlKey&&!state.currentLayout))return;
    e.preventDefault();if(e.repeat)return;
    if(e.code==='Escape'&&document.pointerLockElement===canvas)escapeSeen=true;
    device('keyboard');unlockAudio();press(e.code,code,e.timeStamp);
  });
  window.addEventListener('keyup',e=>{
    if(sources.has(e.code)){e.preventDefault();release(e.code,e.timeStamp);}
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('auxclick',e=>e.preventDefault());
  function menuSlot(e){
    const bounds=canvas.getBoundingClientRect();
    const x=(e.clientX-bounds.left)*1280/bounds.width-42;
    const y=(e.clientY-bounds.top)*720/bounds.height-120;
    if(x<0||y<0||x>=395||y>=425||x%79>66||y%85>66)return -1;
    const slot=Math.floor(y/85)*5+Math.floor(x/79);
    return state.menuPage&&slot>=4?-1:slot;
  }
  canvas.addEventListener('mousedown',e=>{
    if(e.button>2)return;
    e.preventDefault();device('keyboard');unlockAudio();
    const source='mouse'+e.button;
    if(state.menu){
      if(e.button===0&&menuSlot(e)>=0){
        send('slot',menuSlot(e),e.timeStamp);press(source,'Space',e.timeStamp);
      }
      if(e.button===2)press(source,'MenuBack',e.timeStamp);
      return;
    }
    if(state.arenaMap||state.help)return;
    if(!document.pointerLockElement){
      try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}
    }
    let code='KeyG';
    if(e.button!==1){
      const modified=state.currentLayout?e.ctrlKey:e.shiftKey;
      code=chord('KeyE',e.button===0?'TwoHandRight':'TwoHandLeft')||
        (e.button===0?(modified?'KeyV':'KeyX'):(modified?'KeyC':'KeyZ'));
    }
    press(source,code,e.timeStamp);
  });
  window.addEventListener('mouseup',e=>release('mouse'+e.button,e.timeStamp));
  window.addEventListener('mousemove',e=>{
    if(state.help||state.arenaMap||document.hidden||suspended)return;
    if(state.menu){
      if(e.target===canvas){
        const slot=menuSlot(e);if(slot>=0){device('keyboard');send('slot',slot,e.timeStamp);}
      }
      return;
    }
    if(document.pointerLockElement!==canvas&&e.target!==canvas)return;
    if(e.movementX||e.movementY){device('keyboard');send('look',[e.movementX,e.movementY],e.timeStamp);}
  });
  document.addEventListener('pointerlockchange',()=>{
    const locked=document.pointerLockElement===canvas;
    if(wasLocked&&!locked){
      for(const source of Array.from(sources.keys()))if(source.startsWith('mouse'))release(source,performance.now(),true);
      if(!suspended&&!document.hidden&&document.hasFocus()&&!hadOverlay&&!state.menu&&!state.help&&!state.arenaMap&&!escapeSeen){
        tap('unlock','Enter',performance.now());
      }
    }
    escapeSeen=false;
    wasLocked=locked;
  });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();if(!e.deltaY)return;device('keyboard');
    const up=e.deltaY<0;
    const modified=state.currentLayout?e.ctrlKey:e.shiftKey;
    const code=modified&&!state.menu?(up?'ArrowRight':'ArrowLeft'):(up?'ArrowUp':'ArrowDown');
    tap('wheel',chord('KeyE','Pouch'+code.slice(5))||code,e.timeStamp);
  },{passive:false});
  function releasePad(now){
    for(const source of Array.from(sources.keys()))if(source.startsWith('pad'))release(source,now,true);
    previousButtons=[];previousAxes=[0,0,0,0];padIndex=null;
    send('axes',previousAxes,now);
  }
  return function poll(now){
    const overlay=state.menu||state.help||state.arenaMap;
    if(overlay&&!hadOverlay){
      for(const source of Array.from(sources.keys()))release(source,now,true);
      if(document.pointerLockElement===canvas)document.exitPointerLock();
    }
    hadOverlay=overlay;
    if(suspended||document.hidden)return;
    let pads;
    try{pads=navigator.getGamepads?.();}catch{return;}
    if(!pads)return;
    const current=pads[padIndex];
    const pad=current?.connected?current:Array.from(pads).find(p=>p?.connected&&p.mapping==='standard');
    if(pad?.index!==padIndex && padIndex!==null)releasePad(now);
    if(!pad)return;
    padIndex=pad.index;
    const buttons=pad.buttons.map(b=>b.pressed||b.value>.5);
    if(ignoreHeldOnReturn){previousButtons=buttons;ignoreHeldOnReturn=false;}
    const axes=[...stick(pad.axes,0),...stick(pad.axes,2)];
    const layout=/playstation|dualsense|dualshock|054c/i.test(pad.id)?'ps':'xbox';
    if(axes.some((v,i)=>Math.abs(v-previousAxes[i])>.002||(!v&&previousAxes[i]))){
      if(axes.some(Boolean))device(layout);
      send('axes',axes,now);previousAxes=axes;
    }
    for(let i=0;i<Math.max(padButtons.length,buttons.length);i++){
      const source='pad'+i;
      if(buttons[i]&&!previousButtons[i]){
        device(layout);unlockAudio();
        let code=padButtons[i];
        if(layout==='ps'&&i===8)code=null;
        if(layout==='ps'&&i===17)code='Map';
        if(state.arenaMap&&i===1)code='MenuBack';
        if(state.menu)code=menuButtons[i]||([8,9,12,13,14,15].includes(i)?code:null);
        else if(i>=4&&i<=7)code=chord('pad3',i%2?'TwoHandRight':'TwoHandLeft')||code;
        else if(i>=12&&i<=15)code=chord('pad3','Pouch'+padButtons[i].slice(5))||code;
        press(source,code,now);
      }else if(!buttons[i]&&previousButtons[i])release(source,now);
    }
    previousButtons=buttons;
  };
}
