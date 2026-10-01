const memorySessions = new Map();
const recentMessageIds = new Map();

function pruneRecentMessages(){
  const cutoff=Date.now()-86400000;
  for(const [id,time] of recentMessageIds.entries()){
    if(time<cutoff) recentMessageIds.delete(id);
  }
}

function sessionKey(phone){ return `session:${phone}`; }
function messageKey(messageId){ return `message:${messageId}`; }
function conversationKey(phone){ return `conversation:${phone}`; }
function conversationMessagePrefix(phone){ return `conversation_message:${phone}:`; }

function makeReference(prefix){
  const time=Date.now().toString(36).toUpperCase();
  const random=crypto.randomUUID().replace(/-/g,"").slice(0,5).toUpperCase();
  return `${prefix}-${time}-${random}`;
}

async function getJson(env,key){
  if(!env?.BOT_STATE) return null;
  return env.BOT_STATE.get(key,{type:"json"});
}

async function putJson(env,key,value,options){
  if(!env?.BOT_STATE) return;
  await env.BOT_STATE.put(key,JSON.stringify(value),options);
}

export async function claimMessage(env,messageId,payload={}){
  if(!messageId) return true;

  pruneRecentMessages();
  if(recentMessageIds.has(messageId)) return false;

  if(env?.BOT_STATE){
    const key=messageKey(messageId);
    const exists=await env.BOT_STATE.get(key);
    if(exists) return false;
    await putJson(
      env,
      key,
      {messageId,...payload,createdAt:new Date().toISOString()},
      {expirationTtl:86400}
    );
  }

  recentMessageIds.set(messageId,Date.now());
  return true;
}

export async function getSession(env,phone){
  const memory=memorySessions.get(phone);
  if(memory) return memory;

  const saved=await getJson(env,sessionKey(phone));
  if(saved){
    memorySessions.set(phone,saved);
    return saved;
  }

  return {
    phone,
    optedOut:false,
    humanHandoffUntil:null,
    botMode:"bot",
    lastIntent:null,
    name:null,
    quoteDraft:null,
    supportDraft:null
  };
}

export async function updateSession(env,phone,patch){
  const current=await getSession(env,phone);
  const next={
    ...current,
    ...patch,
    phone,
    updatedAt:new Date().toISOString()
  };

  memorySessions.set(phone,next);
  await putJson(env,sessionKey(phone),next);
  return next;
}

export async function getConversation(env,phone){
  const saved=await getJson(env,conversationKey(phone));
  return saved || {
    phone,
    customerName:null,
    status:"open",
    botMode:"bot",
    needsHuman:false,
    assignedAdmin:null,
    unreadCount:0,
    lastMessage:null,
    lastDirection:null,
    lastAt:null,
    supportType:null,
    reference:null,
    latestRequest:null
  };
}

export async function setConversationState(env,phone,patch){
  const current=await getConversation(env,phone);
  const next={
    ...current,
    ...patch,
    phone,
    updatedAt:new Date().toISOString()
  };
  await putJson(env,conversationKey(phone),next);
  return next;
}

export async function recordConversationMessage(env,{
  phone,
  customerName=null,
  direction,
  text,
  source="customer",
  adminName=null,
  messageType="text",
  incrementUnread=false,
  meta=null
}){
  if(!phone || !text) return null;

  const createdAt=new Date().toISOString();
  const timestamp=Date.now().toString().padStart(13,"0");
  const id=crypto.randomUUID();

  const message={
    id,
    phone,
    customerName,
    direction,
    source,
    adminName,
    messageType,
    text:String(text).slice(0,5000),
    meta,
    createdAt
  };

  if(env?.BOT_STATE){
    await putJson(
      env,
      `${conversationMessagePrefix(phone)}${timestamp}:${id}`,
      message,
      {expirationTtl:60*60*24*180}
    );
  }

  const current=await getConversation(env,phone);
  const unreadCount=incrementUnread
    ? Number(current.unreadCount || 0)+1
    : Number(current.unreadCount || 0);

  await setConversationState(env,phone,{
    customerName:customerName || current.customerName || null,
    lastMessage:message.text.slice(0,240),
    lastDirection:direction,
    lastAt:createdAt,
    unreadCount
  });

  return message;
}

export async function listConversations(env,{limit=100}={}){
  if(!env?.BOT_STATE) return [];

  const listed=await env.BOT_STATE.list({
    prefix:"conversation:",
    limit:Math.min(Math.max(limit,1),1000)
  });

  const records=await Promise.all(
    listed.keys.map((key)=>getJson(env,key.name))
  );

  return records
    .filter(Boolean)
    .sort((a,b)=>{
      const atA=a.lastAt ? Date.parse(a.lastAt) : 0;
      const atB=b.lastAt ? Date.parse(b.lastAt) : 0;
      return atB-atA;
    });
}

export async function getConversationMessages(env,phone,{limit=150}={}){
  if(!env?.BOT_STATE) return [];

  const listed=await env.BOT_STATE.list({
    prefix:conversationMessagePrefix(phone),
    limit:Math.min(Math.max(limit,1),1000)
  });

  const records=await Promise.all(
    listed.keys.map((key)=>getJson(env,key.name))
  );

  return records
    .filter(Boolean)
    .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))
    .slice(-limit);
}

export async function markConversationRead(env,phone){
  return setConversationState(env,phone,{unreadCount:0});
}

export async function saveLead(env,lead){
  const id=makeReference("SFS");
  const record={
    id,
    status:"new",
    ...lead,
    createdAt:new Date().toISOString()
  };

  console.log("Human support lead:",{
    id,
    phone:lead.phone?`***${lead.phone.slice(-4)}`:"unknown",
    name:lead.name||"unknown",
    intent:lead.intent||"human_support"
  });

  if(env?.BOT_STATE){
    const timestamp=Date.now();
    await putJson(
      env,
      `support:${timestamp}:${id}`,
      record,
      {expirationTtl:60*60*24*180}
    );
  }

  return record;
}

export async function saveQuoteRequest(env,quote){
  const id=makeReference("SFQ");
  const record={
    id,
    status:"new",
    ...quote,
    createdAt:new Date().toISOString()
  };

  console.log("Quote request:",{
    id,
    phone:quote.phone?`***${quote.phone.slice(-4)}`:"unknown",
    service:quote.service||"unknown",
    budget:quote.budget||"not provided"
  });

  if(env?.BOT_STATE){
    const timestamp=Date.now();
    await putJson(
      env,
      `quote:${timestamp}:${id}`,
      record,
      {expirationTtl:60*60*24*180}
    );
    await putJson(
      env,
      `latest_quote:${quote.phone}`,
      {id,createdAt:record.createdAt},
      {expirationTtl:60*60*24*180}
    );
  }

  return record;
}
