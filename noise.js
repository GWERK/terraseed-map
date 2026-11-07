import { hash2 } from "./seed.js";
const smooth = t => t*t*(3-2*t);
export function valueNoise(x, y, seed) {
  const ix=Math.floor(x), iy=Math.floor(y), fx=smooth(x-ix), fy=smooth(y-iy);
  const a=hash2(ix,iy,seed), b=hash2(ix+1,iy,seed), c=hash2(ix,iy+1,seed), d=hash2(ix+1,iy+1,seed);
  const u=a+(b-a)*fx, v=c+(d-c)*fx;
  return (u+(v-u)*fy)*2-1;
}
export function fbm(x,y,seed,octaves=5,lacunarity=2.03,gain=.5) {
  let sum=0, amp=.5, norm=0, freq=1;
  for(let i=0;i<octaves;i++){sum+=valueNoise(x*freq,y*freq,seed+i*1013)*amp;norm+=amp;amp*=gain;freq*=lacunarity;}
  return sum/norm;
}
