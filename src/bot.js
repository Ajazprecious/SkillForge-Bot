import {
  courses,
  services,
  getPortfolio,
  getSettings,
  courseById,
  serviceById,
  findCourseInText,
  findServiceInText
} from "./config.js";
import {
  sendText,
  sendReplyButtons,
  sendMainMenu,
  sendCourseMenu,
  sendServiceMenu
} from "./whatsapp.js";
import {
  getSession,
  updateSession,
  saveLead,
  saveQuoteRequest,
  setConversationState
} from "./store.js";

const MENU_WORDS=new Set(["menu","main menu","home","0","start"]);
const STOP_WORDS=new Set(["stop","unsubscribe","opt out","cancel messages"]);
const RESUME_WORDS=new Set(["resume","subscribe","start","start bot"]);
const CANCEL_WORDS=new Set(["cancel","cancel quote","cancel request","exit","quit"]);
const GREETINGS=["hello","hi","hey","good morning","good afternoon","good evening"];

function normalize(text=""){
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s/&+.-]/gu," ").replace(/\s+/g," ").trim();
}

function includesAny(text,keywords){
  return keywords.some((word)=>text.includes(word));
}

function isGreeting(text){
  return GREETINGS.some((greeting)=>text===greeting || text.startsWith(greeting+" "));
}

function messageText(message){
  if(!message) return "";
  if(message.type==="text") return message.text?.body || "";
  if(message.type==="interactive") return message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || "";
  if(message.type==="button") return message.button?.payload || message.button?.text || "";
  return "";
}

async function safeMenu(env,to){
  try{
    await sendMainMenu(env,to);
  } catch(error){
    console.warn("Interactive menu failed, using text fallback:",error.message);
    await sendText(
      env,
      to,
      "Welcome to Skill Forge Academy 👋\n\n1. Courses & Fees\n2. Digital Services\n3. Scholarships\n4. Register / Join\n5. Upcoming Cohort\n6. Our Projects\n7. Speak to a Person\n\nReply with a number or type what you need."
    );
  }
}

async function showCourse(env,to,course){
  const settings=getSettings(env);
  const url=`${settings.academyUrl.replace(/\/$/,"")}${course.path}`;

  await sendReplyButtons(
    env,
    to,
    `🎓 *${course.title}*\n\n${course.description}\n\n💳 *Packages*\n${course.pricing}\n\nCourse page:\n${url}`,
    [
      {id:"menu_register",title:"Register"},
      {id:"menu_courses",title:"More courses"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function showService(env,to,service){
  await sendReplyButtons(
    env,
    to,
    `💼 *${service.title}*\n\n${service.description}\n\n💰 ${service.price}\n\nNeed an exact price? Tap *Request quote* and I will collect the project details for our team.`,
    [
      {id:`quote_${service.id}`,title:"Request quote"},
      {id:"menu_services",title:"More services"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function showRegistration(env,to){
  const settings=getSettings(env);

  await sendReplyButtons(
    env,
    to,
    `🚀 *Register with Skill Forge Academy*\n\n1) Browse courses: ${settings.academyUrl}\n2) Join our WhatsApp information group: ${settings.groupUrl}\n\nAfter joining, check the latest cohort announcement and follow the registration instructions.`,
    [
      {id:"menu_courses",title:"View courses"},
      {id:"menu_scholarship",title:"Scholarship"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function showScholarship(env,to){
  const settings=getSettings(env);

  await sendReplyButtons(
    env,
    to,
    `🎓 *Skill Forge Scholarship*\n\n${settings.scholarshipText}\n\nScholarship availability can change by cohort, so the latest information is shared through our information group:\n${settings.groupUrl}`,
    [
      {id:"menu_register",title:"How to register"},
      {id:"menu_courses",title:"View courses"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function showCohort(env,to){
  const settings=getSettings(env);

  await sendReplyButtons(
    env,
    to,
    `📅 *Upcoming Cohorts*\n\nWe do not want to give you an outdated class date. Current cohort dates, registration deadlines and scholarship updates are announced in our WhatsApp information group:\n\n${settings.groupUrl}`,
    [
      {id:"menu_register",title:"Join / Register"},
      {id:"menu_courses",title:"View courses"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function showPortfolio(env,to){
  const lines=getPortfolio(env).map(
    (item,index)=>`${index+1}. *${item.name}*\n${item.description}\n${item.url}`
  );

  await sendReplyButtons(
    env,
    to,
    `🧩 *Selected Skill Forge Projects*\n\n${lines.join("\n\n")}`,
    [
      {id:"menu_services",title:"Our services"},
      {id:"quote_general",title:"Request quote"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

async function startQuoteRequest(env,to,profileName,service=null){
  const quoteDraft={
    step:"name",
    startedAt:new Date().toISOString(),
    data:{
      service:service?.title || null,
      whatsappName:profileName || null
    }
  };

  await updateSession(env,to,{
    quoteDraft,
    supportDraft:null,
    humanHandoffUntil:null,
    botMode:"bot",
    lastIntent:"quote_request"
  });

  const serviceLine=service ? `\n\nSelected service: *${service.title}*` : "";

  await sendText(
    env,
    to,
    `🧾 *Request a Skill Forge Quote*${serviceLine}\n\nI’ll collect a few details so our team can give you an accurate quotation.\n\n*1. What is your full name?*\n\nType *CANCEL* to stop or *MENU* to return to the main menu.`
  );
}

async function handleQuoteDraft(env,to,profileName,rawText,session){
  const text=(rawText || "").trim();
  const normalized=normalize(text);

  if(CANCEL_WORDS.has(normalized)){
    await updateSession(env,to,{quoteDraft:null,lastIntent:"services"});
    await sendText(env,to,"Quote request cancelled. You can request another quote whenever you are ready.");
    await sendServiceMenu(env,to,services);
    return;
  }

  if(!text){
    await sendText(env,to,"Please reply with text so I can continue your quote request. Type *MENU* to exit.");
    return;
  }

  const draft=session.quoteDraft;
  const data={...(draft?.data || {})};

  if(draft.step==="name"){
    if(text.length<2){
      await sendText(env,to,"Please enter your full name.");
      return;
    }

    data.name=text;
    const nextStep=data.service ? "description" : "service";

    await updateSession(env,to,{
      quoteDraft:{...draft,step:nextStep,data}
    });

    if(data.service){
      await sendText(
        env,
        to,
        `Thanks, ${data.name}.\n\n*2. Briefly describe exactly what you want us to create or build.*\nInclude important features, size/quantity, style, platform, or anything else we should know.`
      );
    } else {
      await sendText(
        env,
        to,
        "*2. Which Skill Forge service do you need?*\n\nFor example: Website Development, Mobile App Development, Graphics Design, Video Editing, or UI/UX Design."
      );
    }
    return;
  }

  if(draft.step==="service"){
    const matched=findServiceInText(normalized);
    data.service=matched?.title || text;

    await updateSession(env,to,{
      quoteDraft:{...draft,step:"description",data}
    });

    await sendText(
      env,
      to,
      `Great. Service selected: *${data.service}*\n\n*3. Briefly describe exactly what you want us to create or build.*\nInclude important features, size/quantity, style, platform, or anything else we should know.`
    );
    return;
  }

  if(draft.step==="description"){
    if(text.length<5){
      await sendText(env,to,"Please give us a little more detail about the project so we can quote it properly.");
      return;
    }

    data.description=text;

    await updateSession(env,to,{
      quoteDraft:{...draft,step:"budget",data}
    });

    await sendText(
      env,
      to,
      "*4. What is your budget range?*\n\nYou can enter an amount or a range, for example: ₦50,000–₦100,000. If you are unsure, type *Not sure*."
    );
    return;
  }

  if(draft.step==="budget"){
    data.budget=text;

    await updateSession(env,to,{
      quoteDraft:{...draft,step:"timeline",data}
    });

    await sendText(
      env,
      to,
      "*5. When would you like the project completed?*\n\nYou can enter a date or a timeline such as “within 2 weeks”."
    );
    return;
  }

  if(draft.step==="timeline"){
    const settings=getSettings(env);
    data.timeline=text;

    const quote=await saveQuoteRequest(env,{
      phone:to,
      name:data.name,
      whatsappName:profileName || data.whatsappName || null,
      service:data.service || "General digital service",
      description:data.description,
      budget:data.budget,
      timeline:data.timeline
    });

    const until=new Date(
      Date.now()+settings.humanHandoffHours*60*60*1000
    );

    await updateSession(env,to,{
      quoteDraft:null,
      supportDraft:null,
      humanHandoffUntil:until.toISOString(),
      botMode:"human",
      lastIntent:"quote_handoff",
      name:data.name
    });

    await setConversationState(env,to,{
      status:"open",
      botMode:"human",
      needsHuman:true,
      unreadCount:1,
      supportType:"quote",
      reference:quote.id,
      customerName:data.name,
      latestRequest:{
        type:"quote",
        service:data.service || "General digital service",
        description:data.description,
        budget:data.budget,
        timeline:data.timeline,
        reference:quote.id
      }
    });

    await sendText(
      env,
      to,
      `✅ *Quote request received*\n\nReference: *${quote.id}*\nService: *${data.service || "General digital service"}*\nBudget: *${data.budget}*\nTimeline: *${data.timeline}*\n\nA Skill Forge representative will review your project details and reply here. The automated bot will stay out of this conversation for the next ${settings.humanHandoffHours} hours so our team can take over.\n\nType *MENU* at any time if you want to return to the automated bot.`
    );
  }
}

async function startHumanSupport(env,to,profileName){
  await updateSession(env,to,{
    supportDraft:{
      step:"issue",
      startedAt:new Date().toISOString(),
      whatsappName:profileName || null
    },
    quoteDraft:null,
    humanHandoffUntil:null,
    botMode:"bot",
    lastIntent:"human_support_request"
  });

  await sendText(
    env,
    to,
    "👤 *Speak with Skill Forge Support*\n\nPlease briefly describe what you need help with. A team member will take over after you send the details.\n\nType *CANCEL* to stop or *MENU* to return to the automated menu."
  );
}

async function handleSupportDraft(env,to,profileName,rawText){
  const text=(rawText || "").trim();
  const normalized=normalize(text);

  if(CANCEL_WORDS.has(normalized)){
    await updateSession(env,to,{supportDraft:null,lastIntent:"menu"});
    await sendText(env,to,"Human support request cancelled.");
    await safeMenu(env,to);
    return;
  }

  if(!text){
    await sendText(env,to,"Please type a short description of what you need help with.");
    return;
  }

  const settings=getSettings(env);
  const until=new Date(
    Date.now()+settings.humanHandoffHours*60*60*1000
  );

  const lead=await saveLead(env,{
    phone:to,
    name:profileName || null,
    intent:"human_support",
    message:text,
    handoffUntil:until.toISOString()
  });

  await updateSession(env,to,{
    supportDraft:null,
    quoteDraft:null,
    humanHandoffUntil:until.toISOString(),
    botMode:"human",
    lastIntent:"human_handoff",
    name:profileName || null
  });

  await setConversationState(env,to,{
    status:"open",
    botMode:"human",
    needsHuman:true,
    unreadCount:1,
    supportType:"human_support",
    reference:lead.id,
    customerName:profileName || null,
    latestRequest:{
      type:"human_support",
      message:text,
      reference:lead.id
    }
  });

  await sendText(
    env,
    to,
    `👤 *Human support requested*\n\nReference: *${lead.id}*\n\nYour message has been saved for a Skill Forge representative. A team member can now reply to you here.\n\nThe automated bot will stay out of the conversation for the next ${settings.humanHandoffHours} hours.\n\nType *MENU* at any time to return to the automated bot.`
  );
}

function numericMenu(text){
  return ({
    "1":"menu_courses",
    "2":"menu_services",
    "3":"menu_scholarship",
    "4":"menu_register",
    "5":"menu_cohort",
    "6":"menu_portfolio",
    "7":"menu_human"
  })[text.trim()] || null;
}

async function handleCommand(env,to,command,profileName,originalText){
  if(command==="menu_main"){
    await updateSession(env,to,{
      humanHandoffUntil:null,
      botMode:"bot",
      quoteDraft:null,
      supportDraft:null,
      lastIntent:"menu"
    });
    await setConversationState(env,to,{
      status:"open",
      botMode:"bot",
      needsHuman:false,
      assignedAdmin:null
    });
    return safeMenu(env,to);
  }

  if(command==="menu_courses"){
    await updateSession(env,to,{lastIntent:"courses"});
    return sendCourseMenu(env,to,courses);
  }

  if(command==="menu_services"){
    await updateSession(env,to,{quoteDraft:null,supportDraft:null,lastIntent:"services"});
    return sendServiceMenu(env,to,services);
  }

  if(command==="menu_scholarship"){
    await updateSession(env,to,{lastIntent:"scholarship"});
    return showScholarship(env,to);
  }

  if(command==="menu_register"){
    await updateSession(env,to,{lastIntent:"register"});
    return showRegistration(env,to);
  }

  if(command==="menu_cohort"){
    await updateSession(env,to,{lastIntent:"cohort"});
    return showCohort(env,to);
  }

  if(command==="menu_portfolio"){
    await updateSession(env,to,{lastIntent:"portfolio"});
    return showPortfolio(env,to);
  }

  if(command==="menu_human"){
    return startHumanSupport(env,to,profileName);
  }

  if(command==="service_quote" || command==="quote_general"){
    return startQuoteRequest(env,to,profileName);
  }

  if(command.startsWith("quote_service_")){
    const serviceId=command.replace("quote_","");
    const service=serviceById(serviceId);
    return startQuoteRequest(env,to,profileName,service || null);
  }

  const course=courseById(command);
  if(course){
    await updateSession(env,to,{lastIntent:course.id});
    return showCourse(env,to,course);
  }

  const service=serviceById(command);
  if(service){
    await updateSession(env,to,{lastIntent:service.id});
    return showService(env,to,service);
  }

  return false;
}

async function resolveAmbiguousCourseOrService(env,to,course,service){
  await sendReplyButtons(
    env,
    to,
    `I can help with *${course.title}* as a course, or *${service.title}* as a service. Which one do you mean?`,
    [
      {id:course.id,title:"I want to learn"},
      {id:service.id,title:"I want the service"},
      {id:"menu_main",title:"Main menu"}
    ]
  );
}

export async function handleIncoming(env,{from,profileName,message}){
  const rawText=messageText(message);
  const text=normalize(rawText);
  let session=await getSession(env,from);

  if(STOP_WORDS.has(text)){
    await updateSession(env,from,{
      optedOut:true,
      humanHandoffUntil:null,
      quoteDraft:null,
      supportDraft:null,
      lastIntent:"opted_out"
    });
    await sendText(
      env,
      from,
      "You have been opted out of automated Skill Forge replies. Type START BOT if you want to use the bot again."
    );
    return;
  }

  if(session.optedOut){
    if(RESUME_WORDS.has(text)){
      await updateSession(env,from,{
        optedOut:false,
        botMode:"bot",
        humanHandoffUntil:null,
        quoteDraft:null,
        supportDraft:null,
        lastIntent:"menu"
      });
      await setConversationState(env,from,{
        status:"open",
        botMode:"bot",
        needsHuman:false,
        assignedAdmin:null
      });
      await sendText(env,from,"Automated replies are active again ✅");
      await safeMenu(env,from);
    }
    return;
  }

  if(MENU_WORDS.has(text)){
    await updateSession(env,from,{
      humanHandoffUntil:null,
      botMode:"bot",
      quoteDraft:null,
      supportDraft:null,
      lastIntent:"menu"
    });
    await setConversationState(env,from,{
      status:"open",
      botMode:"bot",
      needsHuman:false,
      assignedAdmin:null,
      unreadCount:0
    });
    await safeMenu(env,from);
    return;
  }

  if(session.botMode==="human"){
    const handoffEnds=session.humanHandoffUntil
      ? new Date(session.humanHandoffUntil).getTime()
      : 0;

    if(handoffEnds>Date.now()){
      return;
    }

    await updateSession(env,from,{
      botMode:"bot",
      humanHandoffUntil:null
    });
    await setConversationState(env,from,{
      botMode:"bot",
      needsHuman:false,
      assignedAdmin:null
    });
    session=await getSession(env,from);
  }

  if(session.humanHandoffUntil && new Date(session.humanHandoffUntil).getTime()>Date.now()){
    return;
  }

  if(session.quoteDraft){
    await handleQuoteDraft(env,from,profileName,rawText,session);
    return;
  }

  if(session.supportDraft){
    await handleSupportDraft(env,from,profileName,rawText);
    return;
  }

  if(!rawText && !["text","interactive","button"].includes(message?.type)){
    await sendText(
      env,
      from,
      "I received your message. For now, please type what you need—for example *courses*, *website*, *scholarship*, *registration*, or *MENU*."
    );
    return;
  }

  const numeric=numericMenu(text);
  if(numeric){
    await handleCommand(env,from,numeric,profileName,rawText);
    return;
  }

  if(
    text.startsWith("menu_") ||
    text.startsWith("course_") ||
    text.startsWith("service_") ||
    text.startsWith("quote_")
  ){
    const handled=await handleCommand(env,from,text,profileName,rawText);
    if(handled!==false) return;
  }

  const mentionedCourse=findCourseInText(text);
  const mentionedService=findServiceInText(text);
  const courseCues=includesAny(text,[
    "course","learn","learning","training","class","student","fee","fees","tuition","package"
  ]);
  const serviceCues=includesAny(text,[
    "service","for my business","for our business","build for me","develop for me",
    "design for me","create for me","need a logo","need a flyer","quote","quotation",
    "client project","business website","business app"
  ]);

  if(mentionedCourse && mentionedService && !courseCues && !serviceCues){
    await resolveAmbiguousCourseOrService(env,from,mentionedCourse,mentionedService);
    return;
  }

  if(mentionedService && serviceCues){
    await showService(env,from,mentionedService);
    return;
  }

  if(mentionedCourse && courseCues){
    await showCourse(env,from,mentionedCourse);
    return;
  }

  if(mentionedCourse && mentionedService){
    await resolveAmbiguousCourseOrService(env,from,mentionedCourse,mentionedService);
    return;
  }

  if(mentionedService){
    await showService(env,from,mentionedService);
    return;
  }

  if(mentionedCourse){
    await showCourse(env,from,mentionedCourse);
    return;
  }

  if(includesAny(text,[
    "course","courses","training","learn","class","fees","fee","tuition","course price","course pricing"
  ])){
    await sendCourseMenu(env,from,courses);
    return;
  }

  if(includesAny(text,[
    "service","services","build for me","develop for me","digital services"
  ])){
    await sendServiceMenu(env,from,services);
    return;
  }

  if(includesAny(text,["quote","quotation","request quote","get a quote","estimate"])){
    await startQuoteRequest(env,from,profileName);
    return;
  }

  if(includesAny(text,["scholarship","sponsor","sponsorship","discount","100%"])){
    await showScholarship(env,from);
    return;
  }

  if(includesAny(text,["register","registration","join","enroll","enrol","sign up"])){
    await showRegistration(env,from);
    return;
  }

  if(includesAny(text,["cohort","start date","next class","class start","schedule","when is the next"])){
    await showCohort(env,from);
    return;
  }

  if(includesAny(text,["portfolio","project","projects","previous work","work sample","samples"])){
    await showPortfolio(env,from);
    return;
  }

  if(includesAny(text,[
    "human","person","agent","representative","speak to","talk to","customer care","support"
  ])){
    await startHumanSupport(env,from,profileName);
    return;
  }

  if(isGreeting(text)){
    await safeMenu(env,from);
    return;
  }

  await sendReplyButtons(
    env,
    from,
    "I can help with Skill Forge courses and fees, scholarships, registration, digital services, project examples, upcoming cohort information, quote requests, or human support.\n\nChoose an option below or type *MENU*.",
    [
      {id:"menu_courses",title:"Courses"},
      {id:"menu_services",title:"Services"},
      {id:"menu_human",title:"Human support"}
    ]
  );
}
