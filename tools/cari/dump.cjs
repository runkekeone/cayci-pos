const fs=require("fs");
const src=fs.readFileSync("public/toptanci/app.js","utf8");
const url=src.match(/SB_URL\s*=\s*"([^"]+)"/)[1], key=src.match(/SB_KEY\s*=\s*"([^"]+)"/)[1];
(async()=>{
  const r=await fetch(url+"/rest/v1/kv?key=eq."+encodeURIComponent("babuco:store")+"&select=value,updated_at",{headers:{apikey:key,Authorization:"Bearer "+key}});
  const j=await r.json();
  fs.writeFileSync(process.argv[2],JSON.stringify(j[0].value));
  console.log("ok",j[0].updated_at,j[0].value.sales.length);
})();
