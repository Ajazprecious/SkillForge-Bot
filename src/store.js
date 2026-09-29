import { MongoClient } from "mongodb";

const memorySessions = new Map();
const recentMessageIds = new Map();
let client=null; let db=null;
const now=()=>new Date();

function pruneRecentMessages(){ const cutoff=Date.now()-86400000; for(const [id,time] of recentMessageIds.entries()) if(time<cutoff) recentMessageIds.delete(id); }

export async function initStore(){
  const uri=process.env.MONGODB_URI;
  if(!uri){ console.log("Store: using in-memory mode (MONGODB_URI not set)."); return; }
  client=new MongoClient(uri); await client.connect(); db=client.db(process.env.MONGODB_DB_NAME || "skillforge_whatsapp_bot");
  await Promise.all([
    db.collection("sessions").createIndex({phone:1},{unique:true}),
    db.collection("leads").createIndex({createdAt:-1}),
    db.collection("inbound_messages").createIndex({messageId:1},{unique:true})
  ]);
  console.log("Store: connected to MongoDB.");
}

export async function closeStore(){ if(client) await client.close(); }

export async function claimMessage(messageId,payload={}){
  if(!messageId) return true;
  pruneRecentMessages(); if(recentMessageIds.has(messageId)) return false;
  if(db){ try{ await db.collection("inbound_messages").insertOne({messageId,...payload,createdAt:now()}); } catch(error){ if(error?.code===11000) return false; throw error; } }
  recentMessageIds.set(messageId,Date.now()); return true;
}

export async function getSession(phone){
  if(db){ const saved=await db.collection("sessions").findOne({phone}); if(saved){ const {_id,...session}=saved; return session; } }
  return memorySessions.get(phone) || {phone,optedOut:false,humanHandoffUntil:null,lastIntent:null,name:null};
}

export async function updateSession(phone,patch){
  const current=await getSession(phone); const next={...current,...patch,phone,updatedAt:now()}; memorySessions.set(phone,next);
  if(db) await db.collection("sessions").updateOne({phone},{$set:next,$setOnInsert:{createdAt:now()}},{upsert:true});
  return next;
}

export async function saveLead(lead){
  const record={...lead,createdAt:now()};
  console.log("Human handoff lead:",{phone:lead.phone?`***${lead.phone.slice(-4)}`:"unknown",name:lead.name||"unknown",intent:lead.intent||"human_handoff"});
  if(db) await db.collection("leads").insertOne(record); return record;
}
