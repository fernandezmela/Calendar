// Six Hours Apart: a shared calendar for two people in two time zones.
// Rendering and time zone math are plain JavaScript; saving goes through Firebase.
import { firebaseConfig, PEOPLE } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- a thin wrapper so the calendar code can say db.collection("events").add(...) ---------- */
function makeDb(fs){
  const docRef = path => {
    const r = doc(fs, path);
    return {
      set: data => setDoc(r, data),
      update: data => updateDoc(r, data),
      delete: () => deleteDoc(r),
      onSnapshot: (next, err) => onSnapshot(r, s => next({exists: s.exists(), data: () => s.data()}), err),
    };
  };
  return {
    doc: docRef,
    collection: path => {
      const c = collection(fs, path);
      return {
        add: data => addDoc(c, data),
        doc: id => docRef(path + "/" + id),
        onSnapshot: (next, err) => onSnapshot(c, s => next({docs: s.docs.map(d => ({id: d.id, data: () => d.data()}))}), err),
      };
    },
  };
}

const TZ = {a: PEOPLE.a.timeZone, b: PEOPLE.b.timeZone};
const CITY = {a: PEOPLE.a.city, b: PEOPLE.b.city};
const DEFAULT_NAMES = {a: PEOPLE.a.name, b: PEOPLE.b.name};
let names = {...DEFAULT_NAMES};
let me = null;
try { me = localStorage.getItem("sha-me"); } catch(e) {}
if (me !== "a" && me !== "b") me = null;
let events = [];
let db = null, canWrite = true, loaded = false;
let mode = innerWidth < 760 ? "day" : "week";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const other = w => w === "a" ? "b" : "a";
const who = () => me || "a";
const lens = () => TZ[who()];

/* ---------- time zone math ---------- */
const fcache = {};
function parts(tz, ms){
  const f = fcache[tz] || (fcache[tz] = new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short"}));
  const o = {}; for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return {y:+o.year, m:+o.month, d:+o.day, h:(+o.hour)%24, mi:+o.minute, wd:o.weekday};
}
function offset(tz, ms){ const p = parts(tz, ms); return Date.UTC(p.y,p.m-1,p.d,p.h,p.mi) - Math.floor(ms/60000)*60000; }
function toUtc(k, h, mi, tz){ const g = Date.UTC(k.y,k.m-1,k.d,h,mi); let t = g - offset(tz,g); return g - offset(tz,t); }
const keyOf = p => ({y:p.y,m:p.m,d:p.d});
function addDays(k,n){ const t = new Date(Date.UTC(k.y,k.m-1,k.d+n)); return {y:t.getUTCFullYear(),m:t.getUTCMonth()+1,d:t.getUTCDate()}; }
const dow = k => new Date(Date.UTC(k.y,k.m-1,k.d)).getUTCDay();
const kstr = k => `${k.y}-${String(k.m).padStart(2,"0")}-${String(k.d).padStart(2,"0")}`;
const kparse = s => { const [y,m,d] = s.split("-").map(Number); return {y,m,d}; };
const kdiff = (a,b) => Math.round((Date.UTC(a.y,a.m-1,a.d)-Date.UTC(b.y,b.m-1,b.d))/864e5);
const todayK = tz => keyOf(parts(tz, Date.now()));
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WDFULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function hm(h, mi){ const ap = h < 12 ? "am" : "pm"; const hh = h % 12 || 12; return mi ? `${hh}:${String(mi).padStart(2,"0")} ${ap}` : `${hh} ${ap}`; }
function tfmt(ms, tz){ const p = parts(tz, ms); return hm(p.h, p.mi); }
const hShort = h => h === 0 ? "12a" : h < 12 ? h+"a" : h === 12 ? "12p" : (h-12)+"p";
const asleep = (tz, ms) => { const h = parts(tz, ms).h; return h >= 23 || h < 8; };
const pad = n => String(n).padStart(2,"0");

let anchor = todayK(lens());

/* ---------- small ui helpers ---------- */
let toastT;
function toast(msg){ const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function setSeg(el, v){ for (const b of el.querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); }
function getSeg(el){ const b = el.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : null; }
function wireSeg(el, cb){ el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; setSeg(el, b.dataset.v); cb && cb(b.dataset.v); }); }

function sky(h, color){
  const day = h >= 7 && h < 19;
  return day
    ? `<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="9" fill="var(--gold)"/>${[0,45,90,135,180,225,270,315].map(a=>`<line x1="22" y1="5" x2="22" y2="9" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" transform="rotate(${a} 22 22)"/>`).join("")}</svg>`
    : `<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M27 8a14 14 0 1 0 9 22A12 12 0 0 1 27 8z" fill="${color}" opacity=".85"/><circle cx="12" cy="11" r="1.4" fill="${color}"/><circle cx="35" cy="14" r="1" fill="${color}"/></svg>`;
}
function stateLine(h){
  if (h >= 23 || h < 6) return "probably asleep";
  if (h < 8) return "just waking up";
  if (h < 12) return "morning";
  if (h < 14) return "lunchtime";
  if (h < 18) return "afternoon";
  return "evening";
}

/* ---------- render ---------- */
function renderClocks(){
  const now = Date.now();
  for (const w of ["a","b"]){
    const p = parts(TZ[w], now);
    $("clock"+w.toUpperCase()).innerHTML = `${sky(p.h, `var(--${w})`)}<div style="min-width:0"><div class="who">${esc(names[w])}</div><div class="time">${hm(p.h,p.mi)}</div><div class="where">${CITY[w]} · ${p.wd}</div><div class="state">${stateLine(p.h)}</div></div>`;
  }
  const diff = Math.round((offset(TZ.b, now) - offset(TZ.a, now)) / 36e5);
  $("gap").textContent = `${diff} hours`;
  $("gapSub").textContent = diff === 6 ? "apart" : "apart this week (clocks change on different days)";

  // both-awake window today, in my clock
  const tz = lens(), k = todayK(tz);
  const hours = [];
  for (let h = 0; h < 24; h++){ const t = toUtc(k,h,0,tz); if (!asleep(TZ.a,t) && !asleep(TZ.b,t)) hours.push(h); }
  if (hours.length){
    const s = hours[0], e = hours[hours.length-1] + 1;
    const o = other(who()), so = parts(TZ[o], toUtc(k,s,0,tz)).h, eo = parts(TZ[o], toUtc(k,s,0,tz) + (e-s)*36e5).h;
    $("callText").innerHTML = `<b>${hm(s,0)} – ${hm(e%24,0)}</b> your time<br><span style="color:var(--soft)">${hm(so,0)} – ${hm(eo,0)} for ${esc(names[o])}</span>`;
  } else $("callText").textContent = "No shared waking hours today.";

  // countdown to next visit
  const tk = todayK(tz);
  const visits = events.filter(e => e.kind === "visit").map(e => {
    const s = e.allDay ? kparse(e.startDate) : keyOf(parts(tz, e.start));
    const en = e.allDay ? kparse(e.endDate || e.startDate) : keyOf(parts(tz, e.end));
    return {e, s, en};
  }).filter(v => kdiff(v.en, tk) >= 0).sort((x,y) => kdiff(x.s, y.s));
  if (!visits.length){ $("cdNum").textContent = "?"; $("cdText").innerHTML = loaded ? "Nothing booked yet. Add a trip as a <b>Visit</b> and the countdown starts." : "Loading…"; }
  else {
    const v = visits[0], d = kdiff(v.s, tk);
    if (d <= 0){ $("cdNum").textContent = "♡"; $("cdText").innerHTML = `<b>${esc(v.e.title)}</b> is happening now. Put the phone down.`; }
    else { $("cdNum").textContent = d; $("cdText").innerHTML = `${d === 1 ? "day" : "days"} until <b>${esc(v.e.title)}</b><br><span style="color:var(--soft)">${WD[dow(v.s)]} ${MON[v.s.m-1]} ${v.s.d}</span>`; }
  }
}

function days(){
  if (mode === "day") return [anchor];
  const start = addDays(anchor, -((dow(anchor)+6)%7));
  return Array.from({length:7}, (_,i) => addDays(start, i));
}

function evInDay(e, k, tz, s0, s1){
  if (e.allDay){ const a = kparse(e.startDate), b = kparse(e.endDate || e.startDate); return kdiff(k,a) >= 0 && kdiff(b,k) >= 0; }
  return e.start < s1 && e.end > s0;
}

function renderGrid(){
  const tz = lens(), o = other(who()), ds = days(), tk = todayK(tz);
  const n = ds.length;
  const first = ds[0], last = ds[n-1];
  $("rangeLabel").textContent = n === 1
    ? `${WDFULL[dow(first)]}, ${MON[first.m-1]} ${first.d}`
    : first.m === last.m ? `${MON[first.m-1]} ${first.d} – ${last.d}` : `${MON[first.m-1]} ${first.d} – ${MON[last.m-1]} ${last.d}`;

  let head = `<div class="gut l">${CITY[who()]}</div>`;
  let all = `<div class="gut">all day</div>`;
  let body = `<div class="hours l">${Array.from({length:24},(_,h)=>`<div>${hShort(h)}</div>`).join("")}</div>`;
  let anyAll = false, count = 0;
  const now = Date.now();

  ds.forEach((k, i) => {
    const s0 = toUtc(k,0,0,tz), s1 = toUtc(addDays(k,1),0,0,tz);
    const isToday = kdiff(k,tk) === 0;
    head += `<div class="dh${isToday?" today":""}"><div class="wd">${WD[dow(k)]}</div><div class="dn">${k.d}</div></div>`;
    const dayEvs = events.filter(e => evInDay(e,k,tz,s0,s1));
    count += dayEvs.length;
    const alls = dayEvs.filter(e => e.allDay);
    if (alls.length) anyAll = true;
    all += `<div>${alls.map(e => `<button class="chip who-${e.who} ${e.kind}${e.done?" done":""}" data-id="${esc(e.id)}">${e.kind==="task"?`<span class="box" data-toggle="${esc(e.id)}"></span>`:""}${esc(e.title)}</button>`).join("")}</div>`;

    let col = `<div class="col" data-i="${i}">`;
    for (let h = 0; h < 24; h++){
      const t = toUtc(k,h,0,tz);
      const sa = asleep(TZ.a,t), sb = asleep(TZ.b,t);
      const cls = sa && sb ? "sleep" : sa ? "half-a" : sb ? "half-b" : "golden";
      col += `<button type="button" class="slot ${cls}" data-k="${kstr(k)}" data-h="${h}" aria-label="Add at ${hm(h,0)} ${WD[dow(k)]} ${MON[k.m-1]} ${k.d}"></button>`;
    }
    // timed events with simple lane layout
    const timed = dayEvs.filter(e => !e.allDay).map(e => {
      const a = e.start <= s0 ? 0 : (p => p.h*60+p.mi)(parts(tz,e.start));
      const b = e.end >= s1 ? 1440 : (p => p.h*60+p.mi)(parts(tz,e.end));
      return {e, a, b: Math.max(b, a+30)};
    }).sort((x,y) => x.a - y.a || y.b - x.b);
    let group = [], gEnd = -1;
    const flush = () => { const lanes = []; for (const it of group){ let l = lanes.findIndex(end => end <= it.a); if (l < 0){ l = lanes.length; lanes.push(0); } lanes[l] = it.b; it.lane = l; } group.forEach(it => it.lanes = lanes.length); group = []; };
    for (const it of timed){ if (it.a >= gEnd && group.length) { flush(); gEnd = -1; } group.push(it); gEnd = Math.max(gEnd, it.b); }
    flush();
    const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--H")) || 42;
    for (const it of timed){
      const e = it.e, w = 100/it.lanes;
      const top = it.a/60*H, ht = (it.b-it.a)/60*H - 2;
      const small = ht < 34;
      col += `<button class="ev who-${e.who} ${e.kind}${e.done?" done":""}" data-id="${esc(e.id)}" style="top:${top}px;height:${ht}px;left:calc(${it.lane*w}% + 2px);width:calc(${w}% - 4px)"><span class="t">${e.kind==="task"?`<span class="box" data-toggle="${esc(e.id)}"></span>`:""}${esc(e.title)}</span>${small?"":`<span class="tm">${tfmt(e.start,tz)} · ${tfmt(e.start,TZ[o])} ${CITY[o]==="Madrid"?"MAD":"BOS"}</span>`}</button>`;
    }
    if (now >= s0 && now < s1){ const p = parts(tz, now); col += `<div class="now" style="top:${(p.h*60+p.mi)/60*H}px"></div>`; }
    body += col + `</div>`;
  });
  head += `<div class="gut r">${CITY[o]}</div>`;
  all += `<div></div>`;
  const ref = ds[0];
  body += `<div class="hours r">${Array.from({length:24},(_,h)=>`<div>${hShort(parts(TZ[o], toUtc(ref,h,0,tz)).h)}</div>`).join("")}</div>`;

  $("calInner").innerHTML = `<div class="grid head" style="--n:${n}">${head}</div>${anyAll?`<div class="grid allday" style="--n:${n}">${all}</div>`:""}<div class="grid" style="--n:${n}">${body}</div>`;
  const em = $("calEmpty");
  if (!loaded){ em.hidden = false; em.textContent = db ? "Loading your plans…" : ""; em.hidden = !db; }
  else if (!count){ em.hidden = false; em.textContent = mode === "day" ? "Nothing planned today. Tap an hour to add something." : "Nothing planned this week. Tap an hour to add something."; }
  else em.hidden = true;

  $("vWeek").setAttribute("aria-pressed", mode === "week"); $("vDay").setAttribute("aria-pressed", mode === "day");
}

function renderAgenda(){
  const tz = lens(), o = other(who()), now = Date.now(), tk = todayK(tz);
  const up = events.filter(e => e.allDay ? kdiff(kparse(e.endDate||e.startDate), tk) >= 0 : e.end > now)
    .map(e => ({e, sort: e.allDay ? toUtc(kparse(e.startDate),0,0,tz) : e.start}))
    .sort((x,y) => x.sort - y.sort).slice(0, 8);
  if (!up.length){ $("agenda").innerHTML = `<li style="display:block;color:var(--soft);font-size:14px">${loaded ? "Nothing coming up yet. Your first plan will show here." : "Loading…"}</li>`; return; }
  $("agenda").innerHTML = up.map(({e}) => {
    const k = e.allDay ? kparse(e.startDate) : keyOf(parts(tz, e.start));
    const whoTxt = e.who === "both" ? "Both of you" : esc(names[e.who]);
    const tm = e.allDay
      ? (e.endDate && e.endDate !== e.startDate ? `all day, through ${MON[kparse(e.endDate).m-1]} ${kparse(e.endDate).d}` : "all day")
      : `${tfmt(e.start,tz)} – ${tfmt(e.end,tz)} · ${tfmt(e.start,TZ[o])} in ${CITY[o]}`;
    return `<li class="who-${e.who}${e.done?" done":""}"><div class="d">${MON[k.m-1]} ${k.d}<small>${WD[dow(k)]}</small></div><button data-id="${esc(e.id)}"><div class="ti"><span class="dot"></span>${e.kind==="task"?`<span class="box" data-toggle="${esc(e.id)}"></span>`:""}<span style="${e.done?"text-decoration:line-through;opacity:.6":""}">${esc(e.title)}</span></div><div class="tm">${tm} · ${whoTxt}${e.kind==="visit"?" · visit":e.kind==="task"?" · task":""}</div>${e.note?`<div class="nt">${esc(e.note)}</div>`:""}</button></li>`;
  }).join("");
}

function renderLegend(){
  $("legend").innerHTML = `<span><i style="background:var(--a)"></i>${esc(names.a)}</span><span><i style="background:var(--b)"></i>${esc(names.b)}</span><span><i style="background:var(--both)"></i>Both of you</span><span><i style="background:var(--gold)"></i>Both awake</span><span><i style="background:repeating-linear-gradient(135deg,var(--deep) 0 3px,transparent 3px 6px);outline:1px solid var(--rule)"></i>Someone's asleep</span>`;
  $("meName").textContent = names[who()];
}

function render(){ renderClocks(); renderLegend(); renderGrid(); renderAgenda(); }

/* ---------- form ---------- */
let editing = null;
function openForm(ev, preset){
  editing = ev || null;
  const w = who();
  $("fErr").hidden = true;
  for (const el of $("fWho").querySelectorAll("button")) if (el.dataset.v !== "both") el.textContent = names[el.dataset.v];
  for (const el of $("fTz").querySelectorAll("button")) el.textContent = `${names[el.dataset.v]}'s time`;
  $("formTitle").textContent = ev ? "Edit plan" : "New plan";
  $("fDel").hidden = !ev;
  $("fTitle").value = ev ? ev.title : "";
  $("fNote").value = ev ? (ev.note || "") : "";
  setSeg($("fKind"), ev ? ev.kind : "plan");
  setSeg($("fWho"), ev ? ev.who : "both");
  setSeg($("fTz"), w);
  const tz = TZ[w];
  if (ev && !ev.allDay){
    const a = parts(tz, ev.start), b = parts(tz, ev.end);
    $("fAll").checked = false; $("fDate").value = kstr(a); $("fStart").value = `${pad(a.h)}:${pad(a.mi)}`; $("fEnd").value = `${pad(b.h)}:${pad(b.mi)}`;
    $("fFrom").value = $("fTo").value = kstr(a);
  } else if (ev){
    $("fAll").checked = true; $("fFrom").value = ev.startDate; $("fTo").value = ev.endDate || ev.startDate; $("fDate").value = ev.startDate; $("fStart").value = "19:00"; $("fEnd").value = "20:00";
  } else {
    const k = preset?.k || anchor, h = preset?.h ?? 19;
    $("fAll").checked = false; $("fDate").value = kstr(k); $("fStart").value = `${pad(h)}:00`; $("fEnd").value = `${pad(Math.min(h+1,23))}:${h===23?"59":"00"}`;
    $("fFrom").value = $("fTo").value = kstr(k);
  }
  syncForm();
  $("formScrim").hidden = false;
  setTimeout(() => $("fTitle").focus(), 30);
}
function formTimes(){
  const tz = TZ[getSeg($("fTz"))];
  if (!$("fDate").value || !$("fStart").value) return null;
  const k = kparse($("fDate").value);
  const [sh,sm] = $("fStart").value.split(":").map(Number);
  const [eh,em] = ($("fEnd").value || $("fStart").value).split(":").map(Number);
  const start = toUtc(k,sh,sm,tz);
  let end = toUtc(k,eh,em,tz);
  if (end <= start) end = $("fEnd").value ? end + 864e5 : start + 36e5;
  return {start, end};
}
function syncForm(){
  const all = $("fAll").checked;
  $("timedFields").hidden = all; $("allFields").hidden = !all;
  const pv = $("preview");
  if (all){ pv.textContent = "Shows on the same date for both of you."; return; }
  const t = formTimes();
  if (!t){ pv.textContent = "Pick a date and time."; return; }
  const bits = ["a","b"].map(w => {
    const p = parts(TZ[w], t.start);
    const late = asleep(TZ[w], t.start);
    return `<div><b style="color:var(--${w})">${esc(names[w])}</b>: ${p.wd} ${hm(p.h,p.mi)} – ${tfmt(t.end, TZ[w])}${late?` <span class="warn">(that's sleeping time)</span>`:""}</div>`;
  });
  pv.innerHTML = bits.join("");
}
["fDate","fStart","fEnd","fAll"].forEach(id => $(id).addEventListener("input", syncForm));
wireSeg($("fKind")); wireSeg($("fWho")); wireSeg($("fTz"), (v) => {
  // keep the same instant when switching which clock the fields are written in
  const prevTz = TZ[other(v)], t = (() => { setSeg($("fTz"), other(v)); const r = formTimes(); setSeg($("fTz"), v); return r; })();
  if (t && !$("fAll").checked){ const a = parts(TZ[v], t.start), b = parts(TZ[v], t.end); $("fDate").value = kstr(a); $("fStart").value = `${pad(a.h)}:${pad(a.mi)}`; $("fEnd").value = `${pad(b.h)}:${pad(b.mi)}`; }
  syncForm();
});
$("fCancel").onclick = () => $("formScrim").hidden = true;
$("formScrim").addEventListener("click", e => { if (e.target === $("formScrim")) $("formScrim").hidden = true; });
function formError(msg){ $("fErr").textContent = msg; $("fErr").hidden = false; }
function writeError(e){
  if (e && e.code === "permission-denied") return "This account can't change the calendar. Sign in with an account that has access.";
  if (e && e.code === "resource-exhausted") return "The free database limit was hit for today. Try again tomorrow.";
  return "Couldn't save just now. Check your connection and try again.";
}
$("form").addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!db){ formError("Saving isn't available in this view."); return; }
  const title = $("fTitle").value.trim();
  if (!title){ formError("Give it a name first."); $("fTitle").focus(); return; }
  const doc = { title, kind: getSeg($("fKind")), who: getSeg($("fWho")), note: $("fNote").value.trim(), addedBy: who(), updatedAt: Date.now() };
  if ($("fAll").checked){
    let a = $("fFrom").value, b = $("fTo").value || a;
    if (!a){ formError("Pick a date."); return; }
    if (b < a) [a,b] = [b,a];
    Object.assign(doc, {allDay:true, startDate:a, endDate:b});
  } else {
    const t = formTimes(); if (!t){ formError("Pick a date and time."); return; }
    Object.assign(doc, {allDay:false, start:t.start, end:t.end});
  }
  doc.done = editing ? !!editing.done : false;
  $("fSave").disabled = true;
  try {
    if (editing) await db.collection("events").doc(editing.id).set(doc);
    else await db.collection("events").add(doc);
    $("formScrim").hidden = true;
    toast(editing ? "Saved" : "Added");
  } catch(e){ formError(writeError(e)); }
  finally { $("fSave").disabled = false; }
});
let delArmed = false;
$("fDel").onclick = async () => {
  if (!delArmed){ delArmed = true; $("fDel").textContent = "Tap again to delete"; setTimeout(() => { delArmed = false; $("fDel").textContent = "Delete"; }, 3000); return; }
  delArmed = false; $("fDel").textContent = "Delete";
  try { await db.collection("events").doc(editing.id).delete(); $("formScrim").hidden = true; toast("Deleted"); }
  catch(e){ formError(writeError(e)); }
};

/* ---------- clicks on calendar ---------- */
async function toggleDone(id){
  const e = events.find(x => x.id === id); if (!e || !db) return;
  try { await db.collection("events").doc(id).update({done: !e.done}); } catch(err){ toast(writeError(err)); }
}
document.addEventListener("click", e => {
  const tg = e.target.closest("[data-toggle]");
  if (tg){ e.stopPropagation(); toggleDone(tg.dataset.toggle); return; }
  const evb = e.target.closest("[data-id]");
  if (evb){ const ev = events.find(x => x.id === evb.dataset.id); if (ev) openForm(ev); return; }
  const slot = e.target.closest(".slot");
  if (slot){ openForm(null, {k: kparse(slot.dataset.k), h: +slot.dataset.h}); }
});
$("addBtn").onclick = () => openForm(null, {k: anchor, h: 19});
$("prev").onclick = () => { anchor = addDays(anchor, mode === "week" ? -7 : -1); renderGrid(); };
$("next").onclick = () => { anchor = addDays(anchor, mode === "week" ? 7 : 1); renderGrid(); };
$("today").onclick = () => { anchor = todayK(lens()); renderGrid(); scrollToMorning(); };
$("vWeek").onclick = () => { mode = "week"; renderGrid(); };
$("vDay").onclick = () => { mode = "day"; renderGrid(); };

/* ---------- identity + names ---------- */
function showPicker(){
  $("pickA").innerHTML = `${esc(names.a)}<span>in ${esc(CITY.a)}</span>`;
  $("pickB").innerHTML = `${esc(names.b)}<span>in ${esc(CITY.b)}</span>`;
  $("pickScrim").hidden = false;
}
$("pickScrim").addEventListener("click", e => {
  const b = e.target.closest("[data-me]"); if (!b) return;
  me = b.dataset.me; try { localStorage.setItem("sha-me", me); } catch(_) {}
  $("pickScrim").hidden = true; anchor = todayK(lens()); render(); scrollToMorning();
});
$("switchMe").onclick = showPicker;
$("editNames").onclick = () => { $("nA").value = names.a; $("nB").value = names.b; $("namesScrim").hidden = false; };
$("nCancel").onclick = () => $("namesScrim").hidden = true;
$("namesForm").addEventListener("submit", async e => {
  e.preventDefault();
  const n = {a: $("nA").value.trim() || DEFAULT_NAMES.a, b: $("nB").value.trim() || DEFAULT_NAMES.b};
  names = n; $("namesScrim").hidden = true; render();
  if (db){ try { await db.doc("couple/settings").set({names: n}); toast("Names saved"); } catch(err){ toast(writeError(err)); } }
});

function scrollToMorning(){ const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--H")) || 42; $("scroll").scrollTop = 7.5*H; }

/* ---------- boot ---------- */
$("foot").textContent = `${CITY.a} & ${CITY.b} · daylight saving handled for both sides`;
$("nALabel").textContent = `In ${CITY.a}`;
$("nBLabel").textContent = `In ${CITY.b}`;
render(); scrollToMorning();
setInterval(() => { renderClocks(); renderGrid(); }, 60000);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
let started = false;

// Signing in: a popup on desktop; phones that block popups fall back to a full-page redirect.
$("signInBtn").onclick = async () => {
  $("gateErr").hidden = true;
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") signInWithRedirect(auth, provider);
    else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { $("gateErr").textContent = "Sign-in didn't work: " + e.code; $("gateErr").hidden = false; }
  }
};
$("signOutBtn").onclick = () => signOut(auth).then(() => location.reload());

// Who you are is picked once per device ("who's looking?").
// Who is ALLOWED in is decided by the database rules in Firebase, which hold the two emails.
function notOnList(email){
  $("gateTitle").textContent = "Not on the list";
  $("gateText").textContent = `You're signed in as ${email || "this account"}, which doesn't have access to this calendar.`;
  $("signInBtn").textContent = "Use a different account";
  $("signInBtn").onclick = () => signOut(auth).then(() => location.reload());
  $("pickScrim").hidden = true;
  $("gateScrim").hidden = false;
}

onAuthStateChanged(auth, user => {
  if (!user){ $("gateScrim").hidden = false; return; }
  $("gateScrim").hidden = true;
  if (!me) showPicker();
  anchor = todayK(lens());
  if (!started){ started = true; db = makeDb(firestore); subscribe(user.email); }
  render(); scrollToMorning();
});

function subscribe(email){
  db.collection("events").onSnapshot(snap => {
    events = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(e => e.title && (e.allDay ? e.startDate : (typeof e.start === "number" && typeof e.end === "number")));
    for (const e of events){ if (!["a","b","both"].includes(e.who)) e.who = "both"; if (!["plan","task","visit"].includes(e.kind)) e.kind = "plan"; }
    loaded = true; render();
  }, err => {
    loaded = true;
    if (err.code === "permission-denied"){ notOnList(email); return; }
    const b = $("banner"); b.hidden = false;
    b.textContent = "Lost the connection to your shared plans. Reload the page to reconnect.";
    render();
  });
  db.doc("couple/settings").onSnapshot(s => {
    const n = s.exists && s.data().names;
    if (n && typeof n.a === "string" && typeof n.b === "string"){ names = {a: n.a || DEFAULT_NAMES.a, b: n.b || DEFAULT_NAMES.b}; render(); if (!$("pickScrim").hidden) showPicker(); }
  }, () => {});
}
