let db = {};
let selectedDate = null;
let selectedProfile = "K";
let autoSaveTimer = null;
let autoSaveInFlight = null;

const monthNames=["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
const weekdayNames=["H","K","Sze","Cs","P","Szo","V"];
const catClass={"Közös":"cat-kozos","Fürdő":"cat-furdo","Konyha":"cat-konyha","D":"cat-d","G":"cat-g","Gyógyszer":"cat-gyogyszer","Tilos":"cat-tilos"};

// Which real data.json categories belong to which profile tab.
const PROFILES={
 G:["G","Gyógyszer","Tilos"],
 D:["D"],
 K:["Közös","Fürdő","Konyha"]
};

const API = () => window.LIFE_CALENDAR_API.replace(/\/$/,"");

function isoToday(){return new Date().toLocaleDateString("sv-SE")}
function parseISO(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function latestDate(item){return item.dates?.length?[...item.dates].sort().at(-1):null}

// "_archived" is never iterated here, so archived items are automatically
// invisible to the calendar, checklist and overdue panel everywhere in the app.
function allItems(){
 return Object.entries(db)
  .filter(([category])=>category!=="_archived")
  .flatMap(([category,items])=>Object.entries(items).map(([name,item])=>({category,name,item})));
}
function profileItems(profile){
 const cats=PROFILES[profile]||[];
 return allItems().filter(({category})=>cats.includes(category));
}
function profileCategories(profile){
 return (PROFILES[profile]||[]).filter(c=>db[c]).map(c=>[c,db[c]]);
}

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
  if(!db._archived)db._archived={};
  selectedDate=isoToday();
  document.getElementById("todayPill").textContent=`Ma · ${selectedDate}`;
  renderProfilePicker();renderCalendar();renderSelectedDay();renderOverdue();
}

function renderProfilePicker(){
 document.querySelectorAll(".profile-circle").forEach(btn=>{
  btn.classList.toggle("active",btn.dataset.profile===selectedProfile);
 });
}
function selectProfile(profile){
 selectedProfile=profile;
 renderProfilePicker();renderCalendar();renderSelectedDay();
}

function getMonthRange(){
 const dates=allItems().flatMap(x=>x.item.dates||[]).sort();
 const min=dates.length?parseISO(dates[0]):new Date(), now=new Date();
 let cur=new Date(min.getFullYear(),min.getMonth(),1), end=new Date(now.getFullYear(),now.getMonth(),1), out=[];
 while(cur<=end){out.push(new Date(cur));cur=new Date(cur.getFullYear(),cur.getMonth()+1,1)} return out;
}
function itemsForDate(iso){return profileItems(selectedProfile).filter(({item})=>(item.dates||[]).includes(iso))}

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
 const panel=document.getElementById("selectedDayPanel");panel.classList.remove("hidden");
 panel.innerHTML=`<div class="panel-head"><div><div class="eyebrow">SELECTED DAY · ${esc(selectedProfile)}</div><h2>${selectedDate}</h2></div></div>
 ${profileCategories(selectedProfile).map(([category,items])=>`<section class="detail-category"><h3>${esc(category)}</h3>${Object.entries(items).map(([name,item])=>{const done=(item.dates||[]).includes(selectedDate);const latest=latestDate(item);return `<label class="detail-row"><input type="checkbox" data-detail-category="${esc(category)}" data-detail-name="${esc(name)}" ${done?"checked":""}><span>${esc(name)}</span>${latest?`<span class="latest">${latest}</span>`:""}</label>`}).join("")}</section>`).join("")}`;
 panel.querySelectorAll("input[data-detail-name]").forEach(cb=>cb.addEventListener("change",e=>{
  toggleDate(e.target.dataset.detailCategory,e.target.dataset.detailName,e.target.checked);
 }));
}

// Ticking a box updates local state + UI immediately (calendar/checklist/overdue),
// then queues an autosave — this replaces the old "check boxes, then hit Save" flow.
function toggleDate(category,name,checked){
 const item=db[category][name],dates=new Set(item.dates||[]);
 checked?dates.add(selectedDate):dates.delete(selectedDate);
 item.dates=[...dates].sort();
 renderCalendar();renderSelectedDay();renderOverdue();
 queueAutoSave();
}

function setSaveStatus(text,cls=""){
 const el=document.getElementById("saveStatus");
 if(!el)return;
 el.textContent=text;
 el.className="save-status"+(cls?` ${cls}`:"");
}

// Debounced so rapid ticking doesn't fire one PUT per checkbox.
function queueAutoSave(){
 setSaveStatus("Mentés…");
 clearTimeout(autoSaveTimer);
 autoSaveTimer=setTimeout(()=>{performSave().catch(()=>{});},2500);
}

// Does the actual PUT (this is what triggers the backend's git push). Chained so
// overlapping calls (autosave + the manual button) never race each other.
async function performSave(){
 if(autoSaveInFlight)await autoSaveInFlight.catch(()=>{});
 setSaveStatus("Mentés…");
 const task=api("/data",{method:"PUT",body:JSON.stringify({data:db})});
 autoSaveInFlight=task;
 try{
  await task;
  setSaveStatus("Minden változás mentve","saved");
 }catch(e){
  setSaveStatus("Mentés sikertelen — próbáld a Save page gombot","error");
  throw e;
 }finally{
  if(autoSaveInFlight===task)autoSaveInFlight=null;
 }
}

// The explicit "Save page" button: unchanged behavior — forces an immediate save
// (skips the debounce wait) via the same PUT /data call, and alerts on the result.
async function savePage(){
 const btn=document.getElementById("savePageBtn");btn.disabled=true;btn.textContent="Saving…";
 clearTimeout(autoSaveTimer);
 try{await performSave();alert("Saved.");}
 catch(e){alert(e.message||"Save failed.")}
 finally{btn.disabled=false;btn.textContent="Save page"}
}

function renderOverdue(){
 // Always computed across every non-archived item, regardless of the selected profile.
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
document.querySelectorAll(".profile-circle").forEach(btn=>btn.addEventListener("click",()=>selectProfile(btn.dataset.profile)));

(async()=>{try{await api("/session");showApp();await loadData()}catch{showLogin()}})();
