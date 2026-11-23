import {controlLabel} from "game/src/live-controls.js";
// Text/weights transcribed from the selected recording's preparation menu.
const seal={name:'Finger Seal +25',slot:'Right Hand Armament 1',icon:'seal',type:'Sacred Seal',attackType:'Strike',skill:'No Skill',weight:'1.5'};
const gauche={name:'Main-gauche',slot:'Left Hand Armament 1',icon:'dagger',type:'Dagger',attackType:'Slash/Pierce',skill:'Parry',weight:'2.0'};
const head={name:'Divine Beast Head',slot:'Head',icon:'talisman',weight:'10.6',negation:[['Physical','7.0'],['VS Strike','5.9'],['VS Slash','6.7'],['VS Pierce','6.8'],['Magic','4.9'],['Fire','7.2'],['Lightning','4.6'],['Holy','4.9']]};
const fingers={name:'Two Fingers Heirloom',icon:'talisman',weight:'0.6',effect:'Raises faith'};
const sword={name:'Ritual Sword Talisman',icon:'talisman',weight:'0.9',effect:'Raises attack power when HP is at maximum'};
const shield={name:'Ritual Shield Talisman',icon:'talisman',weight:'0.9',effect:'Raises defense when HP is at maximum'};
const soreseal={name:"Marika's Soreseal",icon:'talisman',weight:'0.8',effect:'Greatly raises attributes, but also increases damage taken'};
// Identity matched to the primary HUD, corroborated by the same-weapon
// gameplay equipment screen. Affinity, upgrade and unshown skill stay unknown.
const lance={name:'Sword Lance',slot:'Right Hand Armament 2',icon:'lance',type:'Heavy Thrusting Sword',attackType:'Standard/Pierce',weight:'9.0'};
const talismans=[fingers,sword,shield,soreseal];
function liveEquipmentInfo(s,index){
 if(s.menuPage)return talismans[index];
 if(index===15||index===16)return talismans.find(t=>t.name===s.talismans[index-15]);
 return ({0:seal,1:lance,5:gauche,10:head})[index];
}
export function handleLiveEquipmentInput(s,code){
 if(!s.menu)return false;
 const index=s.menuSelection;
 const isTalisman=index===15||index===16;
 const count=s.menuPage?talismans.length:25;
 if(code==='Enter'||(code==='MenuBack'&&!s.menuPage)){
  s.menu=false;s.menuPage=false;s.menuDepth=0;
 }else if(code==='MenuBack'){
  s.menuPage=false;s.menuDepth=0;s.menuSelection=15+s.equipSlot;
 }else if(code==='MenuTabPrev'||code==='MenuTabNext'){
  const current=!s.menuPage&&isTalisman?index-15:s.equipSlot||0;
  s.equipSlot=1-current;
  s.menuSelection=s.menuPage?Math.max(0,talismans.findIndex(t=>t.name===s.talismans[s.equipSlot])):15+s.equipSlot;
 }else if(code==='Space'){
  if(s.menuPage){
   const chosen=talismans[index];
   if(!chosen)return true;
   const equipped=s.talismans.indexOf(chosen.name);
   if(equipped!==-1&&equipped!==s.equipSlot)return true;
   s.talismans[s.equipSlot]=chosen.name;s.menuPage=false;s.menuDepth=0;s.menuSelection=15+s.equipSlot;
  }else if(isTalisman){
   s.equipSlot=index-15;s.menuPage=true;s.menuDepth=2;
   s.menuSelection=Math.max(0,talismans.findIndex(t=>t.name===s.talismans[s.equipSlot]));
  }
 }else if(code==='MenuRemove'&&(s.menuPage||isTalisman)){
  s.talismans[s.menuPage?s.equipSlot:index-15]=null;
 }else if(code==='MenuDetail'){s.equipmentCompact=!s.equipmentCompact;}
 else if(code==='MenuPageUp'||code==='MenuPageDown'){s.menuSelection=code==='MenuPageUp'?0:count-1;}
 else{
  const stride=s.menuPage?1:5;
  const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-stride,ArrowDown:stride}[code];
  if(offset!==undefined)s.menuSelection=(index+count+offset)%count;
 }
 return true;
}
export function equipmentInfo(s){
 if(s.menuPage){const item=s.menuSelection===0?fingers:s.menuSelection===3?shield:s.menuSelection===5?(s.equipSlot===1?soreseal:sword):null;return item?{...item,slot:`Talisman ${(s.equipSlot||0)+1}`}:null;}
 if(s.menuSelection===0)return seal;if(s.menuSelection===1)return lance;if(s.menuSelection===5)return gauche;if(s.menuSelection===10)return head;
 if(s.menuSelection===15||s.menuSelection===16){const index=s.menuSelection-15,item=talismans.find(t=>t.name===s.talismans[index]);return item?{...item,slot:`Talisman ${index+1}`}:null;}
 return null;
}
function drawText(c,s,x,y,size=15,color='#d5d2bd',align='left'){
 c.font=`${size}px Georgia`;c.fillStyle=color;c.textAlign=align;c.shadowColor='#000';c.shadowBlur=3;c.fillText(s,x,y);c.shadowBlur=0;
}
export class HUD {
 constructor(){this.canvas=document.createElement('canvas');this.canvas.id='hud';this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';document.body.append(this.canvas);this.canvas.width=1920;this.canvas.height=1080;this.ctx=this.canvas.getContext('2d');this.ctx.setTransform(1.5,0,0,1.5,0,0);this.damage=0;this.damageUntil=0;
  this.slots=new Image();this.slots.src=new URL('../assets/hud/quickslots.png',"https://radahn-offline.invalid/src/hud.js").href;this.statusArt=new Image();this.statusArt.src=new URL('../assets/hud/encounter-icons.png',"https://radahn-offline.invalid/src/hud.js").href;
  this.quickslotCanvas=document.createElement('canvas');
  this.quickslotCanvas.width=480;this.quickslotCanvas.height=420;
  this.quickslotCtx=this.quickslotCanvas.getContext('2d');
  this.quickslotCtx.setTransform(1.5,0,0,1.5,0,-648);
  this.ready=Promise.all([this.slots.decode(),this.statusArt.decode()]);}
 quickslots(s){
  if(!this.slots.complete||!this.slots.naturalWidth)return;
  if(s.pouchHeld&&s.inputDevice!=='recording'){this.pouch(s);return;}
  // Keep filtered atlas draws on their original destination canvas.
  if(s.item!==0){this.paintQuickslots(s,this.ctx);return;}
  const key=[s.weapon,s.flasks,s.skill,s.leftEquipped,s.grip].join('|');
  if(key!==this.quickslotKey){
   const c=this.quickslotCtx;
   c.clearRect(0,432,320,280);
   this.paintQuickslots(s,c);
   this.quickslotKey=key;
  }
  this.ctx.drawImage(this.quickslotCanvas,0,432,320,280);
 }
 paintQuickslots(s,c){
  const draw=(i,x,y,w,h)=>c.drawImage(this.slots,i%3*96,Math.floor(i/3)*112,w,h,x/1.5,y/1.5,w/1.5,h/1.5);
  draw(s.weapon===1?5:0,143,802,87,106);
  if(s.inputDevice==='recording'||s.leftEquipped!==false)draw(1,47,855,88,107);
  draw(s.weapon===1?4:2,236,855,89,107);
  c.save();if(s.item!==0)c.filter='hue-rotate(26deg) saturate(.68)';draw(3,143,912,87,107);c.restore();
  draw(6,231,802,65,49);draw(7,231,966,65,53);
  const remaining=s.item===0||s.inputDevice==='recording'?s.flasks:s.physick;
  drawText(c,String(remaining??0),151,676,14,'#dedacf','right');
  drawText(c,'Flame, Grant Me Strength',98,529,14,s.weapon===1?'#e1d9c8':'#aaa697');
  drawText(c,s.item===0?'Flask of Crimson Tears +12':'Wondrous Physick',98,700,14);
  const g=c.createLinearGradient(30,0,160,0);g.addColorStop(0,'#0c0a09b8');g.addColorStop(.73,'#201b16a6');g.addColorStop(1,'#19170d00');
  c.fillStyle=g;c.fillRect(31,441,132,22);c.fillStyle='#a39668';c.fillRect(31,441,1,22);
  c.save();c.translate(45,452);c.strokeStyle='#b7aa81';c.lineWidth=1;
  c.beginPath();c.moveTo(0,-7);c.lineTo(0,6);c.moveTo(-6,-3);c.quadraticCurveTo(-5,2,0,5);c.quadraticCurveTo(5,2,6,-3);c.stroke();c.restore();
  drawText(c,s.skill||'Parry',58,456,14);
  if(s.grip&&s.inputDevice!=='recording')drawText(c,s.grip==='right'?'Two-hand · right':'Two-hand · left',32,480,14,'#ded4ac');
 }
 pouch(s){
  const c=this.ctx;c.save();c.fillStyle='#171a14eb';c.fillRect(24,512,280,183);
  this.text('Pouch',40,542,20,'#e1d5a7');
  this.text(`↑   Crimson Flask   ×${s.flasks}`,40,576,17);
  this.text(`↓   Physick   ×${s.physick??0}`,40,609,17);
  this.text('←   Empty         →   Empty',40,661,15,'#ada995');c.restore();
 }
 text(s,x,y,size,color,align){drawText(this.ctx,s,x,y,size,color,align);}
 icon(type,x,y,w=50,selected=false){const c=this.ctx;c.save();c.translate(x,y);const g=c.createLinearGradient(0,0,w,w);g.addColorStop(0,'#292a24dd');g.addColorStop(1,'#080a08dd');c.fillStyle=g;c.fillRect(0,0,w,w);c.strokeStyle=selected?'#c8ba86':'#74746a';c.lineWidth=selected?2:1;c.strokeRect(0,0,w,w);c.scale(w/60,w/60);
 if(type==='flask'){c.fillStyle='#c3a551';c.beginPath();c.moveTo(23,12);c.lineTo(37,12);c.lineTo(34,25);c.bezierCurveTo(53,43,43,56,28,55);c.bezierCurveTo(11,54,10,40,25,25);c.closePath();c.fill();c.strokeStyle='#eee3ac';c.stroke();for(let i=0;i<7;i++){c.beginPath();c.ellipse(29+i%2*3,32+i*2,9-i*.7,6,Math.sin(i),0,6.28);c.stroke();}c.fillStyle='#f4daa1';c.fillRect(22,9,16,4);}
 else if(type==='lance'){
  // Same primary-video icon orientation: long engraved pommel at top right,
  // dark ricasso and broad blade continue below the small equipment frame.
  c.beginPath();c.rect(1,1,58,58);c.clip();c.translate(30,30);c.rotate(.55);
  c.fillStyle='#727b80';c.strokeStyle='#a5aeb0';c.lineWidth=.8;
  c.beginPath();c.moveTo(-2,-30);c.lineTo(2,-30);c.lineTo(4,-13);c.lineTo(-4,-13);c.closePath();c.fill();c.stroke();
  c.strokeStyle='#333d43';for(let y=-26;y<-13;y+=3){c.beginPath();c.moveTo(-3,y-1);c.lineTo(2,y+2);c.stroke();}
  c.fillStyle='#343a3c';c.fillRect(-1.7,-13,3.4,13);
  c.fillStyle='#737b7c';c.beginPath();c.moveTo(-11,-1);c.lineTo(-11,1);c.lineTo(-3,3);c.lineTo(3,3);c.lineTo(11,1);c.lineTo(11,-1);c.lineTo(2,0);c.lineTo(-2,0);c.closePath();c.fill();
  c.fillStyle='#333a3d';c.strokeStyle='#80898b';c.beginPath();c.moveTo(-2.6,3);c.lineTo(-2.6,13);c.lineTo(-5,17);c.lineTo(-3.7,38);c.lineTo(0,47);c.lineTo(3.7,38);c.lineTo(5,17);c.lineTo(2.6,13);c.lineTo(2.6,3);c.closePath();c.fill();c.stroke();
  c.strokeStyle='#afb6b5';c.beginPath();c.moveTo(0,3);c.lineTo(0,45);c.stroke();
 }
 else if(type==='sword'||type==='dagger'){c.translate(30,30);c.rotate(.55);c.fillStyle='#a8ada5';c.beginPath();c.moveTo(-3,12);c.lineTo(-2,-17);c.lineTo(1,-25);c.lineTo(4,-17);c.lineTo(3,12);c.closePath();c.fill();c.fillStyle='#777968';c.fillRect(-10,11,20,3);c.fillStyle='#514532';c.fillRect(-2,14,4,12);c.fillStyle='#aaa991';c.beginPath();c.arc(0,27,3,0,7);c.fill();if(type==='dagger'){c.strokeStyle='#c3c7bb';c.beginPath();c.ellipse(-5,-3,10,17,.2,0,5.7);c.stroke();}}
 else if(type==='spell'){const g=c.createRadialGradient(30,28,1,30,28,23);g.addColorStop(0,'#ba7159');g.addColorStop(.4,'#672e28');g.addColorStop(1,'#130f10');c.fillStyle=g;c.fillRect(5,5,50,50);c.strokeStyle='#b97b65';for(let i=0;i<4;i++){c.beginPath();c.ellipse(30,30,7+i*3,20-i*2,Math.sin(i),0,6.28);c.stroke();}}
 else{c.translate(30,30);c.strokeStyle='#a39e7d';c.fillStyle='#817c5a';c.lineWidth=2;c.beginPath();c.ellipse(0,0,13,20,.2,0,6.28);c.fill();c.stroke();c.strokeStyle='#d2c6a1';c.beginPath();c.moveTo(0,-16);c.lineTo(0,16);c.moveTo(-9,-6);c.lineTo(9,-6);c.stroke();c.beginPath();c.arc(0,-6,6,0,6.28);c.stroke();}c.restore();}
 updateBars(s){
 const dt=Math.min(.1,Math.max(0,s.time-(this.lastTime??s.time)));this.lastTime=s.time;
 if(this.life!==s.life){this.life=s.life;this.hpTrail=s.hp;this.bossTrail=s.bossHp;this.lastHp=s.hp;this.lastBoss=s.bossHp;}
 for(const [current,previous,trail,until] of [['hp','lastHp','hpTrail','hpUntil'],['bossHp','lastBoss','bossTrail','bossUntil']]){
   if(s[current]<this[previous])this[until]=s.time+.55;
   if(s[current]>=this[trail])this[trail]=s[current];else if(s.time>(this[until]||0))this[trail]+=(s[current]-this[trail])*(1-Math.exp(-dt*3.6));
   this[previous]=s[current];
 }
 }
 draw(s){const c=this.ctx;this.updateBars(s);
  if(s.inputDevice!=='recording'&&s.stage==='combat'&&!s.help&&!s.menu&&!s.arenaMap&&!s.banner&&!s.reward&&!s.victoryFlash&&!s.fade&&s.runeRewardAt==null){
    // Keep the composited HUD when no visible value has moved even a quarter
    // pixel. Bars still integrate every frame and a new hit invalidates at once.
    const aim=s.locked?s.lockScreen:null;
    const signature=[s.life,s.phase,s.bossVisible,s.maxHp,s.bossMax,s.hp,s.bossHp,
      Math.round(700*this.hpTrail/s.maxHp),Math.round(2660*this.bossTrail/s.bossMax),
      s.fp,Math.round(s.stamina*9),Math.round((s.compassYaw||0)*340),
      aim?Math.round(aim.x*4):'',aim?Math.round(aim.y*4):'',s.marked,Math.round((s.bleed||0)*10),
      s.prompt,s.item,s.flasks,s.physick,s.weapon,s.skill,s.grip,s.inputDevice,s.leftEquipped,
      s.pouchHeld,s.runes,s.lastDamage&&s.time-s.damageTime<2.4?s.lastDamage:0,
      this.slots.naturalWidth,this.statusArt.naturalWidth].join('|');
    if(signature===this.liveSignature)return;
    this.liveSignature=signature;
  }else this.liveSignature=null;
  c.clearRect(0,0,1280,720);
 if(s.arenaMap){this.drawArenaMap(s);return;}
 if(!this.vignette){
  this.vignette=c.createRadialGradient(640,330,220,640,350,760);
  this.vignette.addColorStop(0,'rgba(5,8,4,0)');this.vignette.addColorStop(1,'rgba(5,8,4,.27)');
 }
 c.fillStyle=this.vignette;c.fillRect(0,0,1280,720);
 if(s.victoryFlash){
   const wash=c.createLinearGradient(0,0,0,720);
   const peak=Math.pow(s.victoryFlash,.74);
   wash.addColorStop(0,'rgba(237,236,228,'+.93*peak+')');
   wash.addColorStop(.55,'rgba(246,245,235,'+.97*peak+')');
   wash.addColorStop(1,'rgba(249,248,241,'+.98*peak+')');
   c.fillStyle=wash;c.fillRect(0,0,1280,720);
 }
 const bar=(x,y,w,h,f,col,trail=f)=>{c.fillStyle='#12120dd0';c.fillRect(x,y,w,h);c.strokeStyle='#9b957875';c.strokeRect(x-.5,y-.5,w+1,h+1);if(trail>f){c.fillStyle='#b4a14b';c.fillRect(x,y,w*Math.min(1,trail),h);}const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,col);g.addColorStop(1,'#24251c');c.fillStyle=g;c.fillRect(x,y,w*Math.max(0,Math.min(1,f)),h);c.fillStyle='#d7d4b355';c.fillRect(x,y,w*Math.max(0,Math.min(1,f)),1);};
 const badge=(row,index,x,y,w,h=w)=>c.drawImage(this.statusArt,index*64,row*64,64,64,x,y,w,h);
 if(this.statusArt.naturalWidth)badge(0,14,31,17,59);
 bar(104,32,175,7,s.hp/s.maxHp,'#a14e48',this.hpTrail/s.maxHp);bar(104,44,140,7,s.fp/100,'#507e91');bar(104,56,225,7,s.stamina/100,'#6c8a53');
 if(this.statusArt.naturalWidth){
   if(!this.statusStrip){
     // These fourteen atlas icons never change. Keep the original 1.5x
     // subpixel sampling and composite their small strip in one draw.
     const strip=document.createElement('canvas');strip.width=582;strip.height=42;
     const context=strip.getContext('2d');context.setTransform(1.5,0,0,1.5,0,0);
     for(let i=0;i<14;i++)context.drawImage(this.statusArt,i*64,0,64,64,i*27.7,1,24,25);
     this.statusStrip=strip;
   }
   c.drawImage(this.statusStrip,94,70,388,28);
 }
 // Primary entry heading is WNW. Compass follows the rendered camera.
 const heading=(s.compassYaw||0)-63*Math.PI/180, wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 c.save();c.beginPath();c.rect(510,65,260,36);c.clip();
 c.strokeStyle='#b5b29a66';c.beginPath();c.moveTo(515,91);c.lineTo(765,91);c.stroke();
 for(let i=0;i<16;i++){const delta=wrap(i*Math.PI/8-heading),x=640+delta*85;
  if(Math.abs(delta)>1.53)continue;c.beginPath();c.moveTo(x,87);c.lineTo(x,i%4?95:97);c.stroke();
  if(i%4===0)this.text(['N','E','S','W'][i/4],x,82,13,'#b6b29b','center');
 }
 c.strokeStyle='#c9c5ab';c.beginPath();c.moveTo(640,86);c.lineTo(645,91);c.lineTo(640,96);c.lineTo(635,91);c.closePath();c.stroke();c.restore();
 this.quickslots(s);
 if(s.bossVisible){this.text(s.phase===2?'Radahn, Consort of Miquella':'Promised Consort Radahn',310,572,15);bar(310,580,665,8,s.bossHp/s.bossMax,'#8e171c',this.bossTrail/s.bossMax);if(s.lastDamage&&s.time-s.damageTime<2.4)this.text(String(s.lastDamage),972,571,14,'#d9d1b2','right');}
 c.fillStyle='#171812ae';c.fillRect(1115,678,132,25);c.strokeStyle='#a9a28a';c.strokeRect(1115,678,132,25);this.text('â—‰',1125,696,17);const runeProgress=s.runeRewardAt==null?1:Math.min(1,Math.max(0,(s.time-s.runeRewardAt)/1.2));this.text(Math.round((s.runes??1440000)-(s.runeRewardValue||0)*(1-runeProgress)),1236,696,15,'#dad6c5','right');if(s.runeRewardAt!=null&&s.time-s.runeRewardAt<1.8)this.text('+'+s.runeRewardValue,1236,666,15,'#dad6c5','right');
 if(s.locked&&s.lockScreen){c.fillStyle='#f1f0ff';c.shadowColor='#c4bcff';c.shadowBlur=9;c.beginPath();c.arc(s.lockScreen.x,s.lockScreen.y,3,0,7);c.fill();c.shadowBlur=0;}
 if(s.prompt){const g=c.createLinearGradient(400,0,880,0);g.addColorStop(0,'#10110a00');g.addColorStop(.15,'#10110acc');g.addColorStop(.85,'#10110acc');g.addColorStop(1,'#10110a00');c.fillStyle=g;c.fillRect(400,592,480,36);this.text(s.prompt,640,616,17,'#ded8bd','center');}
 if(s.bleed>1){bar(520,480,240,5,s.bleed/100,'#a02739');this.text('Blood loss',520,474,12,'#c5b8ab');}
 if(s.marked){c.strokeStyle='#e9c971';c.lineWidth=2;c.beginPath();c.ellipse(355,46,7,11,0,0,6.28);c.stroke();}
 if(s.menu&&!s.victoryFlash)this.menu(s);
 if(s.fade>0){c.fillStyle=`rgba(0,0,0,${s.fade})`;c.fillRect(0,0,1280,720);}
 if(s.stage==='loading'){
   const bg=c.createLinearGradient(0,0,0,720);bg.addColorStop(0,'#252a23');bg.addColorStop(1,'#0b100d');c.fillStyle=bg;c.fillRect(0,0,1280,720);
   c.fillStyle='#555344';for(let i=0;i<24;i++){const x=110+i*43,h=90+(i*37%250);c.fillRect(x,480-h,18,h);c.fillRect(x-7,475-h,32,8);}
   c.fillStyle='#111711';c.beginPath();c.moveTo(0,520);for(let x=0;x<=1280;x+=20)c.lineTo(x,500+Math.sin(x*.013)*45+Math.sin(x*.04)*16);c.lineTo(1280,720);c.lineTo(0,720);c.fill();
   this.text('ENIR-ILIM',100,594,27,'#c7bfa1');this.text('The path to the divine gate',100,632,16,'#92917f');c.fillStyle='#494c3c';c.fillRect(100,673,1080,2);c.fillStyle='#bcb28b';c.fillRect(100,673,1080*Math.min(1,s.stageTime/3.5),2);
 }
 if(s.locationTitle>0)this.text('Enir-Ilim',640,340,36,'#e2dfd0','center');
 if(s.banner){const g=c.createLinearGradient(0,290,0,430);g.addColorStop(0,'#0b090600');g.addColorStop(.5,'#0b0906c0');g.addColorStop(1,'#0b090600');c.fillStyle=g;c.fillRect(0,290,1280,140);this.text(s.banner,640,385,s.banner==='GOD SLAIN'?53:48,s.banner==='YOU DIED'?'#812c27':'#d9ca6b','center');}
 if(s.reward){c.fillStyle='#242218bd';c.fillRect(900,548,380,43);this.text('Remembrance of a God and a Lord     x1',914,575,14);this.icon('talisman',1192,551,32);}
 if(s.victoryFlash){
   // The arena brightens first. The status bars and quick slots wash out
   // several seconds later, before the view returns to the terrace.
   const t=Math.min(1,Math.max(0,(s.stageTime-3.05)/5.65));
   const opacity=s.victoryFlash*t*t*(3-2*t);
   c.fillStyle=`rgba(232,232,233,${opacity})`;
   c.fillRect(0,0,1280,720);
   if(s.menu)this.menu(s);
 }
 if(s.help&&s.inputDevice!=='recording'){this.liveHelp(s);return;}
 if(s.help){
   c.fillStyle='#14150deb';c.fillRect(290,154,700,386);
   this.text('CONTROLS',640,197,24,'#e1d7ad','center');
   const rows=['WASD   Move     â€¢     IJKL   Free camera','E   Dodge / hold to sprint     â€¢     Space   Jump','X   Attack / selected seal cast     â€¢     V   Heavy attack','C   Parry     â€¢     Z   Guard     â€¢     G   Lock on','Q   Use item     â€¢     R   Interact / two hand     â€¢     F   Crouch','Arrows   Equipment / item selection','Enter   Menu / skip     â€¢     Backspace   Back','M   Sound on / off     â€¢     H   Close this guide'];
   rows.forEach((t,i)=>this.text(t,640,235+i*36,17,'#d8d4bd','center'));
 }
 }
 replayEnding(seconds,sceneCanvas){
  if(seconds<164.58)return;
  const c=this.ctx;
  c.save();
  const gradient=(x,y,x2,y2,stops)=>{
    const g=c.createLinearGradient(x,y,x2,y2);
    stops.forEach(([n,color])=>g.addColorStop(n,color));return g;
  };
  if(seconds<166.68){
   if(seconds>165.78){
    c.fillStyle=gradient(0,0,435,0,[[0,'#181a12ef'],[1,'#17170b00']]);c.fillRect(0,70,435,567);
    ['Equipment','Item Crafting','Inventory','Status','Messages','Multiplayer','System'].forEach((label,i)=>{
     this.icon(['lance','flask','talisman','seal','dagger','talisman','seal'][i],31,112+52*i,38);
     this.text(label,81,140+i*52,17,'#d9d5bc');
    });
   }
   c.fillStyle=gradient(402,0,876,0,[[0,'#18191100'],[.09,'#202017ed'],[.91,'#332c18ed'],[1,'#23221300']]);
   c.fillRect(402,404,474,174);this.text('NEW',640,426,12,'#c0b697','center');
   this.text('Circlet of Light',640,452,20,'#e6e1c9','center');
   c.strokeStyle='#c2ac67';c.lineWidth=3;
   c.beginPath();c.ellipse(640,507,28,8,-.06,0,Math.PI*2);c.stroke();
   for(let i=0;i<9;i++){const x=616+i*6;c.beginPath();c.moveTo(x,501);c.lineTo(x-4,494-3*Math.cos(i*2));c.stroke();}
  }else if(seconds<167.62){
   c.fillStyle='#181911ed';c.fillRect(0,0,1280,720);
   this.text('System',52,46,23);this.text('Quit Game',243,94,18);
   c.strokeStyle='#a69f7d66';c.strokeRect(240,150,790,407);c.fillStyle='#0709068a';c.fillRect(240,150,790,407);
   this.text('Level       1',322,328,16);this.text('Enir-Ilim',322,368,17);
   c.fillStyle='#343322';c.fillRect(640,239,344,167);
   c.save();c.globalAlpha=.61;c.filter='grayscale(.8) brightness(.72)';c.drawImage(sceneCanvas,640,239,344,167);c.restore();
   for(const [x,label] of [[388,'Quit Game'],[682,'Return to Desktop']]){
    c.strokeStyle=x===388?'#ded2ad':'#847e69';c.strokeRect(x,478,205,30);this.text(label,x+102,500,17,'#d6d3bc','center');
   }
   this.text('Save the game and return to title menu',246,673,15);
  }else if(seconds<168.83){
   c.fillStyle='#121411';c.fillRect(0,0,1280,720);
   c.save();c.filter='grayscale(.88) brightness(.26) contrast(1.22)';c.drawImage(sceneCanvas,-80,-119,1770,994);c.restore();
   c.fillStyle=gradient(0,0,1150,0,[[0,'#10120ff2'],[.52,'#10120f8a'],[1,'#10120f00']]);c.fillRect(0,0,1280,720);
   this.text('Summoning other players',77,481,22,'#c3bfa9');
   this.text('Use a Furlcalling Finger Remedy to reveal summon signs left by other players.',77,523,16,'#a9aa9b');
  }else{
   c.fillStyle='#010100';c.fillRect(0,0,1280,720);
   c.globalAlpha=Math.max(0,Math.min(.67,(seconds-168.83)*.93));this.text('ELDEN RING',640,294,94,'#988557','center');
  }
  c.restore();
 }
 menu(s){
 if(s.inputDevice!=='recording'){this.liveEquipment(s);return;}
 const c=this.ctx,item=equipmentInfo(s);c.fillStyle='#1c1d15d9';c.fillRect(0,0,1280,720);this.text('Equipment',40,46,25);
 c.strokeStyle='#b9b08c66';c.beginPath();c.moveTo(40,65);c.lineTo(1240,65);c.stroke();
 this.text(item?.slot||(s.menuPage?'Talismans':'Equipment Slots'),42,94,17);
 for(let y=0;y<5;y++)for(let x=0;x<5;x++)this.icon(y===0&&x===1?'lance':y===0&&x===0?'seal':'talisman',42+x*79,120+y*85,66,s.menuSelection===y*5+x);
 if(item){
  this.text(item.name,610,100,23);this.icon(item.icon,854,118,96);
  if(item.type)this.text(item.type,615,140,16);
  if(item.attackType)this.text(item.attackType,615,163,16);
  if(item.skill)this.text(item.skill,615,207,16);
  this.text('Weight',615,258);this.text(item.weight,918,258);
  if(item.effect){
   this.text('Item Effect',615,302);
   const lines=item.effect.length>50?['Greatly raises attributes,', 'but also increases damage taken']:[item.effect];
   lines.forEach((line,i)=>this.text(line,615,334+i*23,15));
  }
  if(item.negation){this.text('Damage Negation',615,302);item.negation.forEach(([name,value],i)=>{this.text(name,615,334+i*24,15);this.text(value,918,334+i*24,15);});}
 }
 this.text('Character Status',1022,94,18);
 ['Level                 1','Runes Held      1440000','','Vigor                10','Mind                 10','Endurance            10','Strength             10','Dexterity            10','Intelligence         10','Faith                10','Arcane               10','','HP                 '+Math.round(s.hp),'FP                  78','Stamina            120','Equip Load       29.8 / 61.0','Poise               33','Discovery          110.0'].forEach((v,i)=>this.text(v,1022,130+i*24,15));
 this.text(s.inputDevice==='recording'?'Space: Confirm     E: Back     X: Switch slot     Arrows: Select     Enter: Close':controlLabel(s.inputDevice,'E / Enter: Confirm     Q: Back     X: Switch slot     Arrows: Select     Esc: Close','A: Confirm     B: Back     X: Switch slot     D-pad: Select     Menu: Close','Cross: Confirm     Circle: Back     Square: Switch slot     D-pad: Select     Options: Close'),40,690,16);
 }
 liveEquipment(s){
  const c=this.ctx,index=s.menuSelection,item=liveEquipmentInfo(s,index);
  c.save();c.fillStyle='#181b15f5';c.fillRect(0,0,1280,720);
  this.text('Equipment',42,56,30);
  this.text(s.menuPage?`Talisman · Slot ${s.equipSlot+1}`:'Equipment slots',42,99,18);
  const count=s.menuPage?talismans.length:25;
  for(let i=0;i<count;i++){
   const x=42+(i%5)*79,y=120+Math.floor(i/5)*85,entry=liveEquipmentInfo(s,i);
   if(entry)this.icon(entry.icon,x,y,66,index===i);
   else{
    c.fillStyle='#23251f';c.fillRect(x,y,66,66);
    c.strokeStyle=index===i?'#dbc88c':'#575849';c.lineWidth=index===i?3:1;c.strokeRect(x,y,66,66);
   }
  }
  const isTalisman=index===15||index===16;
  this.text(item?.name||(isTalisman?'Empty talisman slot':'Empty'),520,148,28);
  const location=s.menuPage?`Talisman slot ${s.equipSlot+1}`:isTalisman?`Talisman slot ${index-14}`:item?.slot;
  if(location)this.text(location,520,188,18);
  if(!s.equipmentCompact&&item){
   const details=[item.type,item.attackType,item.skill&&`Skill · ${item.skill}`,item.effect,`Weight · ${item.weight}`].filter(Boolean);
   details.forEach((line,i)=>this.text(line,520,238+i*32,17));
   if(s.menuPage){
    const worn=s.talismans.indexOf(item.name);
    if(worn!==-1)this.text(`Equipped in slot ${worn+1}`,520,415,17,'#ddc383');
   }
  }
  this.text(controlLabel(s.inputDevice,'Arrows · Select     E / Enter · Confirm     Q · Back     Esc · Close','D-pad · Select     A · Confirm     B · Back     Menu · Close','D-pad · Select     Cross · Confirm     Circle · Back     Options · Close'),42,645,16);
  this.text(controlLabel(s.inputDevice,'Z / X · Talisman slot     R · Remove     Y · Details     C / V · First / last','LB / RB · Talisman slot     X · Remove','L1 / R1 · Talisman slot     Square · Remove'),42,675,16);
  c.restore();
 }
 drawArenaMap(s){
  const c=this.ctx;
  c.save();c.fillStyle='#1c201bf7';c.fillRect(0,0,1280,720);
  this.text('Enir-Ilim',70,82,36);this.text('Arena approach',72,120,17,'#b4ad93');
  c.fillStyle='#3d3c2f';c.strokeStyle='#a99b70';c.lineWidth=2;
  c.beginPath();c.ellipse(640,323,226,163,0,0,2*Math.PI);c.fill();c.stroke();
  c.strokeStyle='#8f8461';c.beginPath();c.moveTo(620,485);c.lineTo(620,602);c.moveTo(660,485);c.lineTo(660,602);c.stroke();
  c.strokeStyle='#e4c97a';c.lineWidth=4;c.beginPath();c.moveTo(618,484);c.lineTo(662,484);c.stroke();
  this.text('Arena',640,323,24,'#dfd6b5','center');
  this.text('Fog gate',701,491,17);this.text('Approach',701,586,17);
  if(Number.isFinite(s.mapPlayer?.x)&&Number.isFinite(s.mapPlayer?.z)){
   const {x,z}=s.mapPlayer,markerX=640+x*4,markerY=484+(z-2)*(z<2?3:5);
   c.fillStyle='#eee2b8';c.beginPath();c.arc(markerX,markerY,6,0,2*Math.PI);c.fill();
   this.text('You',markerX-13,markerY+5,16,'#eee2b8','right');
  }
  this.text(controlLabel(s.inputDevice,'Esc · Close','B · Close','Circle · Close'),72,665,17);c.restore();
 }
 liveHelp(s){
  const c=this.ctx,keyboard=s.inputDevice==='keyboard',current=s.currentLayout===true;
  const modifier=current?'Ctrl':'Shift',dodge=current?'Left Shift':'Space';
  const rows=controlLabel(s.inputDevice,[
   ['Move / look / walk',`WASD / mouse / ${current?'X':'left Alt'}`],
   ['Backstep / roll / sprint',`Tap ${dodge} still / with a direction; hold while moving to sprint`],
   ['Jump / crouch / lock target',`${current?'Space / G':'F / X'} / Q or middle click`],
   ['Attack or cast / heavy','Left click / '+modifier+' + left click'],
   ['Guard / weapon skill','Right click / '+modifier+' + right click'+(current?' or F':'')],
   ['Interact / use quick item','Tap E / R'],
   ['Two-hand right / left weapon','Hold E + left click / right click'],
   ['Pouch','Hold E + arrow key'],
   ['Spell / item / left / right armament','↑ / ↓ / ← / →     |     '+modifier+' + wheel changes armaments'],
   ['Equipment or skip / local map',`Esc / ${current?'M':'G'}`],
   ['Layout / graphics / sound / guide','F7 / F8 / F9 / H']
  ],[
   ['Move / look / lock','Left stick / right stick / click right stick'],
   ['Backstep / roll / sprint','Tap B still / with a direction; hold B while moving to sprint'],
   ['Jump / crouch / use item','A / click left stick / X'],
   ['Attack or cast / heavy','RB / RT'],['Guard / weapon skill','LB / LT'],
   ['Interact / pouch','Tap Y / hold Y + D-pad'],
   ['Two-hand right / left weapon','Hold Y + right shoulder or trigger / left shoulder or trigger'],
   ['Equipment / skip / local map','Menu / Menu / View'],['Cycle equipment','D-pad']
  ],[
   ['Move / look / lock','Left stick / right stick / R3'],
   ['Backstep / roll / sprint','Tap Circle still / with a direction; hold Circle while moving to sprint'],
   ['Jump / crouch / use item','Cross / L3 / Square'],
   ['Attack or cast / heavy','R1 / R2'],['Guard / weapon skill','L1 / L2'],
   ['Interact / pouch','Tap Triangle / hold Triangle + D-pad'],
   ['Two-hand right / left weapon','Hold Triangle + R1 or R2 / L1 or L2'],
   ['Equipment / skip / local map','Options / Options / touchpad'],['Cycle equipment','D-pad']
  ]);
  c.save();c.fillStyle='#141710f2';c.fillRect(130,74,1020,565);
  this.text(keyboard?`Controls · ${current?'Current Windows':'Classic PC'}`:controlLabel(s.inputDevice,'Controls','Xbox controls','PlayStation controls'),170,126,27,'#e1d7ad');
  rows.forEach(([action,binding],i)=>{
   const y=177+i*38;this.text(action,170,y,18,'#d9d3bd');this.text(binding,521,y,17,'#e1d7ad');
  });
  this.text(controlLabel(s.inputDevice,'H / Esc · Close','Menu · Close','Options · Close'),170,614,16);c.restore();
 }
}
