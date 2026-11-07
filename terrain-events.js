// Future civilization/simulation integration point.
// Events are data-only and independent from procedural terrain generation.
// The renderer can apply these overlays without changing the base world seed.
export class TerrainEventStore {
  constructor(){this.events=[];this.revision=0;}
  add(event){
    const normalized={id:event.id||crypto.randomUUID(),type:event.type||"surface-change",
      x:Number(event.x),y:Number(event.y),radius:Number(event.radius||100),
      intensity:Number(event.intensity??1),startedAt:event.startedAt||Date.now(),
      duration:event.duration??null,payload:event.payload||{}};
    this.events.push(normalized);this.revision++;return normalized;
  }
  query(bounds){
    return this.events.filter(e=>e.x+e.radius>=bounds.minX&&e.x-e.radius<=bounds.maxX&&e.y+e.radius>=bounds.minY&&e.y-e.radius<=bounds.maxY);
  }
  // Reserved API for future event-to-terrain transformations.
  applyToSample(baseSample,_x,_y,_time=Date.now()){return baseSample;}
  export(){return {revision:this.revision,events:this.events};}
  import(data){this.revision=data?.revision||0;this.events=Array.isArray(data?.events)?data.events:[];}
}
