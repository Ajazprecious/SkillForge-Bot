import { handleIncoming } from "./bot.js";
import { claimMessage, updateSession } from "./store.js";
import { markAsRead, sendText } from "./whatsapp.js";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json; charset=utf-8"}
  });
}

function constantTimeEqual(a,b){
  if(typeof a!=="string" || typeof b!=="string" || a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function bytesToHex(bytes){
  return Array.from(new Uint8Array(bytes),(byte)=>byte.toString(16).padStart(2,"0")).join("");
}

async function verifyMetaSignature(request,rawBody,appSecret){
  if(!appSecret){
    console.warn("META_APP_SECRET is not configured; webhook signature verification is disabled.");
    return true;
  }

  const supplied=request.headers.get("x-hub-signature-256");
  if(!supplied) return false;

  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );

  const digest=await crypto.subtle.sign("HMAC",key,rawBody);
  const expected=`sha256=${bytesToHex(digest)}`;
  return constantTimeEqual(supplied,expected);
}

function extractIncoming(body){
  const items=[];

  for(const entry of body?.entry || []){
    for(const change of entry?.changes || []){
      const value=change?.value;
      const messages=value?.messages || [];
      const contacts=value?.contacts || [];

      for(const message of messages){
        const contact=contacts.find((item)=>item.wa_id===message.from) || contacts[0];
        items.push({
          message,
          from:message.from,
          profileName:contact?.profile?.name || null,
          metadata:value?.metadata || null
        });
      }
    }
  }

  return items;
}

async function processIncoming(env,item){
  const {message,from,profileName}=item;

  const claimed=await claimMessage(env,message.id,{
    phone:from,
    type:message.type
  });

  if(!claimed) return;

  await updateSession(env,from,{
    ...(profileName?{name:profileName}:{}),
    lastSeenAt:new Date().toISOString()
  });

  await markAsRead(env,message.id);

  try{
    await handleIncoming(env,{from,profileName,message});
  } catch(error){
    console.error("Bot processing failed:",error);
    try{
      await sendText(
        env,
        from,
        "Something went wrong while processing that message. Please type *MENU* to try again, or type *HUMAN* to request a representative."
      );
    } catch(sendError){
      console.error("Fallback reply also failed:",sendError?.message || sendError);
    }
  }
}

async function handleWebhookVerification(request,env){
  const url=new URL(request.url);
  const mode=url.searchParams.get("hub.mode");
  const token=url.searchParams.get("hub.verify_token");
  const challenge=url.searchParams.get("hub.challenge");

  if(!env.WHATSAPP_VERIFY_TOKEN){
    console.error("WHATSAPP_VERIFY_TOKEN is not configured.");
    return new Response("Webhook verify token is not configured.",{status:500});
  }

  if(mode==="subscribe" && token===env.WHATSAPP_VERIFY_TOKEN){
    console.log("WhatsApp webhook verified.");
    return new Response(challenge || "",{status:200});
  }

  return new Response("Forbidden",{status:403});
}

async function handleWebhookEvent(request,env,ctx){
  const rawBody=await request.arrayBuffer();

  const validSignature=await verifyMetaSignature(
    request,
    rawBody,
    env.META_APP_SECRET
  );

  if(!validSignature){
    console.warn("Rejected webhook with invalid Meta signature.");
    return new Response("Unauthorized",{status:401});
  }

  let body;
  try{
    body=JSON.parse(new TextDecoder().decode(rawBody));
  } catch{
    return new Response("Invalid JSON",{status:400});
  }

  const incoming=extractIncoming(body);

  if(incoming.length){
    ctx.waitUntil(
      Promise.allSettled(incoming.map((item)=>processIncoming(env,item)))
    );
  }

  return new Response("EVENT_RECEIVED",{status:200});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname==="/" && request.method==="GET"){
      return json({
        ok:true,
        service:"Skill Forge Academy WhatsApp Bot",
        runtime:"Cloudflare Workers",
        webhook:"/webhook",
        health:"/health"
      });
    }

    if(url.pathname==="/health" && request.method==="GET"){
      return json({
        ok:true,
        runtime:"cloudflare-workers",
        kvBound:Boolean(env.BOT_STATE),
        whatsappConfigured:Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
        webhookVerifyTokenConfigured:Boolean(env.WHATSAPP_VERIFY_TOKEN),
        appSecretConfigured:Boolean(env.META_APP_SECRET)
      });
    }

    if(url.pathname==="/webhook" && request.method==="GET"){
      return handleWebhookVerification(request,env);
    }

    if(url.pathname==="/webhook" && request.method==="POST"){
      return handleWebhookEvent(request,env,ctx);
    }

    return json({ok:false,error:"Not found"},404);
  }
};
