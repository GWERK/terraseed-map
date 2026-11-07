export const BIOMES={
 ocean:{color:"#286b91"},lake:{color:"#4b9ca5"},river:{color:"#4b9ca5"},
 forest:{color:"#315b39"},plain:{color:"#a6b96b"},mountain:{color:"#858477"},
 hill:{color:"#b7a06d"},swamp:{color:"#536d4b"},tundra:{color:"#c2d3d1"},desert:{color:"#d5bd83"}
};
export function biomeColor(name){return BIOMES[name]?.color||BIOMES.ocean.color;}
