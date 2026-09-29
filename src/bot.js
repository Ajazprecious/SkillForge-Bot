import { courses, services, portfolio, settings, courseById, serviceById, findCourseInText, findServiceInText } from "./config.js";
import { sendText, sendReplyButtons, sendMainMenu, sendCourseMenu, sendServiceMenu } from "./whatsapp.js";
import { getSession, updateSession, saveLead } from "./store.js";

const MENU_WORDS=new Set(["menu","main menu","home","0","start"]);
const STOP_WORDS=new Set(["stop","unsubscribe","opt out","cancel messages"]);
const RESUME_WORDS=new Set(["resume","subscribe","start","start bot"]);
const GREETINGS=["hello","hi","hey","good morning","good afternoon","good evening"];

function normalize(text=""){ return text.toLowerCase().replace(/[^\p{L}\p{N}\s/&+.-]/gu," ").replace(/\s+/g," ").trim(); }
function includesAny(text,keywords){ return keywords.some((word)=>text.includes(word)); }
function isGreeting(text){ return GREETINGS.some((greeting)=>text===greeting || text.startsWith(greeting+" ")); }
function messageText(message){
  if(!message) return "";
  if(message.type==="text") return message.text?.body || "";
  if(message.type==="interactive") return message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || "";
  if(message.type==="button") return message.button?.payload || message.button?.text || "";
  return "";
}

async function safeMenu(to){
  try{ await sendMainMenu(to); }
  catch(error){
    console.warn("Interactive menu failed, using text fallback:",error.message);
    await sendText(to,"Welcome to Skill Forge Academy 👋\n\n1. Courses & Fees\n2. Digital Services\n3. Scholarships\n4. Register / Join\n5. Upcoming Cohort\n6. Our Projects\n7. Speak to a Person\n\nReply with a number or type what you need.");
  }
}

async function showCourse(to,course){
  const url=`${settings.academyUrl.replace(/\/$/,"")}${course.path}`;
  await sendReplyButtons(to,`🎓 *${course.title}*\n\n${course.description}\n\n💳 *Packages*\n${course.pricing}\n\nCourse page:\n${url}`,[
    {id:"menu_register",title:"Register"},{id:"menu_courses",title:"More courses"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function showService(to,service){
  await sendReplyButtons(to,`💼 *${service.title}*\n\n${service.description}\n\n💰 ${service.price}\n\nFor an exact quote, tell us what you want to build, the main features, and your preferred timeline.`,[
    {id:"service_quote",title:"Request quote"},{id:"menu_services",title:"More services"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function showRegistration(to){
  await sendReplyButtons(to,`🚀 *Register with Skill Forge Academy*\n\n1) Browse courses: ${settings.academyUrl}\n2) Join our WhatsApp information group: ${settings.groupUrl}\n\nAfter joining, check the latest cohort announcement and follow the registration instructions.`,[
    {id:"menu_courses",title:"View courses"},{id:"menu_scholarship",title:"Scholarship"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function showScholarship(to){
  await sendReplyButtons(to,`🎓 *Skill Forge Scholarship*\n\n${settings.scholarshipText}\n\nScholarship availability can change by cohort, so the latest information is shared through our information group:\n${settings.groupUrl}`,[
    {id:"menu_register",title:"How to register"},{id:"menu_courses",title:"View courses"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function showCohort(to){
  await sendReplyButtons(to,`📅 *Upcoming Cohorts*\n\nWe do not want to give you an outdated class date. Current cohort dates, registration deadlines and scholarship updates are announced in our WhatsApp information group:\n\n${settings.groupUrl}`,[
    {id:"menu_register",title:"Join / Register"},{id:"menu_courses",title:"View courses"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function showPortfolio(to){
  const lines=portfolio.map((item,index)=>`${index+1}. *${item.name}*\n${item.description}\n${item.url}`);
  await sendReplyButtons(to,`🧩 *Selected Skill Forge Projects*\n\n${lines.join("\n\n")}`,[
    {id:"menu_services",title:"Our services"},{id:"service_quote",title:"Request quote"},{id:"menu_main",title:"Main menu"}
  ]);
}

async function handoff(to,profileName,originalText){
  const until=new Date(Date.now()+settings.humanHandoffHours*60*60*1000);
  await updateSession(to,{humanHandoffUntil:until,lastIntent:"human_handoff",name:profileName||null});
  await saveLead({phone:to,name:profileName||null,intent:"human_handoff",message:originalText||null,handoffUntil:until});
  await sendText(to,`👤 *Human support requested*\n\nYour conversation has been marked for a Skill Forge representative. You can continue typing the details of what you need here.\n\nThe bot will stay out of the conversation for the next ${settings.humanHandoffHours} hours so a team member can reply.\n\nIf you want to return to the automated menu at any time, type *MENU*.`);
}

function numericMenu(text){ return ({"1":"menu_courses","2":"menu_services","3":"menu_scholarship","4":"menu_register","5":"menu_cohort","6":"menu_portfolio","7":"menu_human"})[text.trim()] || null; }

async function handleCommand(to,command,profileName,originalText){
  if(command==="menu_main"){ await updateSession(to,{humanHandoffUntil:null,lastIntent:"menu"}); return safeMenu(to); }
  if(command==="menu_courses"){ await updateSession(to,{lastIntent:"courses"}); return sendCourseMenu(to,courses); }
  if(command==="menu_services"){ await updateSession(to,{lastIntent:"services"}); return sendServiceMenu(to,services); }
  if(command==="menu_scholarship"){ await updateSession(to,{lastIntent:"scholarship"}); return showScholarship(to); }
  if(command==="menu_register"){ await updateSession(to,{lastIntent:"register"}); return showRegistration(to); }
  if(command==="menu_cohort"){ await updateSession(to,{lastIntent:"cohort"}); return showCohort(to); }
  if(command==="menu_portfolio"){ await updateSession(to,{lastIntent:"portfolio"}); return showPortfolio(to); }
  if(command==="menu_human" || command==="service_quote") return handoff(to,profileName,originalText);
  const course=courseById(command); if(course){ await updateSession(to,{lastIntent:course.id}); return showCourse(to,course); }
  const service=serviceById(command); if(service){ await updateSession(to,{lastIntent:service.id}); return showService(to,service); }
  return false;
}

async function resolveAmbiguousCourseOrService(to,course,service){
  await sendReplyButtons(to,`I can help with *${course.title}* as a course, or *${service.title}* as a service. Which one do you mean?`,[
    {id:course.id,title:"I want to learn"},{id:service.id,title:"I want the service"},{id:"menu_main",title:"Main menu"}
  ]);
}

export async function handleIncoming({from,profileName,message}){
  const rawText=messageText(message); const text=normalize(rawText); const session=await getSession(from);

  if(STOP_WORDS.has(text)){
    await updateSession(from,{optedOut:true,humanHandoffUntil:null,lastIntent:"opted_out"});
    await sendText(from,"You have been opted out of automated Skill Forge replies. Type START BOT if you want to use the bot again."); return;
  }

  if(session.optedOut){
    if(RESUME_WORDS.has(text)){ await updateSession(from,{optedOut:false,lastIntent:"menu"}); await sendText(from,"Automated replies are active again ✅"); await safeMenu(from); }
    return;
  }

  if(MENU_WORDS.has(text)){ await updateSession(from,{humanHandoffUntil:null,lastIntent:"menu"}); await safeMenu(from); return; }

  if(session.humanHandoffUntil && new Date(session.humanHandoffUntil).getTime()>Date.now()) return;

  if(!rawText && !["text","interactive","button"].includes(message?.type)){
    await sendText(from,"I received your message. For now, please type what you need—for example *courses*, *website*, *scholarship*, *registration*, or *MENU*."); return;
  }

  const numeric=numericMenu(text); if(numeric){ await handleCommand(from,numeric,profileName,rawText); return; }
  if(text.startsWith("menu_") || text.startsWith("course_") || text.startsWith("service_")){
    const handled=await handleCommand(from,text,profileName,rawText); if(handled!==false) return;
  }

  const mentionedCourse=findCourseInText(text); const mentionedService=findServiceInText(text);
  const courseCues=includesAny(text,["course","learn","learning","training","class","student","fee","fees","tuition","package"]);
  const serviceCues=includesAny(text,["service","for my business","for our business","build for me","develop for me","design for me","create for me","need a logo","need a flyer","quote","client project","business website","business app"]);

  if(mentionedCourse && mentionedService && !courseCues && !serviceCues){ await resolveAmbiguousCourseOrService(from,mentionedCourse,mentionedService); return; }
  if(mentionedService && serviceCues){ await showService(from,mentionedService); return; }
  if(mentionedCourse && courseCues){ await showCourse(from,mentionedCourse); return; }
  if(mentionedCourse && mentionedService){ await resolveAmbiguousCourseOrService(from,mentionedCourse,mentionedService); return; }
  if(mentionedService){ await showService(from,mentionedService); return; }
  if(mentionedCourse){ await showCourse(from,mentionedCourse); return; }

  if(includesAny(text,["course","courses","training","learn","class","fees","fee","tuition","course price","course pricing"])){ await sendCourseMenu(from,courses); return; }
  if(includesAny(text,["service","services","build for me","develop for me","digital services"])){ await sendServiceMenu(from,services); return; }
  if(includesAny(text,["scholarship","sponsor","sponsorship","discount","100%"])){ await showScholarship(from); return; }
  if(includesAny(text,["register","registration","join","enroll","enrol","sign up"])){ await showRegistration(from); return; }
  if(includesAny(text,["cohort","start date","next class","class start","schedule","when is the next"])){ await showCohort(from); return; }
  if(includesAny(text,["portfolio","project","projects","previous work","work sample","samples"])){ await showPortfolio(from); return; }
  if(includesAny(text,["human","person","agent","representative","speak to","talk to","customer care","support"])){ await handoff(from,profileName,rawText); return; }
  if(isGreeting(text)){ await safeMenu(from); return; }

  await sendReplyButtons(from,"I can help with Skill Forge courses and fees, scholarships, registration, digital services, project examples, upcoming cohort information, or human support.\n\nChoose an option below or type *MENU*.",[
    {id:"menu_courses",title:"Courses"},{id:"menu_services",title:"Services"},{id:"menu_human",title:"Human support"}
  ]);
}
