let db = {};
let selectedDate = null;
let visibility = {};
let pendingChecks = {};

const monthNames = [
  "január","február","március","április","május","június",
  "július","augusztus","szeptember","október","november","december"
];
const weekdayNames = ["H","K","Sze","Cs","P","Szo","V"];

const catClass = {
  "Általános": "cat-altalanos",
  "Gyógyszer": "cat-gyogyszer",
  "Csere": "cat-csere",
  "Tilos": "cat-tilos"
};

function isoToday() {
  return new Date().toLocaleDateString("sv-SE");
}
function parseISO(s) {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function fmt(s) { return s || "—"; }
function latestDate(item) {
  return item.dates?.length ? [...item.dates].sort().at(-1) : null;
}
function allItems() {
  return Object.entries(db).flatMap(([category, items]) =>
    Object.entries(items).map(([name, item]) => ({category, name, item}))
  );
}
function saveLocal() {
  // GitHub Pages is static, so browser edits persist locally.
  // A generated data.json is also included for GitHub-hosted deployments.
  localStorage.setItem("life-calendar-db", JSON.stringify(db));
}
function itemByName(category, name) { return db[category][name]; }

async function init() {
  try {
    const stored = localStorage.getItem("life-calendar-db");
    if (stored) db = JSON.parse(stored);
    else {
      const res = await fetch("data.json", {cache:"no-store"});
      db = await res.json();
    }
  } catch (e) {
    document.getElementById("calendar").innerHTML = `<div class="month"><p class="empty-note">A data.json nem tölthető be.</p></div>`;
    return;
  }

  allItems().forEach(({category, name}) => {
    visibility[`${category}::${name}`] = true;
  });

  selectedDate = isoToday();
  document.getElementById("todayPill").textContent = `Ma · ${selectedDate}`;
  renderSidebar();
  renderCalendar();
  renderOverdue();
}

function renderSidebar() {
  const box = document.getElementById("sidebarContent");
  box.innerHTML = Object.entries(db).map(([category, items]) => {
    const rows = Object.entries(items).map(([name, item]) => {
      const key = `${category}::${name}`;
      const latest = latestDate(item);
      return `
        <div class="task-row">
          <label class="switch">
            <input type="checkbox" ${visibility[key] ? "checked" : ""} data-key="${esc(key)}">
            <span class="slider"></span>
          </label>
          <label data-toggle-key="${esc(key)}">
            ${esc(name)}
            <span class="latest">${latest ? latest : "még nincs rögzített nap"}</span>
          </label>
        </div>`;
    }).join("");
    return `<section class="category"><div class="category-title">${esc(category)}</div>${rows}</section>`;
  }).join("");

  box.querySelectorAll('input[data-key]').forEach(input => {
    input.addEventListener("change", e => {
      visibility[e.target.dataset.key] = e.target.checked;
      renderCalendar();
    });
  });
}

function getMonthRange() {
  const dates = allItems().flatMap(x => x.item.dates || []).sort();
  const minDate = dates.length ? parseISO(dates[0]) : new Date();
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }
  return out;
}

function itemsForDate(iso) {
  return allItems().filter(({category,name,item}) =>
    visibility[`${category}::${name}`] && (item.dates || []).includes(iso)
  );
}

function renderCalendar() {
  const root = document.getElementById("calendar");
  root.innerHTML = getMonthRange().map(renderMonth).join("");
  root.querySelectorAll(".day:not(.empty)").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedDate = btn.dataset.date;
      renderCalendar();
      renderSelectedDay();
      window.setTimeout(() => document.getElementById("selectedDayPanel")?.scrollIntoView({behavior:"smooth", block:"start"}), 0);
    });
  });
}

function renderMonth(first) {
  const y = first.getFullYear(), m = first.getMonth();
  const days = new Date(y, m+1, 0).getDate();
  const mondayFirst = (new Date(y,m,1).getDay()+6)%7;
  let cells = Array(mondayFirst).fill(`<div class="day empty"></div>`);

  for (let d=1; d<=days; d++) {
    const iso = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cls = [
      "day",
      iso === selectedDate ? "selected" : "",
      iso === isoToday() ? "today" : ""
    ].join(" ");
    const tasks = itemsForDate(iso).map(({category,name}) =>
      `<span class="task-chip ${catClass[category] || ""}" title="${esc(name)}">${esc(name)}</span>`
    ).join("");
    cells.push(`<button class="${cls}" data-date="${iso}">
      <span class="day-num">${d}</span>
      <span class="task-stack">${tasks}</span>
    </button>`);
  }

  return `<section class="month">
    <div class="month-title"><h2>${monthNames[m]} ${y}</h2><span>${days} nap</span></div>
    <div class="weekdays">${weekdayNames.map(x=>`<div class="weekday">${x}</div>`).join("")}</div>
    <div class="days-grid">${cells.join("")}</div>
  </section>`;
}

function renderSelectedDay() {
  const panel = document.getElementById("selectedDayPanel");
  if (!selectedDate) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  pendingChecks = {};

  panel.innerHTML = `
    <div class="panel-head">
      <div><div class="eyebrow">SELECTED DAY</div><h2>${selectedDate}</h2></div>
      <div class="actions">
        <button class="action-btn danger" id="cancelBtn">Cancel</button>
        <button class="action-btn primary" id="saveBtn">Save</button>
      </div>
    </div>
    ${Object.entries(db).map(([category,items]) => `
      <section class="detail-category">
        <h3>${esc(category)}</h3>
        ${Object.entries(items).map(([name,item]) => {
          const done = (item.dates || []).includes(selectedDate);
          pendingChecks[`${category}::${name}`] = done;
          return `<label class="detail-row">
            <input type="checkbox" data-detail-key="${esc(category+"::"+name)}" ${done ? "checked":""}>
            <span>${esc(name)}</span>
          </label>`;
        }).join("")}
      </section>`).join("")}
  `;

  panel.querySelectorAll("input[data-detail-key]").forEach(cb => {
    cb.addEventListener("change", e => pendingChecks[e.target.dataset.detailKey] = e.target.checked);
  });
  document.getElementById("cancelBtn").onclick = renderSelectedDay;
  document.getElementById("saveBtn").onclick = saveSelectedDay;
}

function saveSelectedDay() {
  Object.entries(pendingChecks).forEach(([key, done]) => {
    const [category, ...rest] = key.split("::");
    const name = rest.join("::");
    const item = itemByName(category, name);
    const dates = new Set(item.dates || []);
    if (done) dates.add(selectedDate);
    else dates.delete(selectedDate);
    item.dates = [...dates].sort();
  });
  saveLocal();
  renderSidebar();
  renderCalendar();
  renderSelectedDay();
  renderOverdue();
}

function renderOverdue() {
  const panel = document.getElementById("overduePanel");
  const today = parseISO(isoToday());
  const overdue = allItems().map(({category,name,item}) => {
    const last = latestDate(item);
    if (!last || !Number.isFinite(item.frequency)) return null;
    const due = parseISO(last);
    due.setDate(due.getDate() + Number(item.frequency));
    const days = Math.floor((today - due) / 86400000);
    return days > 0 ? {category,name,days} : null;
  }).filter(Boolean).sort((a,b)=>b.days-a.days);

  panel.innerHTML = `
    <h2 class="overdue-title">Overdue:</h2>
    ${overdue.length ? overdue.map(x => `
      <div class="overdue-item">
        <span>${esc(x.name)}</span>
        <span class="overdue-days">${x.days} day${x.days === 1 ? "" : "s"}</span>
      </div>`).join("") : `<p class="empty-note">Nincs lejárt, gyakorisággal rendelkező feladat.</p>`}
  `;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

document.getElementById("toggleAll").addEventListener("click", () => {
  const keys = Object.keys(visibility);
  const showAll = keys.some(k => !visibility[k]);
  keys.forEach(k => visibility[k] = showAll);
  document.getElementById("toggleAll").textContent = showAll ? "Hide all" : "Display all";
  renderSidebar();
  renderCalendar();
});
document.getElementById("openSidebar").onclick = () => document.getElementById("sidebar").classList.add("open");
document.getElementById("closeSidebar").onclick = () => document.getElementById("sidebar").classList.remove("open");

init();
