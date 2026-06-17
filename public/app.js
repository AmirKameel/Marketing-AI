/* Tameeni AI Workbench - frontend */
const LIVE_IDS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
const MOCK = [
  { id: "m8", title: "Approval Router", blurb: "Marketing Manager approve / reject / edit / legal-flag." },
  { id: "m9", title: "Scheduler & Publishing", blurb: "Approved content into the weekly calendar." },
  { id: "m10", title: "Alert & Monitoring", blurb: "Severity-tagged alerts to the right person." },
  { id: "m11", title: "Performance Analyst", blurb: "Reports + repeat / improve / stop / test." },
];

/* Workflow + RCTEFO design specs for the mock modules (wireframed, mock-data in this MVP) */
const MOCK_DETAIL = {
  m8: {
    workflow: {
      trigger: "Every guardrail-checked draft (from M7) lands in the approval queue.",
      steps: ["Pre-sort items by guardrail verdict and risk", "Surface why each item was flagged", "Marketing Manager approves / rejects / edits / legal-flags", "Approved items become eligible for scheduling"],
      handoff: "Approved items feed M9 (Scheduler).",
      checkpoint: "Hard rule: nothing moves to M9 unless a human sets status = approved.",
      sources: ["The M7 output queue", "SSO / identity provider for the Marketing Manager role + permissions"],
      production: ["Build the queue in Airtable or a Slack/Teams approval workflow with approve/reject buttons", "A webhook updates each item's status on click", "Only status=approved is allowed to reach the scheduler", "Keep an immutable audit log of who approved what"],
    },
    rctefo: {
      role: "You are the routing logic for a human approval queue; the Marketing Manager is the decision-maker.",
      context: "Every guardrail-checked draft lands here. AI only pre-sorts and explains; it never auto-publishes.",
      task: "Pre-sort each item by guardrail verdict and risk, summarize why it was flagged, and keep humans in control.",
      examples: "FAIL items float to the top with reasons; legal-trigger items get a 'legal' tag and route to legal review.",
      format: "Deterministic routing in this MVP (no model call).",
      output: "Hard rule: no item reaches M9 unless a human sets status = approved.",
    },
  },
  m9: {
    workflow: {
      trigger: "Approved items arrive from M8.",
      steps: ["Take only approved items", "Place into day/platform slots (Saudi work week Sun-Thu)", "Balance funnel stages across the week", "Keep one trend-reactive slot open"],
      handoff: "Published posts feed M10 (Monitoring) + M11 (Performance).",
      checkpoint: "Never schedule an unapproved item.",
      sources: ["Approved items from M8", "Publishing APIs: X API, Meta Graph publish, TikTok Content Posting API, LinkedIn API (or Buffer/Hootsuite/Sprout as an aggregator)"],
      production: ["Store the calendar in a DB with day/platform slots", "A scheduler job publishes each item at its slot via the platform API", "Capture returned post IDs so M10/M11 can track performance", "Retry + alert on publish failures"],
    },
    rctefo: {
      role: "You are a scheduling assistant for the weekly content calendar.",
      context: "Only approved items are eligible. Saudi work week is Sun-Thu. Respect platform priority and posting cadence.",
      task: "Place approved items into day/platform slots, balancing funnel stages across the week.",
      examples: "Do not stack two heavy education posts on the same day; keep one open slot for trend-reactive content.",
      format: "Calendar grid in this MVP (no model call).",
      output: "Never schedule an item that is not approved.",
    },
  },
  m10: {
    workflow: {
      trigger: "Live metrics and guardrail events stream in continuously.",
      steps: ["Watch metric thresholds (sentiment, engagement spikes, guardrail failures)", "Detect a breach", "Tag severity (critical / warning / info)", "Route to the named owner"],
      handoff: "Critical content alerts loop back to M8/M7; insight alerts feed M11.",
      checkpoint: "Only fire on real threshold breaches - no alert fatigue.",
      sources: ["Platform insight APIs (engagement/reach)", "Guardrail events from M7", "Sentiment stream from M3"],
      production: ["Stream metrics into a pipeline with a threshold rules engine", "On a breach, tag severity and resolve the owner", "Deliver to Slack/Teams/email (PagerDuty for critical)", "Debounce duplicates so the same breach does not alert repeatedly"],
    },
    rctefo: {
      role: "You are a monitoring agent that turns metric thresholds into routed alerts.",
      context: "Thresholds per ASSUMPTIONS.md (sentiment, engagement spikes, guardrail failures). Each alert type has a defined owner.",
      task: "Detect threshold breaches, tag severity, and route each alert to the right person.",
      examples: "Guardrail FAIL = critical, route to Marketing Manager. Competitor post above 3x their median = info, route to Strategist.",
      format: "Rule-based thresholds in this MVP (no model call).",
      output: "Fire only on genuine threshold breaches; suppress duplicates to avoid alert fatigue.",
    },
  },
  m11: {
    workflow: {
      trigger: "Weekly performance data is ready (or on demand).",
      steps: ["Pull outcome metrics over vanity metrics", "Compare each content type vs its median", "Assign a call: repeat / improve / stop / test", "Summarize the week"],
      handoff: "Recommendations feed back into M1/M4 for next week's planning.",
      checkpoint: "Tie every recommendation to an outcome metric; flag low confidence.",
      sources: ["Platform analytics APIs (X, Meta Insights, TikTok, YouTube)", "GA4 for CTR-to-renewal-start", "Product DB for actual renewal conversions"],
      production: ["ETL platform + web + product data into a warehouse", "Model the metrics with dbt and surface them in Looker Studio", "The model summarizes the week and assigns repeat/improve/stop/test", "Feed the winners back into M1/M4 and M5's few-shot examples"],
    },
    rctefo: {
      role: "You are a performance analyst translating metrics into a repeat / improve / stop / test call.",
      context: "Outcome metrics beat vanity ones: CTR-to-renewal-start, save/share quality, positive sentiment. Figures illustrative per ASSUMPTIONS.md.",
      task: "Summarize weekly performance and give each content type a clear call: repeat, improve, stop, or test next.",
      examples: "+50% vs median = Repeat; -30% vs median = Stop; a new idea = Test next.",
      format: "Report + table in this MVP (agent-ready design).",
      output: "Tie every recommendation to an outcome metric and flag anything low-confidence.",
    },
  },
};
let META = {};
let CURRENT = null;
const STATE = {};
const PREFILL = {};

/* ---------- handoff between modules ---------- */
let _ho = 0; const HO = {};
function hoBtn(label, target, field, value) {
  const k = "h" + _ho++; HO[k] = { target, field, value };
  return `<button class="btn-soft" onclick="handoffApply('${k}')">${label}</button>`;
}
function handoffApply(k) {
  const { target, field, value } = HO[k];
  PREFILL[target] = PREFILL[target] || {};
  PREFILL[target][field] = value;
  selectModule(target);
}

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ---------- workflow + RCTEFO prompt addon ---------- */
function addonHTML(wf, p, isMock) {
  if (!wf || !p) return "";
  const steps = (wf.steps || []).map((s, i) => `<li><span class="stepn">${i + 1}</span><span>${esc(s)}</span></li>`).join("");
  const rows = [
    ["R", "Role", p.role], ["C", "Context", p.context], ["T", "Task", p.task],
    ["E", "Examples & quality bar", p.examples], ["F", "Output format", p.format], ["O", "Output rules & guardrails", p.output],
  ].map((x) => `<div class="rc"><div class="rc-key">${x[0]}</div><div class="rc-main"><div class="rc-name">${esc(x[1])}</div><div class="rc-body">${esc(x[2] || "")}</div></div></div>`).join("");
  const badge = isMock ? `<span class="badge b-warn">design spec - wireframe in MVP</span>` : `<span class="badge b-ok">live prompt</span>`;
  const note = isMock ? "" : `<p class="muted addon-note">A standard guardrail clause (no invented numbers, no banned claims, culturally safe, draft-only) is appended automatically to every live prompt.</p>`;
  const srcs = (wf.sources || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const prod = (wf.production || []).map((s, i) => `<li><span class="stepn">${i + 1}</span><span>${esc(s)}</span></li>`).join("");
  const rw = (srcs || prod) ? `<div class="rw-inwf">
          <button class="subaddon-head" onclick="toggleAddon(this)" aria-expanded="false">
            <span class="subaddon-title">How to build (productionize) this agent</span>
            <span class="addon-tog">Show</span>
          </button>
          <div class="subaddon-body" style="display:none">
            ${srcs ? `<div class="rw-lab">Data sources / APIs</div><ul class="rw-src">${srcs}</ul>` : ""}
            ${prod ? `<div class="rw-lab">Build steps</div><ol class="wf-steps">${prod}</ol>` : ""}
          </div>
        </div>` : "";
  return `<div class="addon">
    <button class="addon-head" onclick="toggleAddon(this)" aria-expanded="false">
      <span class="addon-title">How this agent works &amp; its prompt</span>
      <span class="addon-tog">Show</span>
    </button>
    <div class="addon-body" style="display:none">
      <div class="addon-grid">
        <div class="wf">
          <h4>Workflow</h4>
          <div class="wf-row"><span class="wf-lab">Trigger</span><span>${esc(wf.trigger)}</span></div>
          <ol class="wf-steps">${steps}</ol>
          <div class="wf-row"><span class="wf-lab">Hands off</span><span>${esc(wf.handoff)}</span></div>
          <div class="wf-row"><span class="wf-lab">Checkpoint</span><span>${esc(wf.checkpoint)}</span></div>
          ${rw}
        </div>
        <div class="pr">
          <h4>Prompt (RCTEFO framework) ${badge}</h4>
          <div class="rc-legend">R-ole / C-ontext / T-ask / E-xamples / F-ormat / O-utput</div>
          ${rows}
          ${note}
        </div>
      </div>
    </div>
  </div>`;
}
function toggleAddon(btn) {
  const body = btn.nextElementSibling;
  const open = body.style.display !== "none";
  body.style.display = open ? "none" : "";
  btn.setAttribute("aria-expanded", String(!open));
  btn.querySelector(".addon-tog").textContent = open ? "Show" : "Hide";
}

/* ---------- init ---------- */
async function init() {
  try {
    const h = await (await fetch("/api/health")).json();
    const el = document.getElementById("status");
    if (h.keyPresent) el.innerHTML = `<span class="dot-ok"></span> Connected`;
    else el.innerHTML = `<span class="dot-bad"></span> No API key in app/.env`;
  } catch (e) {
    document.getElementById("status").innerHTML = `<span class="dot-bad"></span> Server offline`;
  }
  META = await (await fetch("/api/modules")).json();
  buildNav();
  selectModule("m1");
}

function buildNav() {
  const live = document.getElementById("navLive");
  live.innerHTML = LIVE_IDS.map((id, i) =>
    `<div class="navitem" data-id="${id}" onclick="selectModule('${id}')"><span class="mid">M${i + 1}</span><span>${esc(META[id]?.title || id)}</span><span class="tag live">Live</span></div>`
  ).join("");
  const mock = document.getElementById("navMock");
  mock.innerHTML = MOCK.map((m, i) =>
    `<div class="navitem" data-id="${m.id}" onclick="selectModule('${m.id}')"><span class="mid">M${i + 8}</span><span>${esc(m.title)}</span><span class="tag mock">Mock</span></div>`
  ).join("");
}

function selectModule(id) {
  CURRENT = id;
  document.querySelectorAll(".navitem").forEach((n) => n.classList.toggle("active", n.dataset.id === id));
  document.querySelector(".main").scrollTop = 0;
  if (LIVE_IDS.includes(id)) renderLive(id);
  else renderMock(id);
}

/* ---------- live modules ---------- */
function renderLive(id) {
  const m = META[id];
  const idx = LIVE_IDS.indexOf(id) + 1;
  const pre = PREFILL[id] || {};
  const fields = m.inputs.map((f) => {
    const val = pre[f.name] ?? f.default ?? "";
    const req = f.required ? " <span style='color:var(--crit)'>*</span>" : "";
    if (f.type === "textarea")
      return `<label class="f" for="f_${f.name}">${esc(f.label)}${req}</label><textarea id="f_${f.name}" placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea>`;
    if (f.type === "select")
      return `<label class="f" for="f_${f.name}">${esc(f.label)}${req}</label><select id="f_${f.name}">${f.options.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    if (f.type === "number")
      return `<div><label class="f" for="f_${f.name}">${esc(f.label)}${req}</label><input type="number" id="f_${f.name}" value="${esc(val)}"></div>`;
    return `<div><label class="f" for="f_${f.name}">${esc(f.label)}${req}</label><input type="text" id="f_${f.name}" value="${esc(val)}" placeholder="${esc(f.placeholder || "")}"></div>`;
  }).join("");

  document.getElementById("content").innerHTML = `
    <div class="mhead">
      <div class="kicker">Module M${idx} · Live AI</div>
      <h1>${esc(m.title)}</h1>
      <p>${esc(m.blurb)}</p>
    </div>
    ${addonHTML(m.workflow, m.rctefo, false)}
    <div class="card">
      <h3>Inputs</h3>
      ${fields}
      <div class="actions">
        <button class="btn" id="runBtn" onclick="run('${id}')">Run</button>
        <span id="runState" class="muted"></span>
      </div>
    </div>
    <div class="result" id="resultArea"></div>`;
  if (pre.__autorun) { delete pre.__autorun; }
}

async function run(id) {
  const m = META[id];
  const body = {};
  let missing = false;
  m.inputs.forEach((f) => {
    const el = document.getElementById("f_" + f.name);
    body[f.name] = el ? el.value : "";
    if (f.required && !String(body[f.name]).trim()) missing = true;
  });
  const btn = document.getElementById("runBtn");
  const rs = document.getElementById("runState");
  const area = document.getElementById("resultArea");
  if (missing) { area.innerHTML = `<div class="err">Please fill the required fields (*).</div>`; return; }
  btn.disabled = true; rs.innerHTML = `<span class="spinner"></span> running...`;
  area.innerHTML = "";
  try {
    const r = await fetch("/api/run/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Unknown error");
    STATE[id] = data.result;
    area.innerHTML = RENDER[id](data.result);
  } catch (e) {
    area.innerHTML = `<div class="err"><b>Error:</b> ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; rs.innerHTML = "";
  }
}

/* ---------- per-module result renderers ---------- */
const RENDER = {
  m1(r) {
    const rows = (r.trends || []).map((t) => {
      const sc = t.brandSafety >= 4 ? "safe-5" : t.brandSafety >= 2 ? "safe-3" : "safe-1";
      return `<tr><td><b>${esc(t.trend)}</b><div class="muted">${esc(t.whyRelevant)}</div></td>
        <td>${esc(t.suggestedAngle)}</td><td>${esc(t.funnelStage)}</td>
        <td class="${sc}">${esc(t.brandSafety)}/5</td><td><span class="pill ${t.type === "real-citable" ? "gold" : ""}">${esc(t.type)}</span></td></tr>`;
    }).join("");
    const txt = (r.trends || []).map((t) => `- ${t.trend} (${t.funnelStage}): ${t.suggestedAngle}`).join("\n");
    return card("Ranked trends", `<table class="tbl"><tr><th>Trend</th><th>Angle</th><th>Funnel</th><th>Safety</th><th>Type</th></tr>${rows}</table>
      ${r.note ? `<p class="muted" style="margin-top:10px">${esc(r.note)}</p>` : ""}
      <div class="actions">${hoBtn("Send trends → M4", "m4", "trends", txt)}</div>`);
  },
  m2(r) {
    const s = r.scorecard || {};
    const dims = [["Content themes", s.contentThemes], ["Engagement", s.engagementPattern], ["Audience comments", s.audienceComments], ["Influencers", s.influencerUsage], ["Creative style", s.creativeStyle], ["Repeated campaigns", s.repeatedCampaigns], ["Platform behavior", s.platformBehavior]];
    const rows = dims.map((d) => `<tr><td style="width:170px"><b>${esc(d[0])}</b></td><td>${esc(d[1])}</td></tr>`).join("");
    const tk = (r.ethicalTakeaways || []).map((t) => `<li>${esc(t)}</li>`).join("");
    const txt = `Competitor ${r.competitor} (${r.platform}). Takeaways: ${(r.ethicalTakeaways || []).join("; ")}`;
    return card(`Scorecard - ${esc(r.competitor)} · ${esc(r.platform)}`,
      `<table class="tbl">${rows}</table>
      <h3 style="margin-top:16px">Ethical takeaways</h3><ul>${tk}</ul>
      ${r.note ? `<p class="assume">${esc(r.note)}</p>` : ""}
      <div class="actions">${hoBtn("Send takeaways → M4", "m4", "competitor", txt)}</div>`);
  },
  m3(r) {
    const rows = (r.rows || []).map((x) => `<tr>
      <td>${esc(x.comment)}</td>
      <td><span class="badge b-neutral">${esc(x.category)}</span></td>
      <td><span class="badge ${x.sentiment === "negative" ? "b-crit" : x.sentiment === "positive" ? "b-ok" : "b-neutral"}">${esc(x.sentiment)}</span></td>
      <td>${x.sensitive ? '<span class="badge b-crit">sensitive</span>' : "-"}</td>
      <td class="muted">${esc(x.suggestedAction)}</td></tr>`).join("");
    const txt = `Insight: ${r.insight}\nMessage: ${r.singleMindedMessage}`;
    return card("Comment analysis",
      `<table class="tbl"><tr><th>Comment</th><th>Category</th><th>Sentiment</th><th>Flag</th><th>Action</th></tr>${rows}</table>
      <div class="grid2" style="margin-top:14px">
        <div class="card" style="margin:0"><h3>Human insight</h3><p>${esc(r.insight)}</p></div>
        <div class="card" style="margin:0"><h3>Single-minded message</h3><p>${esc(r.singleMindedMessage)}</p></div>
      </div>
      <div class="actions">${hoBtn("Send insight → M4", "m4", "comments", txt)}</div>`);
  },
  m4(r) {
    const items = (r.brief || []).map((b) => `<div class="idea">
      <div class="hook">${esc(b.angle)}</div>
      <div class="meta">${esc(b.audienceTruth)}</div>
      <div style="margin-top:8px">${(b.platforms || []).map((p) => `<span class="pill">${esc(p)}</span>`).join("")}<span class="pill gold">${esc(b.funnelStage)}</span></div>
      <div class="meta">Metric: ${esc(b.metric)}</div>
      <div class="actions">${hoBtn("Use angle → M5", "m5", "angle", b.angle)}</div>
    </div>`).join("");
    return card(`Weekly brief ${r.week ? "· " + esc(r.week) : ""}`, items + (r.note ? `<p class="muted" style="margin-top:8px">${esc(r.note)}</p>` : ""));
  },
  m5(r) {
    const items = (r.ideas || []).map((i) => `<div class="idea">
      <div class="hook">${esc(i.hook)}</div>
      <p style="margin:8px 0">${esc(i.body)}</p>
      <div class="meta">Caption: ${esc(i.caption)}</div>
      <div style="margin-top:6px">${(i.hashtags || []).map((h) => `<span class="pill">${esc(h)}</span>`).join("")}</div>
      ${i.competitorMention ? '<div style="margin-top:8px"><span class="badge b-warn">competitor mention - needs MM approval</span></div>' : ""}
      ${i.notes ? `<div class="meta">${esc(i.notes)}</div>` : ""}
      <div class="actions">${hoBtn("Localize → M6", "m6", "content", i.hook + "\n" + i.body + "\n" + i.caption)} ${hoBtn("Check → M7", "m7", "draft", i.hook + " " + i.body)}</div>
    </div>`).join("");
    return card("Creative ideas (bold-but-safe)", items);
  },
  m6(r) {
    const flags = (r.flags || []).map((f) => `<div class="flag review"><div class="cat">${esc(f)}</div></div>`).join("");
    return card(`Saudi Arabic draft <span class="badge b-draft">${esc(r.label || "AI draft - pending native review")}</span>`,
      `<div class="ar">${esc(r.arabicDraft)}</div>
      ${r.backTranslation ? `<p class="muted"><b>Back-translation:</b> ${esc(r.backTranslation)}</p>` : ""}
      <h3 style="margin-top:14px">Flag to native reviewer</h3>${flags}
      <div class="actions">${hoBtn("Check draft → M7", "m7", "draft", r.arabicDraft)}</div>`);
  },
  m7(r) {
    const vClass = r.verdict === "PASS" ? "v-pass" : r.verdict === "FAIL" ? "v-fail" : "v-review";
    const icon = r.verdict === "PASS" ? "&#10003;" : r.verdict === "FAIL" ? "&#10007;" : "!";
    const ruleFlags = (r.ruleFlags || []).map((f) => `<div class="flag ${f.severity}">
      <div class="top"><span class="cat">${esc(f.category)}</span><span class="badge ${f.severity === "critical" ? "b-crit" : "b-warn"}">${f.severity}</span></div>
      <div style="margin:6px 0">${(f.matches || []).map((m) => `<span class="mono">${esc(m)}</span>`).join(" ")}</div>
      <div class="muted">${esc(f.action)}</div></div>`).join("");
    const llmFlags = (r.llmFlags || []).map((f) => `<div class="flag ${f.severity === "critical" ? "critical" : "review"}">
      <div class="top"><span class="cat">${esc(f.category)}</span><span class="badge ${f.severity === "critical" ? "b-crit" : "b-warn"}">${esc(f.severity)} · AI</span></div>
      <div class="muted" style="margin-top:5px">${esc(f.explanation)}</div></div>`).join("");
    return `<div class="card">
      <div class="verdict ${vClass}"><span style="font-size:24px">${icon}</span><span>${esc(r.verdict)}</span></div>
      <p class="muted">Deterministic rule engine + agent nuance pass. Nothing publishes without Marketing Manager approval regardless of verdict.</p>
      ${ruleFlags ? `<h3>Rule-engine flags</h3>${ruleFlags}` : ""}
      ${llmFlags ? `<h3 style="margin-top:14px">Agent nuance flags</h3>${llmFlags}` : ""}
      ${r.summary ? `<p class="muted" style="margin-top:10px"><b>Summary:</b> ${esc(r.summary)}</p>` : ""}
      ${!ruleFlags && !llmFlags ? `<p class="muted">No issues detected - can move to the approval queue.</p>` : ""}
    </div>`;
  },
};
function card(title, inner) { return `<div class="card"><h3>${title}</h3>${inner}</div>`; }

/* ---------- mock modules (M8-M11) ---------- */
let MOCKQ = [
  { id: 1, platform: "Instagram", text: "Carousel: choosing your motor cover (educational)", status: "pending", flags: "Guardrail: PASS" },
  { id: 2, platform: "X", text: "The cheapest car insurance, guaranteed approval, instant policy", status: "flagged", flags: "Guardrail: FAIL (3)" },
  { id: 3, platform: "TikTok", text: "3 things people skip before renewing", status: "pending", flags: "Guardrail: PASS" },
  { id: 4, platform: "LinkedIn", text: "SME health: understanding the basics", status: "legal", flags: "Legal review (SME)" },
];
function setStatus(id, st) { const i = MOCKQ.find((x) => x.id === id); if (i) i.status = st; renderMock("m8"); }

const MOCKBANNER = `<div class="banner"> Mock data for demo - illustrative per ASSUMPTIONS.md. These modules are wireframed (mock data) in this MVP.</div>`;

function renderMock(id) {
  const titleIdx = MOCK.findIndex((m) => m.id === id) + 8;
  const m = MOCK.find((x) => x.id === id);
  let inner = "";
  if (id === "m8") {
    inner = MOCKQ.map((q) => {
      const badge = q.status === "approved" ? "b-ok" : q.status === "rejected" ? "b-crit" : q.status === "legal" ? "b-warn" : "b-neutral";
      return `<div class="queue-item">
        <span class="pill">${esc(q.platform)}</span>
        <div class="txt"><b>${esc(q.text)}</b><div class="muted">${esc(q.flags)}</div></div>
        <span class="badge ${badge}">${esc(q.status)}</span>
        <button class="btn-soft" onclick="setStatus(${q.id},'approved')">Approve</button>
        <button class="btn-soft" onclick="setStatus(${q.id},'rejected')">Reject</button>
        <button class="btn-soft" onclick="setStatus(${q.id},'legal')">Legal</button>
      </div>`;
    }).join("");
    inner = MOCKBANNER + `<div class="card"><h3>Approval queue</h3>${inner}<p class="muted" style="margin-top:10px">Hard rule: no item reaches M9 (publishing) unless status = approved.</p></div>`;
  } else if (id === "m9") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu"];
    const plan = {
      Sun: ["X: third-party vs comprehensive", "TikTok: 3 things people skip", "IG: choosing your cover"],
      Mon: ["X: know your renewal date", "-", "IG: story poll"],
      Tue: ["X: trend-reactive (open)", "TikTok: renewal sneaks up", "IG: renew step-by-step"],
      Wed: ["X: FAQ - what's included?", "-", "IG: inclusions vs exclusions"],
      Thu: ["X: weekend safety + reminder", "TikTok: comparing options", "IG: link to renewal flow"],
    };
    inner = MOCKBANNER + `<div class="card"><h3>This week's calendar (motor)</h3><table class="cal"><tr><th>Day</th><th>Scheduled</th></tr>
      ${days.map((d) => `<tr><td style="width:60px"><b>${d}</b></td><td>${plan[d].map((p) => esc(p)).join("<br>")}</td></tr>`).join("")}</table>
      <p class="assume">Saudi work week · only approved items appear here.</p></div>`;
  } else if (id === "m10") {
    const alerts = [
      ["Risky content", "Draft #2 failed the guardrail gate (3 banned claims)", "critical", "Marketing Manager"],
      ["Competitor spike", "A competitor post >3x their median engagement", "info", "Strategist"],
      ["Negative sentiment", "Negative comments >20% on yesterday's post", "warning", "Community manager"],
      ["High-performing post", "TikTok edutainment >50% above median", "info", "Strategist"],
    ];
    inner = MOCKBANNER + `<div class="card"><h3>Active alerts</h3>${alerts.map((a) => `<div class="queue-item">
      <span class="badge ${a[2] === "critical" ? "b-crit" : a[2] === "warning" ? "b-warn" : "b-neutral"}">${a[2]}</span>
      <div class="txt"><b>${esc(a[0])}</b><div class="muted">${esc(a[1])}</div></div>
      <span class="pill">${esc(a[3])}</span></div>`).join("")}
      <p class="assume">Thresholds per ASSUMPTIONS.md §F.</p></div>`;
  } else if (id === "m11") {
    inner = MOCKBANNER + `<div class="grid3">
      <div class="metric"><div class="lab">CTR → renewal-start</div><div class="val">1.8%</div><div class="sub">▲ vs 1.6% last wk</div></div>
      <div class="metric"><div class="lab">Engagement quality</div><div class="val">3.1%</div><div class="sub">saves+shares weighted</div></div>
      <div class="metric"><div class="lab">Sentiment (positive)</div><div class="val">55%</div><div class="sub">trust proxy · stable</div></div>
    </div>
    <div class="card"><h3>Recommendations - repeat / improve / stop / test</h3>
      <table class="tbl"><tr><th>Content type</th><th>Signal</th><th>Call</th></tr>
      <tr><td>TikTok edutainment</td><td>+58% vs median</td><td><span class="badge b-ok">Repeat</span></td></tr>
      <tr><td>IG carousel (exclusions)</td><td>near median</td><td><span class="badge b-warn">Improve</span></td></tr>
      <tr><td>X long thread</td><td>-31% vs median</td><td><span class="badge b-crit">Stop</span></td></tr>
      <tr><td>Renewal-reminder reel</td><td>new hypothesis</td><td><span class="badge b-neutral">Test next</span></td></tr></table>
      <p class="assume">All figures illustrative per ASSUMPTIONS.md.</p></div>`;
  }
  const d = MOCK_DETAIL[id] || {};
  document.getElementById("content").innerHTML = `<div class="mhead"><div class="kicker">Module M${titleIdx} · Mock data</div><h1>${esc(m.title)}</h1><p>${esc(m.blurb)}</p></div>${addonHTML(d.workflow, d.rctefo, true)}${inner}`;
}

init();
