import { recordConversationMessage } from "./store.js";

function assertConfigured(env) {
  if (!env?.WHATSAPP_ACCESS_TOKEN || !env?.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID as Worker secrets.");
  }
}

async function apiRequest(env, payload) {
  assertConfigured(env);
  const apiVersion = env.META_GRAPH_VERSION || "v25.0";
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method:"POST",
    headers:{
      Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({messaging_product:"whatsapp",...payload}),
  });

  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(`WhatsApp API error ${response.status}: ${JSON.stringify(data)}`);
    error.status=response.status;
    error.data=data;
    throw error;
  }
  return data;
}

async function logOutbound(env,to,text,{source="bot",adminName=null,messageType="text"}={}){
  try{
    await recordConversationMessage(env,{
      phone:to,
      direction:"out",
      source,
      adminName,
      messageType,
      text
    });
  } catch(error){
    console.warn("Could not save outbound conversation message:",error?.message || error);
  }
}

export async function sendText(env, to, body, {
  previewUrl=false,
  source="bot",
  adminName=null
}={}) {
  const result=await apiRequest(env,{
    recipient_type:"individual",
    to,
    type:"text",
    text:{body:body.slice(0,4096),preview_url:previewUrl}
  });

  await logOutbound(env,to,body,{source,adminName,messageType:"text"});
  return result;
}

export async function sendReplyButtons(env, to, body, buttons) {
  const result=await apiRequest(env,{
    recipient_type:"individual",
    to,
    type:"interactive",
    interactive:{
      type:"button",
      body:{text:body.slice(0,1024)},
      action:{
        buttons:buttons.slice(0,3).map((button)=>({
          type:"reply",
          reply:{id:button.id.slice(0,256),title:button.title.slice(0,20)}
        }))
      }
    }
  });

  await logOutbound(env,to,body,{source:"bot",messageType:"interactive_button"});
  return result;
}

export async function sendList(env, to,{header,body,button,sections}) {
  const result=await apiRequest(env,{
    recipient_type:"individual",
    to,
    type:"interactive",
    interactive:{
      type:"list",
      ...(header?{header:{type:"text",text:header.slice(0,60)}}:{}),
      body:{text:body.slice(0,1024)},
      action:{
        button:button.slice(0,20),
        sections:sections.slice(0,10).map((section)=>({
          title:section.title.slice(0,24),
          rows:section.rows.slice(0,10).map((row)=>({
            id:row.id.slice(0,200),
            title:row.title.slice(0,24),
            ...(row.description?{description:row.description.slice(0,72)}:{})
          }))
        }))
      }
    }
  });

  await logOutbound(env,to,`${header ? header+"\n\n" : ""}${body}`,{
    source:"bot",
    messageType:"interactive_list"
  });
  return result;
}

export async function markAsRead(env, messageId) {
  if (!messageId) return;
  try {
    await apiRequest(env,{status:"read",message_id:messageId});
  } catch (error) {
    console.warn("Could not mark message as read:",error.message);
  }
}

export async function sendMainMenu(env, to) {
  return sendList(env,to,{
    header:"Skill Forge Academy",
    body:"Welcome 👋\n\nHow can we help you today? Choose an option below, or simply type what you need.",
    button:"View options",
    sections:[
      {title:"Academy",rows:[
        {id:"menu_courses",title:"Courses & Fees",description:"See all courses and current packages"},
        {id:"menu_scholarship",title:"Scholarships",description:"Learn about available scholarship opportunities"},
        {id:"menu_register",title:"Register / Join",description:"Join the information group and get started"},
        {id:"menu_cohort",title:"Upcoming Cohort",description:"Find out where cohort updates are announced"}
      ]},
      {title:"Services",rows:[
        {id:"menu_services",title:"Digital Services",description:"Web, mobile, design and video services"},
        {id:"menu_portfolio",title:"Our Projects",description:"View selected Skill Forge projects"},
        {id:"menu_human",title:"Speak to a Person",description:"Hand the chat over to our team"}
      ]}
    ]
  });
}

export async function sendCourseMenu(env,to,courses) {
  return sendList(env,to,{
    header:"Skill Forge Courses",
    body:"Choose a course to see what you will learn and the current package prices.",
    button:"Choose course",
    sections:[{
      title:"Available courses",
      rows:courses.map((course)=>({
        id:course.id,
        title:course.menuTitle || course.title,
        description:course.pricing
      }))
    }]
  });
}

export async function sendServiceMenu(env,to,services) {
  return sendList(env,to,{
    header:"Skill Forge Services",
    body:"Choose a digital service to see what we offer.",
    button:"Choose service",
    sections:[{
      title:"Digital services",
      rows:services.map((service)=>({
        id:service.id,
        title:service.menuTitle || service.title,
        description:service.price
      }))
    }]
  });
}
