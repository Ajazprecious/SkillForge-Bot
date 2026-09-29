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

export async function claimMessage(env,messageId,payload={}){
  if(!messageId) return true;

  pruneRecentMessages();
  if(recentMessageIds.has(messageId)) return false;

  if(env?.BOT_STATE){
    const key=messageKey(messageId);
    const exists=await env.BOT_STATE.get(key);
    if(exists) return false;
    await env.BOT_STATE.put(key,JSON.stringify({messageId,...payload,createdAt:new Date().toISOString()}),{expirationTtl:86400});
  }

  recentMessageIds.set(messageId,Date.now());
  return true;
}

export async function getSession(env,phone){
  if(env?.BOT_STATE){
    const saved=await env.BOT_STATE.get(sessionKey(phone),{type:"json"});
    if(saved) return saved;
  }

  return memorySessions.get(phone) || {
    phone,
    optedOut:false,
    humanHandoffUntil:null,
    lastIntent:null,
    name:null
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
  const record={...lead,createdAt:new Date().toISOString()};

  console.log("Human handoff lead:",{
    phone:lead.phone?`***${lead.phone.slice(-4)}`:"unknown",
    name:lead.name||"unknown",
    intent:lead.intent||"human_handoff"
  });

  if(env?.BOT_STATE){
    const timestamp=Date.now();
    const id=crypto.randomUUID();
    await env.BOT_STATE.put(
      `lead:${timestamp}:${id}`,
      JSON.stringify(record),
      {expirationTtl:60*60*24*90}
    );
  }

  return record;
}
