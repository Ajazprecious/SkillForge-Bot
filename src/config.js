export const settings = {
  academyName: "Skill Forge Academy",
  academyUrl: process.env.ACADEMY_URL || "https://skillforgeacademy-7xln.onrender.com",
  groupUrl: process.env.WHATSAPP_GROUP_URL || "https://chat.whatsapp.com/GbG1r1d1VcnKVWQkOwOr1t?s=cl&p=a&mlu=4&ilr=4",
  directWhatsApp: process.env.BUSINESS_WHATSAPP_URL || "https://wa.me/2349062206231",
  scholarshipText: "Scholarships of up to 100% may be available for selected cohorts and limited slots. Availability is confirmed per cohort.",
  humanHandoffHours: Number(process.env.HUMAN_HANDOFF_HOURS || 12),
};

export const courses = [
  {id:"course_forex",title:"Forex Trading",menuTitle:"Forex Trading",aliases:["forex","trading","fx"],pricing:"Beginner $15 | Full Course $50 | VIP / Elite $75",description:"Learn currency-market foundations, market structure, risk management, trading psychology, session timing and disciplined trading plans.",path:"/courses/forex.html"},
  {id:"course_ai",title:"Artificial Intelligence (AI)",menuTitle:"Artificial Intelligence",aliases:["ai","artificial intelligence","chatgpt"],pricing:"Beginner ₦15,000 | Full Course ₦50,000 | VIP / Elite ₦75,000",description:"Learn AI fundamentals, better prompting, research and verification, productivity workflows and practical AI use.",path:"/courses/ai-tools.html"},
  {id:"course_graphics",title:"Graphics Design",menuTitle:"Graphics Design",aliases:["graphics","graphic design","graphics design"],pricing:"Beginner ₦15,000 | Full Course ₦50,000 | VIP / Elite ₦75,000",description:"Learn colour, typography, layout, branding and social-media graphics through practical projects.",path:"/courses/graphics-design.html"},
  {id:"course_uiux",title:"UI/UX Design",menuTitle:"UI/UX Design",aliases:["ui","ux","uiux","ui/ux","ui/ux design","figma"],pricing:"Beginner ₦21,000 | Full Course ₦70,000 | VIP / Elite ₦105,000",description:"Learn user flows, wireframes, interface design, prototyping and usability for web and mobile products.",path:"/courses/ui-ux-design.html"},
  {id:"course_web",title:"Web Design & Development",menuTitle:"Web Development",aliases:["web design","web development","web course","web development course","web design course","coding","html","css","javascript"],pricing:"Beginner ₦30,000 | Full Course ₦100,000 | VIP / Elite ₦150,000",description:"Build responsive websites with HTML, CSS, JavaScript, Git/GitHub and deployment basics.",path:"/courses/web-development.html"},
  {id:"course_editing",title:"Video & Photo Editing",menuTitle:"Video & Photo Editing",aliases:["video editing","photo editing","editing course","video course","photo course","video and photo editing"],pricing:"Beginner ₦15,000 | Full Course ₦50,000 | VIP / Elite ₦75,000",description:"Learn composition, video pacing, colour correction, audio basics and platform-ready exports.",path:"/courses/editing.html"}
];

export const services = [
  {id:"service_web",title:"Website Development",menuTitle:"Website Development",aliases:["website","web design","web development","ecommerce","e-commerce","landing page"],price:"Current catalogue offer: from ₦200,000",description:"Modern responsive websites, business websites, e-commerce stores, portfolios, landing pages and custom web platforms."},
  {id:"service_mobile",title:"Mobile App Development",menuTitle:"Mobile App Development",aliases:["mobile app","mobile application","app development","android app","ios app"],price:"Current catalogue offer: from ₦500,000",description:"Android and iOS app solutions, including authentication, dashboards, notifications and API/database integration."},
  {id:"service_graphics",title:"Graphics Design & Photo Editing",menuTitle:"Graphics & Photo Editing",aliases:["graphic design","graphics design","graphics","logo","branding","flyer","poster","photo editing","retouch"],price:"Price depends on the design package and quantity.",description:"Logos, flyers, posters, social-media designs, brand identity materials, retouching and creative photo edits."},
  {id:"service_video",title:"Video Editing",menuTitle:"Video Editing",aliases:["video editing","reels","promo video","motion","video"],price:"Price depends on video length, complexity and turnaround time.",description:"Professional editing for promos, reels, ads, YouTube and social-media content, including cuts, colour, audio, titles and transitions."},
  {id:"service_uiux",title:"UI/UX Design",menuTitle:"UI/UX Design",aliases:["ui","ux","uiux","ui/ux","ui design","ux design","ui/ux design","ui/ux service","figma design","prototype"],price:"Custom quote based on number of screens and project scope.",description:"Wireframes, user flows, high-fidelity interface designs and clickable prototypes for websites and mobile apps."}
];

export const portfolio = [
  {name:"SIWES Connect",url:process.env.SIWES_CONNECT_URL || "https://siwes-connect-gzlj.onrender.com",description:"A SIWES placement platform for students and organizations."},
  {name:"Merry Gold",url:process.env.MERRY_GOLD_URL || "https://merrygoldstore.online",description:"An e-commerce storefront and admin-managed online store."},
  {name:"Skill Forge Academy",url:process.env.ACADEMY_URL || "https://skillforgeacademy-7xln.onrender.com",description:"The Skill Forge course catalogue and learning-resource website."}
];

export const courseById = (id) => courses.find((course) => course.id === id);
export const serviceById = (id) => services.find((service) => service.id === id);

function aliasMatches(text, alias) {
  if (/^[a-z0-9]+$/i.test(alias) && alias.length <= 3) {
    return text.split(/\s+/).includes(alias.toLowerCase());
  }
  return text.includes(alias.toLowerCase());
}

export function findCourseInText(text="") {
  const normalized=text.toLowerCase();
  return courses.find((course)=>course.aliases.some((alias)=>aliasMatches(normalized,alias)));
}

export function findServiceInText(text="") {
  const normalized=text.toLowerCase();
  return services.find((service)=>service.aliases.some((alias)=>aliasMatches(normalized,alias)));
}
