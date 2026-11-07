import {createWorld} from "./core/world.js";
import {hashSeed} from "./core/seed.js";
import {ChunkRenderer,CHUNK_PIXELS} from "./render/chunk-renderer.js";
import {ChunkStore} from "./storage/chunk-store.js";
import {TerrainEventStore} from "./simulation/terrain-events.js";

const $=id=>document.getElementById(id);
const canvas=$("mapCanvas"),ctx=canvas.getContext("2d");
const viewport=$("mapViewport"),veil=$("loadingVeil");
const store=new ChunkStore(),events=new TerrainEventStore();
let world,renderer,centerX=0,centerY=0,zoom=.00000008,raf=0,drag=null,pinch=null,renderToken=0;

const activePointers=new Map();
const memoryLimit=180;
const settings=()=>({trees:$("treeLayer").checked,biomes:$("biomeLayer").checked,coast:$("coastLayer").checked});
function fmt(n){return new Intl.NumberFormat("ko-KR",{maximumFractionDigits:0}).format(n);}
function updateInfo(){
  $("dimensions").textContent=`${fmt(world.width)} × ${fmt(world.height)} m`;
  $("area").textContent=`${(world.area/1e12).toFixed(3)}조 m²`;
  $("seedHash").textContent=world.seed.toString(16).toUpperCase().padStart(8,"0");
  $("coordinates").textContent=`${fmt(centerX)}, ${fmt(centerY)} m`;
  $("lod").textContent=`${Math.max(0,Math.round(Math.log2(1/zoom)))} (${zoom.toExponential(2)} px/m)`;
}
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2);
  const r=viewport.getBoundingClientRect();

  canvas.width=Math.max(1,Math.floor(r.width*dpr));
  canvas.height=Math.max(1,Math.floor(r.height*dpr));

  ctx.setTransform(dpr,0,0,dpr,0,0);

  if(world){
    const min=minZoom();

    if(zoom<min){
      zoom=min;
      centerX=world.width/2;
      centerY=world.height/2;
    }
  }

  scheduleRender();
}
function worldAt(sx,sy){const r=viewport.getBoundingClientRect();return {x:centerX+(sx-r.width/2)/zoom,y:centerY+(sy-r.height/2)/zoom};}
function screenAt(wx,wy,w,h){const r=viewport.getBoundingClientRect();return {x:r.width/2+(wx-centerX)*zoom,y:r.height/2+(wy-centerY)*zoom};}
function clampCenter(){centerX=Math.max(0,Math.min(world.width,centerX));centerY=Math.max(0,Math.min(world.height,centerY));}
// 세계 전체가 화면에 들어오는 최소 확대율
function minZoom(){
  const r=viewport.getBoundingClientRect();

  return Math.min(
    r.width/world.width,
    r.height/world.height
  );
}
function chooseLod(){return Math.max(0,Math.min(22,Math.round(Math.log2(1/Math.max(zoom,1e-12)))));}
function scheduleRender(){cancelAnimationFrame(raf);raf=requestAnimationFrame(render);}
function drawBackground(w,h){
  ctx.fillStyle="#000000";
  ctx.fillRect(0,0,w,h);
}
async function render(){
  if(!world||!renderer)return;
  const token=++renderToken,r=viewport.getBoundingClientRect(),w=r.width,h=r.height;
  const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);
  drawBackground(w,h);
  const lod=chooseLod(),step=2**lod,chunkWorld=CHUNK_PIXELS*step;
  const left=centerX-w/(2*zoom),top=centerY-h/(2*zoom),right=centerX+w/(2*zoom),bottom=centerY+h/(2*zoom);
  const minCx=Math.floor(left/chunkWorld),maxCx=Math.floor(right/chunkWorld),minCy=Math.floor(top/chunkWorld),maxCy=Math.floor(bottom/chunkWorld);
  const total=(maxCx-minCx+1)*(maxCy-minCy+1);
  $("visibleChunks").textContent=String(total);$("memoryChunks").textContent=String(renderer.memoryCount);
  $("renderStatus").textContent=`${total}개 청크 · LOD ${lod}`;
  if(total>90){$("renderStatus").textContent=`시야를 조금 확대해 주세요 · ${total} 청크`;return;}
  veil.classList.add("visible");
  const jobs=[];
  for(let cy=minCy;cy<=maxCy;cy++)for(let cx=minCx;cx<=maxCx;cx++){
    if(cx<0||cy<0||cx*chunkWorld>=world.width||cy*chunkWorld>=world.height)continue;
    jobs.push({cx,cy});
  }
  // Draw completed chunks as soon as each is ready. Stale renders never paint over a newer view.
  
let done = 0;
let firstError = null;

await Promise.all(jobs.map(async ({cx, cy}) => {
  try {
    const bmp = await renderer.getChunk(
      cx, cy, lod, settings()
    );

    if (token !== renderToken) return;

    const x = cx * chunkWorld;
    const y = cy * chunkWorld;
    const p = screenAt(x, y, w, h);
    const size = chunkWorld * zoom;

    ctx.imageSmoothingEnabled = lod > 0 || zoom < 0.7;
    ctx.drawImage(bmp, p.x, p.y, size, size);

    if ($("gridLayer").checked) {
      ctx.strokeStyle = "#ffffff22";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x, p.y, size, size);
    }

  } catch (err) {
    console.error("chunk render failed", err);

    if (!firstError) {
      firstError = err;
    }
  }

  done++;

  if (token === renderToken) {
    if (firstError) {
      $("renderStatus").textContent =
        "렌더 오류: " +
        (firstError.message || String(firstError));
    } else {
      $("renderStatus").textContent =
        `청크 ${done}/${jobs.length} 로드`;
    }
  }
}));

  if(token===renderToken){
    veil.classList.remove("visible");$("memoryChunks").textContent=String(renderer.memoryCount);
    updateInfo();drawScale(w,h);
    // Bound memory usage; visible chunks are the most recently inserted.
    while(renderer.memory.size>memoryLimit){const first=renderer.memory.keys().next().value;renderer.memory.get(first)?.close?.();renderer.memory.delete(first);}
  }
}
function drawScale(w,h){
  const meters=100/zoom,exp=Math.pow(10,Math.floor(Math.log10(meters))),nice=meters/exp;
  const value=(nice<2?1:nice<5?2:5)*exp;
  $("scaleLabel").textContent=value>=1000?`${fmt(value/1000)} km`:`${fmt(value)} m`;
}
function setZoom(next,anchorX,anchorY){
  const r=viewport.getBoundingClientRect();

  const ax=anchorX??r.width/2;
  const ay=anchorY??r.height/2;

  const before=worldAt(ax,ay);
  const min=minZoom();

  zoom=Math.max(min,Math.min(4,next));

  // 최대 축소 상태에서는 세계를 정중앙에 배치
  if(zoom<=min*(1+1e-9)){
    centerX=world.width/2;
    centerY=world.height/2;
  }else{
    centerX=before.x-(ax-r.width/2)/zoom;
    centerY=before.y-(ay-r.height/2)/zoom;
    clampCenter();
  }

  updateInfo();
  scheduleRender();
}
function newWorld(seed){
  world=createWorld(seed);renderer?.clearMemory();renderer=new ChunkRenderer(world,store);
  zoom=minZoom();
  centerX=world.width/2;
  centerY=world.height/2;
  updateInfo();scheduleRender();
}
$("generateBtn").addEventListener("click",()=>newWorld($("seedInput").value.trim()||"terra"));
$("randomSeed").addEventListener("click",()=>{$("seedInput").value=`terra-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;});
$("zoomIn").addEventListener("click",()=>setZoom(zoom*1.8));
$("zoomOut").addEventListener("click",()=>setZoom(zoom/1.8));
$("homeBtn").addEventListener("click",()=>{
  zoom=minZoom();
  centerX=world.width/2;
  centerY=world.height/2;
  updateInfo();
  scheduleRender();
});
$("refreshBtn").addEventListener("click",()=>{renderer.clearMemory();world.revision++;renderer.setWorld(world);scheduleRender();});
$("clearCache").addEventListener("click",async()=>{await store.clearSeed(`${world.seed}:`);renderer.clearMemory();scheduleRender();});
["biomeLayer","treeLayer","coastLayer","gridLayer"].forEach(id=>$(id).addEventListener("change",()=>{renderer.clearMemory();scheduleRender();}));
viewport.addEventListener("wheel",e=>{e.preventDefault();const rect=viewport.getBoundingClientRect();setZoom(zoom*Math.exp(-e.deltaY*.0012),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
// 핀치 제스처 시작
function beginPinch(){
  const points=[...activePointers.values()].slice(0,2);

  if(points.length<2)return;

  const rect=viewport.getBoundingClientRect();

  const mx=(points[0].x+points[1].x)/2-rect.left;
  const my=(points[0].y+points[1].y)/2-rect.top;

  const anchor=worldAt(mx,my);

  pinch={
    distance:Math.max(1,Math.hypot(
      points[1].x-points[0].x,
      points[1].y-points[0].y
    )),
    zoom:zoom,
    worldX:anchor.x,
    worldY:anchor.y
  };

  drag=null;
  viewport.classList.remove("dragging");
}

// 포인터 시작
viewport.addEventListener("pointerdown",e=>{
  activePointers.set(e.pointerId,{
    x:e.clientX,
    y:e.clientY
  });

  viewport.setPointerCapture(e.pointerId);

  if(activePointers.size===1){
    drag={
      x:e.clientX,
      y:e.clientY,
      cx:centerX,
      cy:centerY
    };

    viewport.classList.add("dragging");
  }else{
    beginPinch();
  }
});

// 포인터 이동
viewport.addEventListener("pointermove",e=>{
  if(!activePointers.has(e.pointerId))return;

  activePointers.set(e.pointerId,{
    x:e.clientX,
    y:e.clientY
  });

  // 두 손가락 이상이면 핀치 확대·축소
  if(activePointers.size>=2){

    if(!pinch)beginPinch();

    const points=[...activePointers.values()].slice(0,2);
    const rect=viewport.getBoundingClientRect();

    const mx=(points[0].x+points[1].x)/2-rect.left;
    const my=(points[0].y+points[1].y)/2-rect.top;

    const distance=Math.max(1,Math.hypot(
      points[1].x-points[0].x,
      points[1].y-points[0].y
    ));

    const min=minZoom();

    zoom=Math.max(
      min,
      Math.min(4,pinch.zoom*distance/pinch.distance)
    );

    // 핀치 중심의 지형 위치 유지
    if(zoom<=min*(1+1e-9)){
      centerX=world.width/2;
      centerY=world.height/2;
    }else{
      centerX=pinch.worldX-(mx-rect.width/2)/zoom;
      centerY=pinch.worldY-(my-rect.height/2)/zoom;
      clampCenter();
    }

    updateInfo();
    scheduleRender();
    return;
  }

  // 한 손가락 또는 마우스 드래그
  if(!drag)return;

  centerX=drag.cx-(e.clientX-drag.x)/zoom;
  centerY=drag.cy-(e.clientY-drag.y)/zoom;

  clampCenter();
  updateInfo();
  scheduleRender();
});

// 포인터 종료
function endPointer(e){
  activePointers.delete(e.pointerId);

  if(activePointers.size>=2){
    beginPinch();
    return;
  }

  pinch=null;

  if(activePointers.size===1){
    const point=[...activePointers.values()][0];

    // 핀치 종료 후 남은 손가락으로 지도 이동 가능
    drag={
      x:point.x,
      y:point.y,
      cx:centerX,
      cy:centerY
    };

    viewport.classList.add("dragging");
  }else{
    drag=null;
    viewport.classList.remove("dragging");
  }
}

viewport.addEventListener("pointerup",endPointer);
viewport.addEventListener("pointercancel",endPointer);
viewport.addEventListener("dblclick",e=>{const rect=viewport.getBoundingClientRect();setZoom(zoom*2.2,e.clientX-rect.left,e.clientY-rect.top);});
new ResizeObserver(resize).observe(viewport);
window.addEventListener("keydown",e=>{if(e.key==="+"||e.key==="=")setZoom(zoom*1.5);if(e.key==="-")setZoom(zoom/1.5);});
window.terraSeedAPI={
  getWorld:()=>world,
  getTerrainAt:(x,y)=>import("./core/world.js").then(m=>m.sampleTerrain(world,x,y)),
  events,
  addTerrainEvent:event=>{const result=events.add(event);renderer.clearMemory();scheduleRender();return result;},
  exportWorld:()=>({seed:world.seedText,width:world.width,height:world.height,events:events.export()}),
  refreshArea:(x,y,radius)=>{renderer.clearMemory();centerX=x;centerY=y;scheduleRender();}
};
newWorld($("seedInput").value);
