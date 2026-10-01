function base64UrlEncode(text){
  const bytes=new TextEncoder().encode(text);
  let binary="";
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function base64UrlDecode(value){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret,text){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");
}

function constantTimeEqual(a,b){
  if(typeof a!=="string" || typeof b!=="string" || a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function parseCookies(request){
  const raw=request.headers.get("cookie") || "";
  return Object.fromEntries(
    raw.split(";")
      .map((part)=>part.trim())
      .filter(Boolean)
      .map((part)=>{
        const index=part.indexOf("=");
        return index<0 ? [part,""] : [part.slice(0,index),decodeURIComponent(part.slice(index+1))];
      })
  );
}

function getAdminUsers(env){
  if(env.ADMIN_USERS){
    try{
      const parsed=JSON.parse(env.ADMIN_USERS);
      if(parsed && typeof parsed==="object" && !Array.isArray(parsed)) return parsed;
    } catch(error){
      console.error("ADMIN_USERS must be valid JSON:",error?.message || error);
    }
  }

  if(env.ADMIN_USERNAME && env.ADMIN_PASSWORD){
    return {[String(env.ADMIN_USERNAME)]:String(env.ADMIN_PASSWORD)};
  }

  if(env.ADMIN_PASSWORD){
    return {admin:String(env.ADMIN_PASSWORD)};
  }

  return {};
}

export function adminConfigured(env){
  return Object.keys(getAdminUsers(env)).length>0 && Boolean(env.ADMIN_SESSION_SECRET);
}

export async function createAdminSession(env,username,password){
  const users=getAdminUsers(env);
  const expected=users[username];

  if(!expected || !constantTimeEqual(String(expected),String(password || ""))){
    return null;
  }

  if(!env.ADMIN_SESSION_SECRET) return null;

  const payload={
    username,
    exp:Date.now()+12*60*60*1000
  };

  const encoded=base64UrlEncode(JSON.stringify(payload));
  const signature=await hmacHex(env.ADMIN_SESSION_SECRET,encoded);
  return encoded+"."+signature;
}

export async function getAdminFromRequest(request,env){
  if(!env.ADMIN_SESSION_SECRET) return null;

  const token=parseCookies(request).sf_admin_session;
  if(!token) return null;

  const parts=token.split(".");
  const encoded=parts[0];
  const signature=parts[1];
  if(!encoded || !signature) return null;

  const expected=await hmacHex(env.ADMIN_SESSION_SECRET,encoded);
  if(!constantTimeEqual(signature,expected)) return null;

  try{
    const payload=JSON.parse(base64UrlDecode(encoded));
    if(!payload?.username || !payload?.exp || payload.exp<Date.now()) return null;
    const users=getAdminUsers(env);
    if(!Object.prototype.hasOwnProperty.call(users,payload.username)) return null;
    return {username:payload.username,exp:payload.exp};
  } catch{
    return null;
  }
}

export function adminSessionCookie(token){
  return "sf_admin_session="+encodeURIComponent(token)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200";
}

export function clearAdminSessionCookie(){
  return "sf_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

export function adminPage(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skill Forge Support Inbox</title>
<style>
:root{--bg:#f5f7fb;--panel:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--brand:#0f5132;--brand2:#198754;--danger:#b42318;--warning:#b45309}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
button,input,textarea{font:inherit}button{cursor:pointer}.hidden{display:none!important}
#loginView{min-height:100vh;display:grid;place-items:center;padding:24px}.login-card{width:min(420px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(15,23,42,.08)}
.login-card h1{margin:0 0 6px;font-size:24px}.login-card p{margin:0 0 22px;color:var(--muted)}label{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}
input,textarea{width:100%;border:1px solid #d1d5db;border-radius:10px;padding:11px 12px;background:#fff;outline:none}input:focus,textarea:focus{border-color:var(--brand2);box-shadow:0 0 0 3px rgba(25,135,84,.12)}
.btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700}.btn-primary{background:var(--brand);color:#fff}.btn-light{background:#f3f4f6;color:#111827}.btn-danger{background:#fee4e2;color:var(--danger)}.btn-warning{background:#fff7ed;color:var(--warning)}
.login-card .btn{width:100%;margin-top:18px}.error{color:var(--danger);font-size:13px;margin-top:12px}
#appView{height:100vh;display:grid;grid-template-columns:360px 1fr}.sidebar{background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-width:0}
.sidebar-head{padding:18px;border-bottom:1px solid var(--line)}.brand-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand-row h1{font-size:18px;margin:0}.admin-name{font-size:12px;color:var(--muted)}
.search{margin-top:14px}.filters{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.filter{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 10px;font-size:12px}.filter.active{background:#ecfdf3;border-color:#a6f4c5;color:#067647}
.conversation-list{overflow:auto;flex:1}.conversation-item{padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:8px}.conversation-item:hover,.conversation-item.active{background:#f8fafc}
.c-name{font-weight:800}.c-phone,.c-preview,.c-time{font-size:12px;color:var(--muted)}.c-preview{margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}
.badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.badge{font-size:10px;border-radius:999px;padding:3px 7px;background:#eef2ff;color:#3730a3}.badge.human{background:#fff7ed;color:#b45309}.badge.unread{background:#ecfdf3;color:#067647}
.main{display:flex;flex-direction:column;min-width:0}.empty{height:100%;display:grid;place-items:center;color:var(--muted);padding:30px;text-align:center}
.chat-head{background:var(--panel);border-bottom:1px solid var(--line);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px}.chat-title h2{margin:0;font-size:18px}.chat-title p{margin:3px 0 0;color:var(--muted);font-size:12px}
.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.request-card{margin:12px 18px 0;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;font-size:13px}.request-card strong{display:block;margin-bottom:5px}
.messages{flex:1;overflow:auto;padding:20px;background:#efeae2}.message-row{display:flex;margin:7px 0}.message-row.in{justify-content:flex-start}.message-row.out{justify-content:flex-end}
.bubble{max-width:min(72%,720px);padding:9px 11px;border-radius:12px;box-shadow:0 1px 1px rgba(0,0,0,.08);white-space:pre-wrap;word-break:break-word}.message-row.in .bubble{background:#fff;border-top-left-radius:3px}.message-row.out .bubble{background:#d9fdd3;border-top-right-radius:3px}.meta{font-size:10px;color:#667085;margin-top:5px;text-align:right}
.composer{background:var(--panel);border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:10px;align-items:flex-end}.composer textarea{resize:none;min-height:44px;max-height:130px}.composer .btn{min-width:88px}
.notice{padding:8px 12px;background:#eff8ff;color:#175cd3;font-size:12px;border-bottom:1px solid #b2ddff}
@media(max-width:820px){#appView{grid-template-columns:1fr}.sidebar{height:100vh}.main{position:fixed;inset:0;background:var(--bg);display:none}.main.mobile-open{display:flex}.back-mobile{display:inline-block!important}.bubble{max-width:86%}}
@media(min-width:821px){.back-mobile{display:none!important}}
</style>
</head>
<body>
<div id="loginView">
<form class="login-card" id="loginForm">
<h1>Skill Forge Support</h1>
<p>Admin inbox for WhatsApp customer conversations.</p>
<label>Username</label><input id="loginUsername" autocomplete="username" required>
<label>Password</label><input id="loginPassword" type="password" autocomplete="current-password" required>
<button class="btn btn-primary" id="loginBtn" type="submit">Sign in</button>
<div id="loginStatus" style="font-size:12px;color:#6b7280;margin-top:12px"></div>
<div id="loginError" class="error"></div>
</form>
</div>

<div id="appView" class="hidden">
<aside class="sidebar">
<div class="sidebar-head">
<div class="brand-row"><div><h1>Skill Forge Inbox</h1><div class="admin-name">Signed in as <span id="adminName"></span></div></div><button class="btn btn-light" id="logoutBtn">Logout</button></div>
<input class="search" id="searchBox" placeholder="Search name, number, message...">
<div class="filters"><button class="filter active" data-filter="all">All</button><button class="filter" data-filter="human">Needs human</button><button class="filter" data-filter="mine">Assigned to me</button><button class="filter" data-filter="closed">Closed</button></div>
</div>
<div class="conversation-list" id="conversationList"></div>
</aside>

<main class="main" id="mainPane">
<div class="empty" id="emptyState">Select a conversation to view messages.</div>
<div id="chatView" class="hidden" style="height:100%;display:flex;flex-direction:column">
<div class="chat-head">
<div class="chat-title"><button class="btn btn-light back-mobile" id="backBtn">← Back</button><h2 id="chatName"></h2><p id="chatDetails"></p></div>
<div class="actions"><button class="btn btn-light" id="assignBtn">Assign to me</button><button class="btn btn-warning" id="takeoverBtn">Take over</button><button class="btn btn-light" id="returnBotBtn">Return to bot</button><button class="btn btn-danger" id="closeBtn">Close</button></div>
</div>
<div id="requestCard" class="request-card hidden"></div>
<div class="messages" id="messages"></div>
<div class="notice" id="modeNotice"></div>
<form class="composer" id="replyForm"><textarea id="replyText" placeholder="Type a reply as Skill Forge..." required></textarea><button class="btn btn-primary" type="submit">Send</button></form>
</div>
</main>
</div>

<script>
var state={admin:null,conversations:[],selected:null,filter:"all",poll:null};

function esc(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(c){
    if(c==="&") return "&amp;";
    if(c==="<") return "&lt;";
    if(c===">") return "&gt;";
    if(c.charCodeAt(0)===34) return "&quot;";
    return "&#39;";
  });
}
function formatTime(value){
  if(!value)return "";
  try{return new Date(value).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){return "";}
}
async function api(path,options){
  options=options||{};
  var response=await fetch(path,Object.assign({},options,{headers:Object.assign({"content-type":"application/json"},options.headers||{})}));
  var data=await response.json().catch(function(){return {};});
  if(response.status===401){showLogin();throw new Error("Session expired");}
  if(!response.ok)throw new Error(data.error||"Request failed");
  return data;
}
function showLogin(){document.getElementById("loginView").classList.remove("hidden");document.getElementById("appView").classList.add("hidden");}
function showApp(){document.getElementById("loginView").classList.add("hidden");document.getElementById("appView").classList.remove("hidden");document.getElementById("adminName").textContent=state.admin;}
async function boot(){
  showLogin();

  try{
    var status=await fetch("/api/admin/status",{cache:"no-store"}).then(function(r){return r.json();});
    var statusEl=document.getElementById("loginStatus");
    if(!status.adminConfigured){
      statusEl.textContent="Admin login is not configured yet in Cloudflare.";
      statusEl.style.color="#b42318";
    }else if(!status.kvBound){
      statusEl.textContent="Admin login is configured, but BOT_STATE KV is not connected.";
      statusEl.style.color="#b45309";
    }else{
      statusEl.textContent="Admin login is ready.";
      statusEl.style.color="#067647";
    }
  }catch(e){
    document.getElementById("loginStatus").textContent="Could not check admin configuration.";
  }

  try{
    var me=await api("/api/admin/me");
    state.admin=me.username;showApp();await loadConversations();state.poll=setInterval(loadConversations,5000);
  }catch(e){}
}

document.getElementById("loginForm").addEventListener("submit",async function(e){
  e.preventDefault();
  var username=document.getElementById("loginUsername").value.trim();
  var password=document.getElementById("loginPassword").value;
  var errorEl=document.getElementById("loginError");
  var button=document.getElementById("loginBtn");

  errorEl.textContent="";
  if(!username || !password){
    errorEl.textContent="Enter both username and password.";
    return;
  }

  button.disabled=true;
  button.textContent="Signing in...";

  try{
    var result=await api("/api/admin/login",{
      method:"POST",
      body:JSON.stringify({username:username,password:password})
    });

    state.admin=result.username;
    showApp();
    await loadConversations();

    if(state.poll)clearInterval(state.poll);
    state.poll=setInterval(loadConversations,5000);
  }catch(error){
    errorEl.textContent=error.message || "Login failed.";
  }finally{
    button.disabled=false;
    button.textContent="Sign in";
  }
});
document.getElementById("logoutBtn").onclick=async function(){await fetch("/api/admin/logout",{method:"POST"});location.reload();};
document.querySelectorAll(".filter").forEach(function(button){button.onclick=function(){state.filter=button.dataset.filter;document.querySelectorAll(".filter").forEach(function(b){b.classList.toggle("active",b===button);});renderConversations();};});
document.getElementById("searchBox").oninput=renderConversations;

async function loadConversations(){
  if(!state.admin)return;
  try{
    var result=await api("/api/admin/conversations");
    state.conversations=result.conversations||[];renderConversations();
    if(state.selected){var fresh=state.conversations.find(function(c){return c.phone===state.selected.phone;});if(fresh)state.selected=Object.assign({},state.selected,fresh);}
  }catch(error){console.error(error);}
}
function filteredConversations(){
  var q=document.getElementById("searchBox").value.trim().toLowerCase();
  return state.conversations.filter(function(c){
    if(state.filter==="human"&&!c.needsHuman)return false;
    if(state.filter==="mine"&&c.assignedAdmin!==state.admin)return false;
    if(state.filter==="closed"&&c.status!=="closed")return false;
    if(state.filter!=="closed"&&state.filter!=="all"&&c.status==="closed")return false;
    if(!q)return true;
    return [c.customerName,c.phone,c.lastMessage,c.assignedAdmin,c.reference].filter(Boolean).some(function(value){return String(value).toLowerCase().includes(q);});
  });
}
function renderConversations(){
  var list=document.getElementById("conversationList");
  var rows=filteredConversations();
  if(!rows.length){list.innerHTML='<div style="padding:24px;color:#6b7280">No conversations found.</div>';return;}
  list.innerHTML=rows.map(function(c){
    var badges="";
    if(c.needsHuman)badges+='<span class="badge human">Needs human</span>';
    if(c.botMode==="human")badges+='<span class="badge human">Bot paused</span>';
    if(c.assignedAdmin)badges+='<span class="badge">Assigned: '+esc(c.assignedAdmin)+'</span>';
    if(Number(c.unreadCount)>0)badges+='<span class="badge unread">'+Number(c.unreadCount)+' new</span>';
    if(c.status==="closed")badges+='<span class="badge">Closed</span>';
    return '<div class="conversation-item '+(state.selected&&state.selected.phone===c.phone?"active":"")+'" data-phone="'+esc(c.phone)+'">'
      +'<div><div class="c-name">'+esc(c.customerName||c.phone)+'</div><div class="c-phone">'+esc(c.phone)+'</div>'
      +'<div class="c-preview">'+esc(c.lastMessage||"No messages yet")+'</div><div class="badges">'+badges+'</div></div>'
      +'<div class="c-time">'+esc(formatTime(c.lastAt))+'</div></div>';
  }).join("");
  list.querySelectorAll(".conversation-item").forEach(function(item){item.onclick=function(){openConversation(item.dataset.phone);};});
}
async function openConversation(phone){
  var result=await api("/api/admin/conversations/"+encodeURIComponent(phone));
  state.selected=result.conversation;
  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  document.getElementById("mainPane").classList.add("mobile-open");
  renderChat(result.conversation,result.messages||[]);
  await api("/api/admin/conversations/"+encodeURIComponent(phone)+"/read",{method:"POST"});
  await loadConversations();
}
function renderChat(c,messages){
  document.getElementById("chatName").textContent=c.customerName||c.phone;
  document.getElementById("chatDetails").textContent=c.phone+" • "+(c.status||"open")+" • "+(c.assignedAdmin?"Assigned to "+c.assignedAdmin:"Unassigned");
  document.getElementById("modeNotice").textContent=c.botMode==="human"
    ?"Human mode is active. The bot will not reply to this customer until you return the conversation to the bot."
    :"Bot mode is active. Automated replies can respond to the customer.";

  var request=document.getElementById("requestCard");
  if(c.latestRequest){
    var r=c.latestRequest;
    var html="<strong>"+esc(r.type==="quote"?"Quote request":"Human support request")+" • "+esc(r.reference||"")+"</strong>";
    if(r.service)html+="Service: "+esc(r.service)+"<br>";
    if(r.description)html+="Project: "+esc(r.description)+"<br>";
    if(r.budget)html+="Budget: "+esc(r.budget)+"<br>";
    if(r.timeline)html+="Timeline: "+esc(r.timeline)+"<br>";
    if(r.message)html+="Request: "+esc(r.message);
    request.innerHTML=html;request.classList.remove("hidden");
  }else request.classList.add("hidden");

  var box=document.getElementById("messages");
  box.innerHTML=messages.map(function(m){
    var who=m.source==="admin"?(m.adminName||"Admin"):(m.source==="bot"?"Bot":"Customer");
    return '<div class="message-row '+(m.direction==="out"?"out":"in")+'"><div class="bubble">'+esc(m.text)
      +'<div class="meta">'+esc(who)+' • '+esc(formatTime(m.createdAt))+'</div></div></div>';
  }).join("");
  box.scrollTop=box.scrollHeight;
}
document.getElementById("backBtn").onclick=function(){document.getElementById("mainPane").classList.remove("mobile-open");};

async function action(path,body){
  if(!state.selected)return;
  body=body||{};
  try{
    await api("/api/admin/conversations/"+encodeURIComponent(state.selected.phone)+path,{method:"POST",body:JSON.stringify(body)});
    await openConversation(state.selected.phone);
  }catch(error){alert(error.message);}
}
document.getElementById("assignBtn").onclick=function(){action("/assign");};
document.getElementById("takeoverBtn").onclick=function(){action("/takeover");};
document.getElementById("returnBotBtn").onclick=function(){action("/return-to-bot");};
document.getElementById("closeBtn").onclick=function(){if(confirm("Close this conversation and return it to bot mode?"))action("/close");};
document.getElementById("replyForm").addEventListener("submit",async function(e){
  e.preventDefault();
  if(!state.selected)return;
  var textarea=document.getElementById("replyText");
  var text=textarea.value.trim();
  if(!text)return;
  textarea.disabled=true;
  try{await action("/reply",{text:text});textarea.value="";}finally{textarea.disabled=false;textarea.focus();}
});
boot();
</script>
</body>
</html>`;
}
