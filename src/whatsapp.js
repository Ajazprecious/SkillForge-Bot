const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const API_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

function assertConfigured() {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) throw new Error("WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");
}

async function apiRequest(payload) {
  assertConfigured();
  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method:"POST",
    headers:{Authorization:`Bearer ${ACCESS_TOKEN}`,"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",...payload}),
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(`WhatsApp API error ${response.status}: ${JSON.stringify(data)}`);
    error.status=response.status; error.data=data; throw error;
  }
  return data;
}

export async function sendText(to, body, {previewUrl=false}={}) {
  return apiRequest({recipient_type:"individual",to,type:"text",text:{body:body.slice(0,4096),preview_url:previewUrl}});
}

export async function sendReplyButtons(to, body, buttons) {
  return apiRequest({recipient_type:"individual",to,type:"interactive",interactive:{type:"button",body:{text:body.slice(0,1024)},action:{buttons:buttons.slice(0,3).map((button)=>({type:"reply",reply:{id:button.id.slice(0,256),title:button.title.slice(0,20)}}))}}});
}

export async function sendList(to,{header,body,button,sections}) {
  return apiRequest({recipient_type:"individual",to,type:"interactive",interactive:{type:"list",...(header?{header:{type:"text",text:header.slice(0,60)}}:{}),body:{text:body.slice(0,1024)},action:{button:button.slice(0,20),sections:sections.slice(0,10).map((section)=>({title:section.title.slice(0,24),rows:section.rows.slice(0,10).map((row)=>({id:row.id.slice(0,200),title:row.title.slice(0,24),...(row.description?{description:row.description.slice(0,72)}:{})}))}))}}});
}

export async function markAsRead(messageId) {
  if (!messageId) return;
  try { await apiRequest({status:"read",message_id:messageId}); }
  catch (error) { console.warn("Could not mark message as read:",error.message); }
}

export async function sendMainMenu(to) {
  return sendList(to,{header:"Skill Forge Academy",body:"Welcome 👋\n\nHow can we help you today? Choose an option below, or simply type what you need.",button:"View options",sections:[{title:"Academy",rows:[
    {id:"menu_courses",title:"Courses & Fees",description:"See all courses and current packages"},
    {id:"menu_scholarship",title:"Scholarships",description:"Learn about available scholarship opportunities"},
    {id:"menu_register",title:"Register / Join",description:"Join the information group and get started"},
    {id:"menu_cohort",title:"Upcoming Cohort",description:"Find out where cohort updates are announced"}
  ]},{title:"Services",rows:[
    {id:"menu_services",title:"Digital Services",description:"Web, mobile, design and video services"},
    {id:"menu_portfolio",title:"Our Projects",description:"View selected Skill Forge projects"},
    {id:"menu_human",title:"Speak to a Person",description:"Hand the chat over to our team"}
  ]}]});
}

export async function sendCourseMenu(to,courses) {
  return sendList(to,{header:"Skill Forge Courses",body:"Choose a course to see what you will learn and the current package prices.",button:"Choose course",sections:[{title:"Available courses",rows:courses.map((course)=>({id:course.id,title:course.menuTitle || course.title,description:course.pricing}))}]});
}

export async function sendServiceMenu(to,services) {
  return sendList(to,{header:"Skill Forge Services",body:"Choose a digital service to see what we offer.",button:"Choose service",sections:[{title:"Digital services",rows:services.map((service)=>({id:service.id,title:service.menuTitle || service.title,description:service.price}))}]});
}
