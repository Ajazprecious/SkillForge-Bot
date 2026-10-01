const memorySessions = new Map();
const recentMessageIds = new Map();

function pruneRecentMessages(){
  const cutoff=Date.now()-86400000;
  for(const [id,time] of recentMessageIds.entries()) {
    if(time<cutoff) recentMessageIds.delete(id);
  }
}

function sessionKey(phone){ return `session:${phone}`; }
function messageKey(messageId){ return `message:${messageId}`; }

function makeReference(prefix){
  const time=Date.now().toString(36).toUpperCase();
  const random=crypto.randomUUID().replace(/-/g,"").slice(0,5).toUpperCase();
  return `${prefix}-${time}-${random}`;
}

export async function claimMessage(env,messageId,payload={}){
  if(!messageId) return true;

  pruneRecentMessages();
  if(recentMessageIds.has(messageId)) return false;

  if(env?.BOT_STATE){
    const key=messageKey(messageId);
    const exists=await env.BOT_STATE.get(key);
    if(exists) return false;
    await env.BOT_STATE.put(
      key,
      JSON.stringify({messageId,...payload,createdAt:new Date().toISOString()}),
      {expirationTtl:86400}
    );
  }

  recentMessageIds.set(messageId,Date.now());
  return true;
}

export async function getSession(env,phone){
  const memory=memorySessions.get(phone);
  if(memory) return memory;

  if(env?.BOT_STATE){
    const saved=await env.BOT_STATE.get(sessionKey(phone),{type:"json"});
    if(saved){
      memorySessions.set(phone,saved);
      return saved;
    }
  }

  return {
    phone,
    optedOut:false,
    humanHandoffUntil:null,
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

  if(env?.BOT_STATE){
    await env.BOT_STATE.put(sessionKey(phone),JSON.stringify(next));
  }

  return next;
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
    await env.BOT_STATE.put(
      `support:${timestamp}:${id}`,
      JSON.stringify(record),
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
    await env.BOT_STATE.put(
      `quote:${timestamp}:${id}`,
      JSON.stringify(record),
      {expirationTtl:60*60*24*180}
    );
    await env.BOT_STATE.put(
      `latest_quote:${quote.phone}`,
      JSON.stringify({id,createdAt:record.createdAt}),
      {expirationTtl:60*60*24*180}
    );
  }

  return record;
}
