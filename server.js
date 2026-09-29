import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { handleIncoming } from "./src/bot.js";
import { claimMessage, closeStore, initStore, updateSession } from "./src/store.js";
import { markAsRead, sendText } from "./src/whatsapp.js";

const app=express();
const PORT=Number(process.env.PORT || 10000);
const VERIFY_TOKEN=process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET=process.env.META_APP_SECRET;

app.use(express.json({limit:"1mb",verify:(req,_res,buf)=>{ req.rawBody=Buffer.from(buf); }}));

function safeCompare(a,b){ if(!a || !b) return false; const ab=Buffer.from(a); const bb=Buffer.from(b); return ab.length===bb.length && crypto.timingSafeEqual(ab,bb); }
function verifyMetaSignature(req){
  if(!APP_SECRET) return true;
  const signature=req.get("x-hub-signature-256"); if(!signature || !req.rawBody) return false;
  const expected="sha256="+crypto.createHmac("sha256",APP_SECRET).update(req.rawBody).digest("hex");
  return safeCompare(signature,expected);
}

function extractIncoming(body){
  const items=[];
  for(const entry of body?.entry || []) for(const change of entry?.changes || []){
    const value=change?.value; const messages=value?.messages || []; const contacts=value?.contacts || [];
    for(const message of messages){
      const contact=contacts.find((item)=>item.wa_id===message.from) || contacts[0];
      items.push({message,from:message.from,profileName:contact?.profile?.name || null,metadata:value?.metadata || null});
    }
  }
  return items;
}

app.get("/",(_req,res)=>res.status(200).json({ok:true,service:"Skill Forge Academy WhatsApp Bot",webhook:"/webhook",health:"/health"}));
app.get("/health",(_req,res)=>res.status(200).json({ok:true,uptime:Math.round(process.uptime())}));

app.get("/webhook",(req,res)=>{
  const mode=req.query["hub.mode"], token=req.query["hub.verify_token"], challenge=req.query["hub.challenge"];
  if(!VERIFY_TOKEN){ console.error("WHATSAPP_VERIFY_TOKEN is not configured."); return res.sendStatus(500); }
  if(mode==="subscribe" && token===VERIFY_TOKEN){ console.log("WhatsApp webhook verified."); return res.status(200).send(challenge); }
  return res.sendStatus(403);
});

app.post("/webhook",(req,res)=>{
  if(!verifyMetaSignature(req)){ console.warn("Rejected webhook with invalid Meta signature."); return res.sendStatus(401); }
  const incoming=extractIncoming(req.body);
  res.sendStatus(200);
  if(!incoming.length) return;

  Promise.allSettled(incoming.map(async({message,from,profileName})=>{
    const claimed=await claimMessage(message.id,{phone:from,type:message.type}); if(!claimed) return;
    await updateSession(from,{name:profileName || undefined,lastSeenAt:new Date()});
    await markAsRead(message.id);
    try{ await handleIncoming({from,profileName,message}); }
    catch(error){
      console.error("Bot processing failed:",error);
      try{ await sendText(from,"Something went wrong while processing that message. Please type *MENU* to try again, or type *HUMAN* to request a representative."); }
      catch(sendError){ console.error("Fallback reply also failed:",sendError.message); }
    }
  })).catch((error)=>console.error("Webhook batch failed:",error));
});

await initStore();
const server=app.listen(PORT,"0.0.0.0",()=>{
  console.log(`Skill Forge WhatsApp bot listening on 0.0.0.0:${PORT}`);
  if(!process.env.WHATSAPP_ACCESS_TOKEN) console.warn("Missing WHATSAPP_ACCESS_TOKEN.");
  if(!process.env.WHATSAPP_PHONE_NUMBER_ID) console.warn("Missing WHATSAPP_PHONE_NUMBER_ID.");
  if(!process.env.WHATSAPP_VERIFY_TOKEN) console.warn("Missing WHATSAPP_VERIFY_TOKEN.");
  if(!process.env.META_APP_SECRET) console.warn("META_APP_SECRET is not set. Webhook POST signature verification is disabled.");
});

async function shutdown(signal){
  console.log(`${signal} received. Shutting down...`);
  server.close(async()=>{ await closeStore().catch(()=>{}); process.exit(0); });
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
