import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  getSession,
  updateSession,
  getConversation,
  getConversationMessages,
  setConversationState
} from "../src/store.js";

class MemoryKV {
  constructor(){ this.map=new Map(); }
  async get(key,options){
    if(!this.map.has(key)) return null;
    const value=this.map.get(key);
    if(options?.type==="json") return JSON.parse(value);
    return value;
  }
  async put(key,value){ this.map.set(key,String(value)); }
  async list({prefix="",limit=1000}={}){
    const keys=[...this.map.keys()]
      .filter((key)=>key.startsWith(prefix))
      .sort()
      .slice(0,limit)
      .map((name)=>({name}));
    return {keys,list_complete:true};
  }
}

const env={
  BOT_STATE:new MemoryKV(),
  ADMIN_USERS:JSON.stringify({precious:"test-password",admin2:"second-password"}),
  ADMIN_SESSION_SECRET:"test-session-secret-that-is-long-enough",
  HUMAN_HANDOFF_HOURS:"12",
  WHATSAPP_ACCESS_TOKEN:"test-whatsapp-token",
  WHATSAPP_PHONE_NUMBER_ID:"123456789",
  META_GRAPH_VERSION:"v25.0"
};

async function call(path,{method="GET",body,token}={}){
  const headers={};
  if(body!==undefined) headers["content-type"]="application/json";
  if(token) headers.authorization="Bearer "+token;

  return worker.fetch(
    new Request("https://skillforge-test.workers.dev"+path,{
      method,
      headers,
      body:body===undefined?undefined:JSON.stringify(body)
    }),
    env,
    {waitUntil(){}}
  );
}

const login=await call("/api/admin/login",{
  method:"POST",
  body:{username:"precious",password:"test-password"}
});
assert.equal(login.status,200,"admin login should succeed");
const loginData=await login.json();
assert.ok(loginData.token,"login should return a signed session token");
const token=loginData.token;

const phone="2348000000000";
await updateSession(env,phone,{
  botMode:"bot",
  humanHandoffUntil:null,
  quoteDraft:{step:"budget"},
  supportDraft:{step:"issue"}
});
await setConversationState(env,phone,{
  customerName:"Test Customer",
  status:"open",
  botMode:"bot",
  needsHuman:true,
  assignedAdmin:null,
  unreadCount:3
});

// Assign to me
let response=await call(`/api/admin/conversations/${phone}/assign`,{
  method:"POST",
  body:{},
  token
});
assert.equal(response.status,200,"Assign to me should return 200");
let conversation=(await response.json()).conversation;
assert.equal(conversation.assignedAdmin,"precious","Assign to me should assign the current admin");
assert.equal(conversation.status,"open");

// Take over
response=await call(`/api/admin/conversations/${phone}/takeover`,{
  method:"POST",
  body:{},
  token
});
assert.equal(response.status,200,"Take over should return 200");
conversation=(await response.json()).conversation;
let session=await getSession(env,phone);
assert.equal(conversation.botMode,"human");
assert.equal(conversation.needsHuman,true);
assert.equal(conversation.assignedAdmin,"precious");
assert.equal(session.botMode,"human");
assert.ok(Date.parse(session.humanHandoffUntil)>Date.now(),"Take over should set a future handoff deadline");

// Return to bot
response=await call(`/api/admin/conversations/${phone}/return-to-bot`,{
  method:"POST",
  body:{},
  token
});
assert.equal(response.status,200,"Return to bot should return 200");
conversation=(await response.json()).conversation;
session=await getSession(env,phone);
assert.equal(conversation.botMode,"bot");
assert.equal(conversation.needsHuman,false);
assert.equal(conversation.assignedAdmin,null);
assert.equal(conversation.status,"open");
assert.equal(conversation.unreadCount,0);
assert.equal(session.botMode,"bot");
assert.equal(session.humanHandoffUntil,null);
assert.equal(session.quoteDraft,null);
assert.equal(session.supportDraft,null);

// Admin reply should take over and send from WhatsApp API.
const originalFetch=globalThis.fetch;
const sentPayloads=[];
globalThis.fetch=async (url,options)=>{
  sentPayloads.push({url:String(url),body:JSON.parse(options.body)});
  return new Response(JSON.stringify({messages:[{id:"wamid.test"}]}),{
    status:200,
    headers:{"content-type":"application/json"}
  });
};

try{
  response=await call(`/api/admin/conversations/${phone}/reply`,{
    method:"POST",
    body:{text:"Hello from Skill Forge support"},
    token
  });
  assert.equal(response.status,200,"Admin reply should return 200");
  assert.equal(sentPayloads.length,1,"Admin reply should call WhatsApp exactly once");
  assert.equal(sentPayloads[0].body.to,phone);
  assert.equal(sentPayloads[0].body.text.body,"Hello from Skill Forge support");

  conversation=await getConversation(env,phone);
  session=await getSession(env,phone);
  assert.equal(conversation.botMode,"human");
  assert.equal(conversation.assignedAdmin,"precious");
  assert.equal(session.botMode,"human");

  const messages=await getConversationMessages(env,phone,{limit:50});
  assert.ok(
    messages.some((message)=>
      message.source==="admin"
      && message.adminName==="precious"
      && message.text==="Hello from Skill Forge support"
    ),
    "Admin reply should be saved in conversation history"
  );
} finally {
  globalThis.fetch=originalFetch;
}

// Close
response=await call(`/api/admin/conversations/${phone}/close`,{
  method:"POST",
  body:{},
  token
});
assert.equal(response.status,200,"Close should return 200");
conversation=(await response.json()).conversation;
session=await getSession(env,phone);
assert.equal(conversation.status,"closed");
assert.equal(conversation.botMode,"bot");
assert.equal(conversation.needsHuman,false);
assert.equal(conversation.assignedAdmin,"precious");
assert.equal(conversation.unreadCount,0);
assert.equal(session.botMode,"bot");
assert.equal(session.humanHandoffUntil,null);

console.log("Admin action checks passed: Assign to me, Take over, Return to bot, Reply, Close.");
