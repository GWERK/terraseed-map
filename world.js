import { hashSeed, mulberry32 } from "./seed.js";
import { fbm, valueNoise } from "./noise.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export function createWorld(seedText) {
  const seed=hashSeed(seedText), rng=mulberry32(seed);
  // Area is log-normal around 1e12 m². Large deviations become progressively rarer.
  const z=(rng()+rng()+rng()+rng()-2)*1.7;
  const area=clamp(1e12*Math.exp(z*.38),2.5e11,1.55e12);
  const aspect=Math.exp((rng()+rng()+rng()-1.5)*.48);
  const width=Math.round(Math.sqrt(area*aspect));
  const height=Math.round(area/width);
  const world={seedText:String(seedText),seed,width,height,area:width*height, continents:[],lakes:[],revision:0};
  const count=3+Math.floor(rng()*4);
  for(let i=0;i<count;i++){
    const cx=.12+rng()*.76, cy=.12+rng()*.76;
    const rx=.10+rng()*.20, ry=.10+rng()*.22;
    world.continents.push({cx,cy,rx,ry,angle:rng()*Math.PI,weight:.82+rng()*.35});
  }
  const lakeCount=18+Math.floor(rng()*32);
  for(let i=0;i<lakeCount;i++) world.lakes.push({x:rng(),y:rng(),r:.0015+rng()*.006,seed:i*977});
  world.riverSeeds=Array.from({length:12},(_,i)=>({x:rng(),y:rng(),phase:rng()*10,scale:.012+rng()*.035,id:i}));
  return world;
}

function landPotential(nx,ny,w) {
  let land=-1.4;
  for(const c of w.continents){
    const dx=nx-c.cx,dy=ny-c.cy,ca=Math.cos(c.angle),sa=Math.sin(c.angle);
    const rx=(dx*ca-dy*sa)/c.rx, ry=(dx*sa+dy*ca)/c.ry;
    const d=Math.sqrt(rx*rx+ry*ry);
    land=Math.max(land,(1-d)*1.55*c.weight);
  }
  const macro=fbm(nx*5.2,ny*5.2,w.seed+11,4)*.22;
  const edge=fbm(nx*17,ny*17,w.seed+29,3)*.09;
  return land+macro+edge;
}

export function sampleTerrain(world,x,y) {
  const nx=x/world.width, ny=y/world.height;
  if(nx<0||ny<0||nx>1||ny>1) return {biome:"ocean",elevation:-1,moisture:0,temp:.5};
  const land=landPotential(nx,ny,world);
  const warpX=fbm(nx*9+8,ny*9,world.seed+51,3)*.018;
  const warpY=fbm(nx*9,ny*9+4,world.seed+71,3)*.018;
  const n=fbm((nx+warpX)*34,(ny+warpY)*34,world.seed+101,6);
  const detail=fbm(nx*150,ny*150,world.seed+151,3)*.07;
  let elevation=land*.85+n*.34+detail;
  const moisture=(fbm(nx*13+21,ny*13,world.seed+211,5)+1)/2;
  const temperature=clamp(.72-Math.abs(ny-.5)*1.25+fbm(nx*4,ny*4,world.seed+251,3)*.17,0,1);
  let lake=false;
  for(const l of world.lakes){
    const dx=(nx-l.x),dy=(ny-l.y);
    if(dx*dx+dy*dy<l.r*l.r && land>.05){lake=true;break;}
  }
  // Meandering drainage lines, deterministic and cheap to evaluate.
  let river=false;
  if(land>.03){
    for(const r of world.riverSeeds){
      const dx=nx-r.x;
      const center=r.y+Math.sin(dx*22+r.phase)*r.scale*.32+fbm(nx*22+r.id,ny*5,world.seed+r.id*71,2)*r.scale*.18;
      if(Math.abs(ny-center)<.00075+r.scale*.012 && Math.abs(dx)<.20){river=true;break;}
    }
  }
  let biome="ocean";
  if(land<-.12) biome="ocean";
  else if(lake||river) biome=lake?"lake":"river";
  else if(elevation>0.72) biome="mountain";
  else if(elevation>0.42) biome="hill";
  else if(temperature<.17) biome="tundra";
  else if(moisture<.19&&temperature>.42) biome="desert";
  else if(moisture>.78&&elevation<.28) biome="swamp";
  else if(moisture>.52&&temperature>.28) biome="forest";
  else biome="plain";
  return {biome,elevation,moisture,temperature,land};
}
