import { handleIncoming } from "./bot.js";
import {
  claimMessage,
  getSession,
  updateSession,
  recordConversationMessage,
  listConversations,
  getConversation,
  getConversationMessages,
  setConversationState,
  markConversationRead
} from "./store.js";
import { markAsRead, sendText } from "./whatsapp.js";
import {
  adminPage,
  adminConfigured,
  createAdminSession,
  getAdminFromRequest,
  adminSessionCookie,
  clearAdminSessionCookie
} from "./admin.js";

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      ...headers
    }
  });
}

async function readJson(request){
  try{return await request.json();}
  catch{return {};}
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

function inboundDisplayText(message){
  if(!message) return "Unsupported message";
  if(message.type==="text") return message.text?.body || "";
  if(message.type==="interactive"){
    return message.interactive?.list_reply?.title
      || message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.id
      || message.interactive?.button_reply?.id
      || "Interactive reply";
  }
  if(message.type==="button") return message.button?.text || message.button?.payload || "Button reply";
  if(message.type==="image") return message.image?.caption || "📷 Image";
  if(message.type==="video") return message.video?.caption || "🎥 Video";
  if(message.type==="audio") return "🎵 Audio message";
  if(message.type==="document") return `📎 ${message.document?.filename || "Document"}`;
  if(message.type==="sticker") return "Sticker";
  if(message.type==="location") return "📍 Location";
  if(message.type==="contacts") return "Contact card";
  return `[${message.type || "message"}]`;
}

async function processIncoming(env,item){
  const {message,from,profileName}=item;

  const claimed=await claimMessage(env,message.id,{
    phone:from,
    type:message.type
  });

  if(!claimed) return;

  const session=await updateSession(env,from,{
    ...(profileName?{name:profileName}:{}),
    lastSeenAt:new Date().toISOString()
  });

  const humanActive=
    session.botMode==="human"
    || (session.humanHandoffUntil && new Date(session.humanHandoffUntil).getTime()>Date.now());

  await recordConversationMessage(env,{
    phone:from,
    customerName:profileName,
    direction:"in",
    source:"customer",
    messageType:message.type || "unknown",
    text:inboundDisplayText(message),
    incrementUnread:Boolean(humanActive)
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

async function requireAdmin(request,env){
  const admin=await getAdminFromRequest(request,env);
  return admin;
}

async function handleAdminApi(request,env,url){
  if(url.pathname==="/api/admin/login" && request.method==="POST"){
    if(!adminConfigured(env)){
      return json({
        error:"Admin inbox is not configured. Add ADMIN_USERS and ADMIN_SESSION_SECRET as Cloudflare secrets."
      },503);
    }

    const body=await readJson(request);
    const username=String(body.username || "").trim();
    const password=String(body.password || "");
    const token=await createAdminSession(env,username,password);

    if(!token) return json({error:"Invalid username or password."},401);

    return json(
      {ok:true,username},
      200,
      {"set-cookie":adminSessionCookie(token)}
    );
  }

  if(url.pathname==="/api/admin/logout" && request.method==="POST"){
    return json(
      {ok:true},
      200,
      {"set-cookie":clearAdminSessionCookie()}
    );
  }

  const admin=await requireAdmin(request,env);
  if(!admin) return json({error:"Unauthorized"},401);

  if(url.pathname==="/api/admin/me" && request.method==="GET"){
    return json({ok:true,username:admin.username});
  }

  if(!env.BOT_STATE){
    return json({
      error:"BOT_STATE KV is not connected. Add the BOT_STATE KV binding to use the admin inbox."
    },503);
  }

  if(url.pathname==="/api/admin/conversations" && request.method==="GET"){
    const conversations=await listConversations(env,{limit:300});
    return json({ok:true,conversations});
  }

  const match=url.pathname.match(/^\/api\/admin\/conversations\/([^/]+)(?:\/(assign|takeover|return-to-bot|close|reply|read))?$/);
  if(!match) return json({error:"Not found"},404);

  const phone=decodeURIComponent(match[1]);
  const action=match[2] || null;

  if(!action && request.method==="GET"){
    const [conversation,messages]=await Promise.all([
      getConversation(env,phone),
      getConversationMessages(env,phone,{limit:250})
    ]);
    return json({ok:true,conversation,messages});
  }

  if(request.method!=="POST") return json({error:"Method not allowed"},405);

  if(action==="read"){
    const conversation=await markConversationRead(env,phone);
    return json({ok:true,conversation});
  }

  if(action==="assign"){
    const conversation=await setConversationState(env,phone,{
      assignedAdmin:admin.username,
      status:"open"
    });
    return json({ok:true,conversation});
  }

  if(action==="takeover"){
    const handoffHours=Number(env.HUMAN_HANDOFF_HOURS || 12);
    const handoffUntil=new Date(Date.now()+handoffHours*60*60*1000).toISOString();

    await updateSession(env,phone,{
      botMode:"human",
      humanHandoffUntil:handoffUntil
    });

    const conversation=await setConversationState(env,phone,{
      botMode:"human",
      needsHuman:true,
      assignedAdmin:admin.username,
      status:"open"
    });

    return json({ok:true,conversation});
  }

  if(action==="return-to-bot"){
    await updateSession(env,phone,{
      botMode:"bot",
      humanHandoffUntil:null,
      quoteDraft:null,
      supportDraft:null
    });

    const conversation=await setConversationState(env,phone,{
      botMode:"bot",
      needsHuman:false,
      assignedAdmin:null,
      status:"open",
      unreadCount:0
    });

    return json({ok:true,conversation});
  }

  if(action==="close"){
    await updateSession(env,phone,{
      botMode:"bot",
      humanHandoffUntil:null,
      quoteDraft:null,
      supportDraft:null
    });

    const conversation=await setConversationState(env,phone,{
      botMode:"bot",
      needsHuman:false,
      assignedAdmin:admin.username,
      status:"closed",
      unreadCount:0
    });

    return json({ok:true,conversation});
  }

  if(action==="reply"){
    const body=await readJson(request);
    const text=String(body.text || "").trim();
    if(!text) return json({error:"Reply text is required."},400);
    if(text.length>4000) return json({error:"Reply is too long."},400);

    const handoffHours=Number(env.HUMAN_HANDOFF_HOURS || 12);
    const handoffUntil=new Date(Date.now()+handoffHours*60*60*1000).toISOString();

    await updateSession(env,phone,{
      botMode:"human",
      humanHandoffUntil:handoffUntil
    });

    await setConversationState(env,phone,{
      botMode:"human",
      needsHuman:true,
      assignedAdmin:admin.username,
      status:"open"
    });

    await sendText(env,phone,text,{
      source:"admin",
      adminName:admin.username
    });

    const conversation=await getConversation(env,phone);
    return json({ok:true,conversation});
  }

  return json({error:"Unknown action"},404);
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
        health:"/health",
        admin:"/admin"
      });
    }

    if(url.pathname==="/health" && request.method==="GET"){
      return json({
        ok:true,
        runtime:"cloudflare-workers",
        kvBound:Boolean(env.BOT_STATE),
        whatsappConfigured:Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
        webhookVerifyTokenConfigured:Boolean(env.WHATSAPP_VERIFY_TOKEN),
        appSecretConfigured:Boolean(env.META_APP_SECRET),
        adminConfigured:adminConfigured(env)
      });
    }

    if(url.pathname==="/admin" && request.method==="GET"){
      return new Response(adminPage(),{
        headers:{
          "content-type":"text/html; charset=utf-8",
          "cache-control":"no-store",
          "x-frame-options":"DENY",
          "content-security-policy":"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
        }
      });
    }

    if(url.pathname.startsWith("/api/admin/")){
      return handleAdminApi(request,env,url);
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
