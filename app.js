let db = {};
let selectedDate = null;
let visibility = {};
let pendingChecks = {};

const monthNames=["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
const weekdayNames=["H","K","Sze","Cs","P","Szo","V"];
const catClass={"Általános":"cat-altalanos","Gyógyszer":"cat-gyogyszer","Csere":"cat-csere","Tilos":"cat-tilos"};

const API = () => window.LIFE_CALENDAR_API.replace(/\/$/,"");

function isoToday(){return new Date().toLocaleDateString("sv-SE")}
function parseISO(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function latestDate(item){return item.dates?.length?[...item.dates].sort().at(-1):null}
function allItems(){return Object.entries(db).flatMap(([category,items])=>Object.entries(items).map(([name,item])=>({category,name,item})))}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

const SESSION_KEY = "life_calendar_session";

async function api(path, options={}) {
  const token = localStorage.getItem(SESSION_KEY);

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(API() + path, {
    ...options,
    headers
  });

  if (res.status === 401) {
    localStorage.removeItem(SESSION_KEY);
    showLogin();
    throw new Error("unauthorized");
  }

  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {message: text};
  }

  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function showLogin(){
  document.getElementById("appScreen").classList.add("app-hidden");
  document.getElementById("loginScreen").style.display="grid";
  document.getElementById("passwordInput").focus();
}
function showApp(){
  document.getElementById("loginScreen").style.display="none";
  document.getElementById("appScreen").classList.remove("app-hidden");
}

async function login(password) {
  const btn = document.getElementById("loginBtn");
  const msg = document.getElementById("loginMessage");

  btn.disabled = true;
  msg.textContent = "";

  try {
    const result = await api("/login", {
      method: "POST",
      body: JSON.stringify({password})
    });

    localStorage.setItem(SESSION_KEY, result.token);

    document.getElementById("passwordInput").value = "";

    showApp();
    await loadData();

  } catch (e) {
    msg.textContent = e.message || "Login failed.";
  } finally {
    btn.disabled = false;
  }
}

async function loadData(){
  const result=await api("/data");
  db=result.data;
  visibility={};
  allItems().forEach(({category,name})=>visibility[`${category}::${name}`]=true);
  selectedDate=isoToday();
  document.getElementById("todayPill").textContent=`Ma · ${selectedDate}`;
  renderSidebar();renderCalendar();renderSelectedDay();renderOverdue();
}

function renderSidebar(){
 const box=document.getElementById("sidebarContent");
 box.innerHTML=Object.entries(db).map(([category,items])=>`
 <section class="category"><div class="category-title">${esc(category)}</div>
 ${Object.entries(items).map(([name,item])=>{
  const key=`${category}::${name}`, latest=latestDate(item);
  return `<div class="task-row">
   <label class="switch"><input type="checkbox" ${visibility[key]?"checked":""} data-key="${esc(key)}"><span class="slider"></span></label>
   <label class="task-label" data-toggle-key="${esc(key)}">${esc(name)}<span class="latest">${latest||"—"}</span></label>
  </div>`;
 }).join("")}</section>`).join("");
 box.querySelectorAll("input[data-key]").forEach(i=>i.addEventListener("change",e=>{visibility[e.target.dataset.key]=e.target.checked;renderCalendar()}));
}

function getMonthRange(){
 const dates=allItems().flatMap(x=>x.item.dates||[]).sort();
 const min=dates.length?parseISO(dates[0]):new Date(), now=new Date();
 let cur=new Date(min.getFullYear(),min.getMonth(),1), end=new Date(now.getFullYear(),now.getMonth(),1), out=[];
 while(cur<=end){out.push(new Date(cur));cur=new Date(cur.getFullYear(),cur.getMonth()+1,1)} return out;
}
function itemsForDate(iso){return allItems().filter(({category,name,item})=>visibility[`${category}::${name}`]&&(item.dates||[]).includes(iso))}

function renderCalendar(){
 const root=document.getElementById("calendar");root.innerHTML=getMonthRange().map(renderMonth).join("");
 root.querySelectorAll(".day:not(.empty)").forEach(b=>b.addEventListener("click",()=>{selectedDate=b.dataset.date;renderCalendar();renderSelectedDay();document.getElementById("selectedDayPanel").scrollIntoView({behavior:"smooth",block:"start"})}));
}
function renderMonth(first){
 const y=first.getFullYear(),m=first.getMonth(),days=new Date(y,m+1,0).getDate(),offset=(new Date(y,m,1).getDay()+6)%7;
 let cells=Array(offset).fill(`<div class="day empty"></div>`);
 for(let d=1;d<=days;d++){
  const iso=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const cls=`day ${iso===selectedDate?"selected":""} ${iso===isoToday()?"today":""}`;
  const tasks=itemsForDate(iso).map(({category,name})=>`<span class="task-chip ${catClass[category]||""}" title="${esc(name)}">${esc(name)}</span>`).join("");
  cells.push(`<button class="${cls}" data-date="${iso}"><span class="day-num">${d}</span><span class="task-stack">${tasks}</span></button>`);
 }
 return `<section class="month"><div class="month-title"><h2>${monthNames[m]} ${y}</h2><span>${days} nap</span></div><div class="weekdays">${weekdayNames.map(x=>`<div class="weekday">${x}</div>`).join("")}</div><div class="days-grid">${cells.join("")}</div></section>`;
}
function renderSelectedDay(){
 const panel=document.getElementById("selectedDayPanel");panel.classList.remove("hidden");pendingChecks={};
 panel.innerHTML=`<div class="panel-head"><div><div class="eyebrow">SELECTED DAY</div><h2>${selectedDate}</h2></div><div class="actions"><button class="action-btn danger" id="cancelBtn">Cancel</button><button class="action-btn primary" id="saveBtn">Save</button></div></div>
 ${Object.entries(db).map(([category,items])=>`<section class="detail-category"><h3>${esc(category)}</h3>${Object.entries(items).map(([name,item])=>{const done=(item.dates||[]).includes(selectedDate);pendingChecks[`${category}::${name}`]=done;return `<label class="detail-row"><input type="checkbox" data-detail-key="${esc(category+"::"+name)}" ${done?"checked":""}><span>${esc(name)}</span></label>`}).join("")}</section>`).join("")}`;
 panel.querySelectorAll("input[data-detail-key]").forEach(cb=>cb.addEventListener("change",e=>pendingChecks[e.target.dataset.detailKey]=e.target.checked));
 document.getElementById("cancelBtn").onclick=renderSelectedDay;document.getElementById("saveBtn").onclick=saveSelectedDay;
}
async function saveSelectedDay(){
 Object.entries(pendingChecks).forEach(([key,done])=>{const [category,...rest]=key.split("::"),name=rest.join("::"),item=db[category][name],dates=new Set(item.dates||[]);done?dates.add(selectedDate):dates.delete(selectedDate);item.dates=[...dates].sort()});
 renderSidebar();renderCalendar();renderSelectedDay();renderOverdue();
}
async function savePage(){
 const btn=document.getElementById("savePageBtn");btn.disabled=true;btn.textContent="Saving…";
 try{await api("/data",{method:"PUT",body:JSON.stringify({data:db})});alert("Saved.");}
 catch(e){alert(e.message||"Save failed.")}finally{btn.disabled=false;btn.textContent="Save page"}
}
function renderOverdue(){
 const panel=document.getElementById("overduePanel"),today=parseISO(isoToday());
 const overdue=allItems().map(({category,name,item})=>{const last=latestDate(item);if(!last||!Number.isFinite(item.frequency))return null;const due=parseISO(last);due.setDate(due.getDate()+Number(item.frequency));const days=Math.floor((today-due)/86400000);return days>0?{name,days}:null}).filter(Boolean).sort((a,b)=>b.days-a.days);
 panel.innerHTML=`<h2 class="overdue-title">Overdue:</h2>${overdue.length?overdue.map(x=>`<div class="overdue-item"><span>${esc(x.name)}</span><span class="overdue-days">${x.days} day${x.days===1?"":"s"}</span></div>`).join(""):`<p class="empty-note">Nincs lejárt, gyakorisággal rendelkező feladat.</p>`}`;
}

document.getElementById("loginForm").addEventListener("submit",e=>{e.preventDefault();login(document.getElementById("passwordInput").value)});
document.getElementById("savePageBtn").onclick=savePage;
document.getElementById("logoutBtn").onclick = async () => {
  localStorage.removeItem(SESSION_KEY);

  try {
    await api("/logout", {method: "POST"});
  } catch {}

  showLogin();
};
document.getElementById("toggleAll").onclick=()=>{const keys=Object.keys(visibility),showAll=keys.some(k=>!visibility[k]);keys.forEach(k=>visibility[k]=showAll);document.getElementById("toggleAll").textContent=showAll?"Hide all":"Display all";renderSidebar();renderCalendar()};
document.getElementById("openSidebar").onclick=()=>document.getElementById("sidebar").classList.add("open");
document.getElementById("closeSidebar").onclick=()=>document.getElementById("sidebar").classList.remove("open");

(async()=>{try{await api("/session");showApp();await loadData()}catch{showLogin()}})();
