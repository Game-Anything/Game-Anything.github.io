import * as T from "game/lib/three.module.js";
import {RUSH_SEQUENCE} from "game/src/combat.js";

// Primary 9.5–10.25 / 21–22.5 s: a twisting translucent shell surrounds
// the flying body. This geometry is presentation only; it owns no hitboxes.
export function createGravityVortex(){
 const group=new T.Group();group.name='gravity-rush-vortex';group.visible=false;
 const canvas=document.createElement('canvas');canvas.width=16;canvas.height=64;
 const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,0,64);
 gradient.addColorStop(0,'#ffffff00');gradient.addColorStop(.42,'#ffffff28');
 gradient.addColorStop(.51,'#ffffffdb');gradient.addColorStop(.64,'#ffffff42');gradient.addColorStop(1,'#ffffff00');
 context.fillStyle=gradient;context.fillRect(0,0,16,64);
 const texture=new T.CanvasTexture(canvas),segments=128,ribbons=[];
 for(let branch=0;branch<6;branch++){
  const positions=new Float32Array((segments+1)*6),uv=new Float32Array((segments+1)*4),indices=[];
  for(let i=0;i<=segments;i++){uv.set([i/segments,0,i/segments,1],i*4);if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(indices);
  const material=new T.MeshBasicMaterial({map:texture,color:branch%2?0xf0e0ff:0xc59be9,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending});
  const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;group.add(mesh);ribbons.push(mesh);
 }
 group.userData.ribbons=ribbons;group.userData.segments=segments;
 return group;
}

export function updateGravityVortex(group,pos,yaw,elapsed,grounded,active,opening=false){
 const windup=opening?RUSH_SEQUENCE.openingWindup:grounded?1.7:RUSH_SEQUENCE.windup;
 const contact=opening?RUSH_SEQUENCE.openingContact:RUSH_SEQUENCE.contact;
 const rise=T.MathUtils.smoothstep(elapsed,windup-.30,windup+.08),fade=1-T.MathUtils.smoothstep(elapsed,contact-.02,contact+.16);
 group.visible=active&&rise*fade>.001;if(!group.visible)return;
 group.position.copy(pos);group.position.y+=opening?2.65:2.38;group.scale.setScalar(opening?1.32:1);group.rotation.set(0,yaw,0);
 const segments=group.userData.segments;
 for(let branch=0;branch<group.userData.ribbons.length;branch++){
  const mesh=group.userData.ribbons[branch],a=mesh.geometry.attributes.position;
  for(let i=0;i<=segments;i++){
   const f=i/segments, envelope=Math.sin(f*Math.PI);
   const angle=f*Math.PI*(2.50+.16*branch)+elapsed*14+branch*2.39996;
   const radius=(.48+2.25*envelope**.60)*(1+.05*Math.sin(3*angle+branch));
   const width=(.13+.66*envelope)*(branch%2?.48:1);
   // The brightest ribbons wrap the outer shell. Leave gaps over the red
   // mane and blade silhouettes seen through its centre in the charge.
   for(let edge=0;edge<2;edge++){
     const r=radius+(edge-.5)*width, z=(f-.5)*5.1;
     a.setXYZ(i*2+edge,Math.sin(angle)*r+.16*z,Math.cos(angle)*r+.12*z,z+(edge-.5)*width*.72);
   }
  }
  a.needsUpdate=true;mesh.material.opacity=rise*fade*(branch%2?.72:.52);
 }
}
