import {sampleTerrain} from "../core/world.js";
import {biomeColor} from "../core/biomes.js";
import {hash2} from "../core/seed.js";

const CHUNK_PIXELS=256;
const TREE_BIOMES=new Set(["forest","swamp","plain","hill"]);
const rgbCache=new Map();
function rgb(hex){if(!rgbCache.has(hex))rgbCache.set(hex,[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]);return rgbCache.get(hex);}
function tree(ctx,x,y,size,kind,shade){
  // Small stylized tree silhouettes: trunk + layered polygonal canopy.
  const h=size*(kind==="forest"?1.0:.72), w=h*.62;
  ctx.fillStyle="#59452d";ctx.fillRect(x-w*.09,y+h*.35,w*.18,h*.48);
  ctx.fillStyle=shade;
  ctx.beginPath();ctx.moveTo(x,y-h*.18);ctx.lineTo(x-w*.52,y+h*.32);ctx.lineTo(x-w*.27,y+h*.27);
  ctx.lineTo(x-w*.42,y+h*.57);ctx.lineTo(x+w*.42,y+h*.57);ctx.lineTo(x+w*.27,y+h*.27);ctx.lineTo(x+w*.52,y+h*.32);ctx.closePath();ctx.fill();
  ctx.fillStyle="#ffffff18";ctx.beginPath();ctx.moveTo(x,y-h*.18);ctx.lineTo(x-w*.27,y+h*.27);ctx.lineTo(x,y+h*.2);ctx.lineTo(x+w*.12,y+h*.55);ctx.lineTo(x+w*.42,y+h*.57);ctx.lineTo(x+w*.27,y+h*.27);ctx.lineTo(x+w*.52,y+h*.32);ctx.closePath();ctx.fill();
}
export class ChunkRenderer{
  constructor(world,store){this.world=world;this.store=store;this.memory=new Map();this.inflight=new Map();}
  setWorld(world){this.world=world;this.memory.clear();this.inflight.clear();}
  key(cx,cy,lod,options={}){return `${this.world.seed}:${this.world.revision}:${lod}:${options.trees!==false?1:0}:${options.biomes!==false?1:0}:${options.coast!==false?1:0}:${cx}:${cy}`;}
  async getChunk(cx,cy,lod,{trees=true,biomes=true}={}){
    const key=this.key(cx,cy,lod,options);
    if(this.memory.has(key))return this.memory.get(key);
    if(this.inflight.has(key))return this.inflight.get(key);
    const task=(async()=>{
      const cached=await this.store.get(key);
      if(cached){const bmp=await createImageBitmap(cached);this.memory.set(key,bmp);return bmp;}
      const bmp=await this.generate(cx,cy,lod,{trees,biomes});
      if(bmp.convertToBlob){const blob=await bmp.convertToBlob({type:"image/webp",quality:.88});this.store.put(key,blob);}
      else if(bmp.toBlob)bmp.toBlob(blob=>blob&&this.store.put(key,blob),"image/webp",.88);
      this.memory.set(key,bmp);return bmp;
    })().finally(()=>this.inflight.delete(key));
    this.inflight.set(key,task);return task;
  }
  async generate(cx,cy,lod,{trees=true,biomes=true,coast=true}={}){
    const canvas=document.createElement("canvas");canvas.width=CHUNK_PIXELS;canvas.height=CHUNK_PIXELS;
    const ctx=canvas.getContext("2d",{alpha:false});
    const image=ctx.createImageData(CHUNK_PIXELS,CHUNK_PIXELS),data=image.data;
    const step=2**lod, originX=cx*CHUNK_PIXELS*step,originY=cy*CHUNK_PIXELS*step;
    const samples=new Array(CHUNK_PIXELS*CHUNK_PIXELS);
    for(let py=0;py<CHUNK_PIXELS;py++){
      for(let px=0;px<CHUNK_PIXELS;px++){
        const s=sampleTerrain(this.world,originX+(px+.5)*step,originY+(py+.5)*step);samples[py*CHUNK_PIXELS+px]=s;
        let color=rgb(biomes?biomeColor(s.biome):s.biome==="ocean"?"#286b91":"#8caa78");
        const shade=Math.max(.78,Math.min(1.18,.96+s.elevation*.13));
        const i=(py*CHUNK_PIXELS+px)*4;
        data[i]=Math.min(255,color[0]*shade);data[i+1]=Math.min(255,color[1]*shade);data[i+2]=Math.min(255,color[2]*shade);data[i+3]=255;
      }
    }
    ctx.putImageData(image,0,0);
    // Coastline edge pass.
    if(coast) for(let y=1;y<255;y++)for(let x=1;x<255;x++){
      const s=samples[y*256+x];if(s.biome==="ocean")continue;
      const near=[samples[y*256+x-1],samples[y*256+x+1],samples[(y-1)*256+x],samples[(y+1)*256+x]];
      if(near.some(n=>n.biome==="ocean")){ctx.fillStyle="#e2d6b3aa";ctx.fillRect(x,y,1,1);}
    }
    if(trees){
      const density=lod===0?0.10:Math.max(0,.07/lod);
      const treeSize=Math.max(2,7/Math.sqrt(step));
      for(let y=2;y<254;y+=Math.max(3,Math.round(5/Math.sqrt(step)))){
        for(let x=2;x<254;x+=Math.max(3,Math.round(5/Math.sqrt(step)))){
          const s=samples[y*256+x],h=hash2(cx*1000+x,cy*1000+y,this.world.seed+91);
          if(TREE_BIOMES.has(s.biome)&&h<density*(s.biome==="forest"?1:s.biome==="plain"?.22:.45)){
            const greens=["#234b30","#2d5937","#3d6840","#31553a"];
            tree(ctx,x,y,treeSize,s.biome,greens[Math.floor(h*10000)%greens.length]);
          }
        }
      }
    }
    if(lod>=3){ctx.fillStyle="#ffffff10";ctx.fillRect(0,0,256,256);}
    return createImageBitmap(canvas);
  }
  get memoryCount(){return this.memory.size;}
  clearMemory(){for(const bmp of this.memory.values())bmp.close?.();this.memory.clear();}
}
export {CHUNK_PIXELS};
