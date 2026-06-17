// Module definitions for M1-M7.
// Each agent's prompt is written with the RCTEFO framework:
//   R - Role        who the agent is
//   C - Context     brand, audience, situation, constraints
//   T - Task        the exact job to do
//   E - Examples    quality bar / what good looks like
//   F - Format      the JSON output schema
//   O - Output      output rules, guardrails, objective
// buildSystem() assembles these six sections into the real system prompt sent to
// the model, so the prompt shown in the UI is the same one the agent runs on.
const { chatJSON } = require("./openai");
const guardrails = require("./guardrails");

const BRAND = `Brand: Tameeni, a Saudi insurance platform (focus: motor insurance; secondary: SME health).
Audience: Saudi drivers, white Saudi Arabic. Tone: supportive, friendly, clear, local, trustworthy, corporate-safe.
Platforms priority: X > TikTok > Instagram > LinkedIn > Facebook (Snapchat optional).`;

// Saudi work week starts Sunday. Returns a stable label for the current week
// so the model never has to invent a date (it has no real clock).
function saudiWeekLabel(d = new Date()) {
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay()); // back up to Sunday
  const y = sun.getFullYear();
  const m = String(sun.getMonth() + 1).padStart(2, "0");
  const day = String(sun.getDate()).padStart(2, "0"); // local parts (avoid UTC shift)
  return `Week of ${y}-${m}-${day} (Sun-Thu)`;
}

function buildSystem(p) {
  return [
    "# R - ROLE", p.role,
    "\n# C - CONTEXT", p.context,
    "\n# T - TASK", p.task,
    "\n# E - EXAMPLES & QUALITY BAR", p.examples,
    "\n# F - FORMAT", "Return ONLY valid JSON matching this schema:\n" + p.format,
    "\n# O - OUTPUT RULES & GUARDRAILS", p.output,
  ].join("\n");
}

const MODULES = {
  m1: {
    title: "Signal & Trend Scout",
    blurb: "Finds and ranks platform trends relevant to Saudi motor insurance.",
    inputs: [
      { name: "platform", label: "Platform", type: "select", options: ["X", "TikTok", "Instagram", "LinkedIn", "Facebook"], required: true },
      { name: "signals", label: "Observed signals / notes (optional - paste anything you've seen)", type: "textarea", placeholder: "e.g. lots of summer road-trip content; people asking about renewal deadlines..." },
      { name: "count", label: "How many trends", type: "number", default: 5 },
    ],
    workflow: {
      trigger: "Operator picks a platform and optionally pastes signals they have noticed.",
      steps: [
        "Read the platform and any pasted signals",
        "Recall durable behaviour patterns + Saudi seasonality (weather, school terms, Hajj/Ramadan/National Day, travel cycles)",
        "Generate candidate trends Tameeni could credibly join",
        "Score each on relevance x brand-safety (1-5)",
        "Tag the source type: real-citable / durable-pattern / assumption",
        "Rank best-first",
      ],
      handoff: "Ranked trends feed M4 (Weekly Brief).",
      checkpoint: "Strategist sanity-checks which trends are real vs assumed before they are used.",
      sources: [
        "X/Twitter API v2: recent search + trends-by-location (Saudi WOEID), filtered to Arabic + motor/insurance keywords",
        "TikTok Research / Creative Center API: trending hashtags and sounds for the KSA region",
        "Google Trends (pytrends or SerpApi): rising queries like 'تجديد تأمين' / 'تأمين سيارات' in Saudi Arabia",
        "Meta Graph API (IG/FB) hashtag search + YouTube Data API search trends",
        "Internal: GA4 site-search terms and renewal-seasonality pulled from the policy database",
      ],
      production: [
        "Schedule a daily job that pulls each source into a raw store (Postgres / Supabase)",
        "Normalize everything to one schema: {platform, term, volume, growth, lang, geo, sampledAt}",
        "Filter to KSA + insurance relevance using keyword lists + embedding similarity",
        "Dedupe and rank by growth x relevance; keep the top N",
        "Pass that top-N JSON into M1's prompt as the 'observed signals' context, then store the model's ranked output",
      ],
    },
    rctefo: {
      role: "You are a senior social-media trend analyst specialising in the Saudi market and the motor-insurance category.",
      context: `${BRAND}\nYou do NOT have a live trend feed. You reason from durable behaviour patterns, Saudi seasonality, and any signals the operator pasted.`,
      task: "Given the platform and optional observed signals, propose N trends Tameeni could credibly join. For each, explain why it is relevant, give a usable content angle, map it to a funnel stage, and score brand-safety. Rank best-first.",
      examples: "A strong trend is specific and actionable: 'renewal-deadline anxiety before summer travel' beats 'people like cars'. Use 'real-citable' ONLY when the input signals contain a specific, checkable source or named event (e.g., a dated campaign, a named report, an official calendar date). A recurring season or behaviour with no cited source is 'durable-pattern'; a pure guess is 'assumption'.",
      format: `{
  "trends": [ { "trend": str, "whyRelevant": str, "suggestedAngle": str, "funnelStage": "Awareness"|"Consideration"|"Conversion", "brandSafety": 1-5, "type": "durable-pattern"|"assumption"|"real-citable" } ],
  "note": str
}`,
      output: "Never fabricate live stats or virality numbers. brandSafety is 1 (risky) to 5 (safe). Default to 'durable-pattern' or 'assumption'; do NOT use 'real-citable' unless a concrete source is present in the input. If unsure a trend is real, mark it 'assumption'. Keep every angle culturally appropriate for Saudi Arabia.",
    },
    async run(body) {
      const system = buildSystem(this.rctefo);
      const user = `Platform: ${body.platform}\nObserved signals: ${body.signals || "(none provided)"}\nReturn ${body.count || 5} trends, ranked best-first.`;
      return chatJSON({ system, user, temperature: 0.6 });
    },
  },

  m2: {
    title: "Competitor Intelligence Monitor",
    blurb: "Builds a 7-dimension scorecard from observations you paste (internal only, no scraping).",
    inputs: [
      { name: "competitor", label: "Competitor", type: "select", options: ["Shory", "Bcare", "Gonsure", "Tawuniya", "Al Rajhi Takaful"], required: true },
      { name: "platform", label: "Platform", type: "select", options: ["X", "TikTok", "Instagram", "LinkedIn", "Facebook"], required: true },
      { name: "observations", label: "Observations you've seen (optional)", type: "textarea", placeholder: "Paste any publicly observed posts/themes. If empty, output is a labelled hypothesis." },
    ],
    workflow: {
      trigger: "Operator selects a competitor + platform and pastes any publicly observed activity.",
      steps: [
        "Use only the pasted observations (no scraping, no private data)",
        "Score the competitor across 7 dimensions",
        "If no observations are given, produce a cautious hypothesis and mark every field [ASSUMPTION]",
        "Derive 3 ethical, action-oriented takeaways for Tameeni",
      ],
      handoff: "Takeaways feed M4 (Weekly Brief).",
      checkpoint: "Strictly internal; never published. Strategist validates assumptions.",
      sources: [
        "Official competitor handles via X API v2, Meta Graph API (public IG/FB page posts), TikTok Research API, YouTube channel API",
        "Ad transparency: Meta Ad Library API, TikTok Ad Library, Google Ads Transparency Center",
        "App Store / Google Play review APIs for product-sentiment signals",
        "Optional paid social listening (Brandwatch / Meltwater / Talkwalker) if budget allows",
      ],
      production: [
        "Keep a registry of each competitor's handles, pages and channels",
        "Scheduled pulls of public posts + engagement counts into the warehouse (official APIs only, no gated scraping)",
        "Compute the 7 dimensions from aggregates: post cadence, theme clustering via embeddings, engagement rate, influencer detection from mentions",
        "Feed the structured aggregates into M2 as 'observations'; the model writes the scorecard + ethical takeaways",
        "Surface on an internal-only dashboard with an audit trail",
      ],
    },
    rctefo: {
      role: "You are a competitive-intelligence analyst producing INTERNAL strategy notes, never public-facing content.",
      context: `${BRAND}\nYou may only use the observations the operator pasted. This is desk analysis of publicly visible activity.`,
      task: "Score the named competitor across the 7 dimensions, then extract 3 ethical takeaways Tameeni can act on without copying or attacking them.",
      examples: "Takeaways describe what Tameeni should DO differently ('lead with claims-clarity content, a gap they leave open'), not insults. With no observations, output a cautious hypothesis and mark every scorecard field '[ASSUMPTION]'.",
      format: `{
  "competitor": str, "platform": str,
  "scorecard": { "contentThemes": str, "engagementPattern": str, "audienceComments": str, "influencerUsage": str, "creativeStyle": str, "repeatedCampaigns": str, "platformBehavior": str },
  "ethicalTakeaways": [ str, str, str ],
  "note": str
}`,
      output: "Never invent hard metrics (follower counts, exact engagement). Never write anything intended for publication. No competitor attacks.",
    },
    async run(body) {
      const system = buildSystem(this.rctefo);
      const user = `Competitor: ${body.competitor}\nPlatform: ${body.platform}\nObservations: ${body.observations || "(none provided - produce labelled hypothesis)"}`;
      return chatJSON({ system, user, temperature: 0.5 });
    },
  },

  m3: {
    title: "Audience & Comment Insight",
    blurb: "Classifies comments into categories + sentiment, flags sensitive cases, and extracts one insight.",
    inputs: [
      { name: "comments", label: "Comments (one per line)", type: "textarea", required: true, placeholder: "Every year the premium goes up and no one explains why.\nI started renewing online but the add-ons confused me, so I gave up.\nHow do I know a cheap policy will pay out if I crash?\nI forgot my renewal date and only found out when I got pulled over." },
    ],
    workflow: {
      trigger: "Operator pastes raw comments, one per line.",
      steps: [
        "Classify each comment: category + sentiment",
        "Flag sensitive cases (personal complaint, claims dispute)",
        "Suggest an action per comment",
        "Synthesize ONE human insight + ONE single-minded message",
      ],
      handoff: "Insight + message feed M4 (Weekly Brief).",
      checkpoint: "Sensitive comments route to support/community, never into public content.",
      sources: [
        "X mentions/replies via API v2; Meta Graph API comment webhooks (IG/FB); TikTok comment API; YouTube commentThreads API",
        "Support tickets (Zendesk / Freshdesk) and app-store reviews",
      ],
      production: [
        "Ingest comments + replies through webhooks/polling into a processing queue",
        "Run PII redaction and language/dialect detection before anything hits the model",
        "Batch comments into M3 for category + sentiment + sensitive classification",
        "Auto-route sensitive/claims items to the CRM/support, never to content",
        "Store embeddings to track recurring themes week over week",
      ],
    },
    rctefo: {
      role: "You are an audience-insight analyst who turns raw comments into one decision-useful truth.",
      context: `${BRAND}\nComments may include complaints, claims disputes or personal cases. These are SENSITIVE and must never be repurposed into public content.`,
      task: "Classify each comment (category, sentiment, sensitive flag, suggested action), then synthesize one human insight and one single-minded message the brand could build content around.",
      examples: "category is one of {question, complaint, objection, pain point, opportunity}. The insight is an emotional truth ('people fear the claim won't actually pay out'), not a summary of the comments.",
      format: `{
  "rows": [ { "comment": str, "category": "question"|"complaint"|"objection"|"pain point"|"opportunity", "sentiment": "positive"|"neutral"|"negative", "sensitive": bool, "suggestedAction": str } ],
  "insight": str,
  "singleMindedMessage": str
}`,
      output: "Mark sensitive=true for any personal complaint or claims dispute and route it to support, not content. Never suggest quoting a sensitive comment verbatim in public-facing copy.",
    },
    async run(body) {
      const system = buildSystem(this.rctefo);
      const user = `Comments:\n${body.comments}`;
      return chatJSON({ system, user, temperature: 0.4 });
    },
  },

  m4: {
    title: "Insight Synthesis & Weekly Brief",
    blurb: "Fuses trend, competitor and comment signals into a prioritized weekly content brief.",
    inputs: [
      { name: "trends", label: "Trends (from M1, or paste)", type: "textarea", placeholder: "Paste M1 output or notes..." },
      { name: "competitor", label: "Competitor takeaways (from M2, or paste)", type: "textarea" },
      { name: "comments", label: "Comment insight (from M3, or paste)", type: "textarea" },
    ],
    workflow: {
      trigger: "Operator brings M1/M2/M3 outputs (or pastes equivalent notes).",
      steps: [
        "Fuse trends + competitor takeaways + comment insight",
        "Draft 3-5 content angles",
        "Attach platforms + funnel stage + one outcome metric to each",
        "Prioritize by business impact, respecting platform priority order",
      ],
      handoff: "Each angle feeds M5 (Creative Ideation).",
      checkpoint: "Strategist / Marketing Manager selects which angles go into production.",
      sources: [
        "The stored outputs of M1, M2 and M3 from the data warehouse",
        "Current business KPIs: renewal-funnel metrics from product analytics (GA4 / Mixpanel / internal DB)",
      ],
      production: [
        "Pull the latest M1/M2/M3 records + live funnel metrics",
        "Compose them into M4's prompt context",
        "Let the strategist review/edit the brief in Airtable or Notion",
        "Approved angles auto-create production tasks for M5",
      ],
    },
    rctefo: {
      role: "You are a marketing strategist who converts mixed signals into a prioritized weekly plan.",
      context: `${BRAND}\nInputs are the outputs of M1 (trends), M2 (competitor) and M3 (comments); any may be empty.`,
      task: "Fuse the signals into 3-5 prioritized content angles for the coming week. Each angle names the audience truth it answers, the platforms, the funnel stage, and ONE business-outcome metric.",
      examples: "Good metrics: 'renewal-flow starts', 'saves on the educational carousel', 'comment questions answered' - never 'likes'. Order angles by business impact, best-first. Use the provided 'Target week' value verbatim for the week field; never invent a date.",
      format: `{
  "week": str,
  "brief": [ { "angle": str, "audienceTruth": str, "platforms": [str], "funnelStage": "Awareness"|"Consideration"|"Conversion", "metric": str } ],
  "note": str
}`,
      output: "Respect the platform priority order. No vanity metrics. Keep angles brand-safe and de-duplicated.",
    },
    async run(body) {
      const week = saudiWeekLabel();
      const system = buildSystem(this.rctefo);
      const user = `Target week: ${week}\n\nTRENDS:\n${body.trends || "(none)"}\n\nCOMPETITOR:\n${body.competitor || "(none)"}\n\nCOMMENTS:\n${body.comments || "(none)"}`;
      const out = await chatJSON({ system, user, temperature: 0.5 });
      out.week = week; // authoritative - never trust a model-invented date
      return out;
    },
  },

  m5: {
    title: "Creative Ideation Studio",
    blurb: "Turns an angle into bold-but-safe platform creative (hooks, body, caption, hashtags).",
    inputs: [
      { name: "angle", label: "Content angle", type: "text", required: true, placeholder: "e.g. 'Renewal sneaks up on you' - make renewing on time easy" },
      { name: "platform", label: "Platform", type: "select", options: ["X", "TikTok", "Instagram", "LinkedIn", "Facebook"], required: true },
      { name: "format", label: "Format", type: "select", options: ["Reel/TikTok script", "Carousel", "Single post", "Thread"], required: true },
      { name: "count", label: "How many ideas", type: "number", default: 3 },
    ],
    workflow: {
      trigger: "Operator passes an approved angle + platform + format.",
      steps: [
        "Write platform-native ideas (hook, body, caption, hashtags)",
        "Keep every idea bold but brand-safe",
        "Flag any idea that mentions a competitor",
        "Return N distinct concepts (no reskins)",
      ],
      handoff: "An idea feeds M6 (Localize) or M7 (Guardrail check).",
      checkpoint: "Creative lead selects ideas before localization.",
      sources: [
        "The approved brief/angle from M4",
        "Brand kit + tone-of-voice doc stored in a vector store (for retrieval)",
        "Past top-performing posts from M11, used as few-shot examples",
      ],
      production: [
        "Retrieve brand guidelines + winning examples (RAG) and inject them into the prompt",
        "Generate ideas and save them as drafts in the CMS / Airtable",
        "Copy + design leads pick and refine the strongest concepts",
        "Route the chosen idea to M6 (localize) and/or M7 (guardrail)",
      ],
    },
    rctefo: {
      role: "You are a senior social creative (copy + concept) for a regulated insurer.",
      context: `${BRAND}\nOutput is English; Saudi localization happens later in M6. 'Bold but safe' = a scroll-stopping hook and real emotion, with zero risky claims.\nEmoji policy: a few emojis are fine on TikTok and Instagram, sparing on X, and none on LinkedIn.`,
      task: "For the given angle / platform / format, generate N distinct ideas, each with a hook, body, caption and hashtags, written natively for that platform.",
      examples: "A TikTok hook must earn the first 2 seconds; a LinkedIn post is professional, not playful. Vary the ideas - do not reskin one concept N times.",
      format: `{
  "ideas": [ { "hook": str, "body": str, "caption": str, "hashtags": [str], "competitorMention": bool, "notes": str } ]
}`,
      output: "Set competitorMention=true if an idea names a competitor (routes to extra approval). When an idea references a competitor, keep it factual and respectful - no attacks and no unverifiable comparisons. No price or guarantee claims. Keep everything culturally appropriate for Saudi Arabia.",
    },
    async run(body) {
      const system = buildSystem(this.rctefo);
      const user = `Angle: ${body.angle}\nPlatform: ${body.platform}\nFormat: ${body.format}\nProduce ${body.count || 3} ideas (English).`;
      return chatJSON({ system, user, temperature: 0.8 });
    },
  },

  m6: {
    title: "Saudi Localization",
    blurb: "Adapts approved English content into white Saudi Arabic + a native-reviewer flag list.",
    inputs: [
      { name: "content", label: "Approved English content", type: "textarea", required: true, placeholder: "Paste the English copy to localize..." },
      { name: "platform", label: "Platform", type: "select", options: ["X", "TikTok", "Instagram", "LinkedIn", "Facebook"], required: true },
    ],
    workflow: {
      trigger: "Operator pastes approved English copy + platform.",
      steps: [
        "Adapt the copy into natural white Saudi Arabic",
        "Produce a literal back-translation",
        "List specific things a native reviewer must check",
        "Stamp the output 'AI draft - pending native review'",
      ],
      handoff: "Arabic draft feeds M7 (Guardrail), then the native reviewer.",
      checkpoint: "MANDATORY native Saudi reviewer sign-off before anything publishes.",
      sources: [
        "The approved English copy from M5",
        "An Arabic insurance glossary / termbase + the Saudi style guide (vector store)",
      ],
      production: [
        "Inject the termbase + style guide via RAG so terminology stays consistent",
        "Model drafts white Saudi Arabic + a literal back-translation",
        "Push the draft into a TMS (Lokalise / Crowdin) for the native reviewer",
        "On approval, lock it and grow the translation memory for next time",
      ],
    },
    rctefo: {
      role: "You are an AI localization assistant for Saudi Arabic. You are explicitly NOT a native speaker and your output is always a draft.",
      context: `${BRAND}\nTarget register: white Saudi Arabic - educated, broadly understood across the Kingdom, lightly local; not heavy slang, not stiff MSA. Platform affects tone and length.`,
      task: "Adapt the approved English content into natural white Saudi Arabic, provide a literal back-translation, and list the specific things a native Saudi reviewer must check before publishing.",
      examples: "Flags must be specific: \"confirm 'تأمين شامل' is the term users expect, not 'تغطية كاملة'\" beats 'check grammar'. Keep insurance terminology accurate.",
      format: `{
  "label": "AI draft - pending native review",
  "arabicDraft": str,
  "backTranslation": str,
  "flags": [ str ]
}`,
      output: "Always set label to 'AI draft - pending native review'. Never claim native fluency. Surface every ambiguous claim or culturally sensitive phrase as a flag.",
    },
    async run(body) {
      const system = buildSystem(this.rctefo);
      const user = `Platform: ${body.platform}\nEnglish content:\n${body.content}`;
      return chatJSON({ system, user, temperature: 0.5 });
    },
  },

  m7: {
    title: "Compliance & Guardrail Gate",
    blurb: "Deterministic rule engine + an LLM nuance pass. Returns PASS / FAIL / REVIEW with itemized flags.",
    inputs: [
      { name: "draft", label: "Draft post text (English or Arabic)", type: "textarea", required: true, placeholder: "Paste a draft to check..." },
    ],
    workflow: {
      trigger: "Operator, M5 or M6 sends a draft to check.",
      steps: [
        "Deterministic engine scans banned keywords, risky numbers, competitor mentions, legal triggers",
        "GPT nuance pass on tone and implication",
        "Combine both into a single verdict: PASS / REVIEW / FAIL",
        "Itemize every flag with severity + action",
      ],
      handoff: "Result feeds M8 (Approval queue).",
      checkpoint: "Marketing Manager approval is still required regardless of verdict.",
      sources: [
        "The banned-claims + risky-number rule list (config file / DB)",
        "SAMA and insurance-advertising regulation docs in a vector store (for the nuance pass)",
      ],
      production: [
        "Run the deterministic engine first (regex/keyword + number detection) - cheap and instant",
        "Run a RAG nuance pass over the regulatory docs with the model",
        "Combine into PASS/REVIEW/FAIL; store the verdict + flags; a FAIL blocks the queue",
        "Let legal update the rule list periodically; version every change",
      ],
    },
    rctefo: {
      role: "You are a compliance reviewer for a regulated Saudi insurer, doing the NUANCE pass a keyword list cannot.",
      context: `${BRAND}\nA deterministic rule engine has already scanned for banned keywords, risky numbers, competitor mentions and legal triggers. Your job is tone, implication and context only.`,
      task: "Read the draft and flag nuanced issues: implied guarantees, fear-mongering, subtle religious/cultural insensitivity, implied superiority, unclear promises. Give each a severity and a one-line explanation, then a short summary.",
      examples: "Do not re-flag obvious banned words the engine already caught. 'You'd be crazy not to renew' = pressure/fear tone = review. An implied 'you'll always be covered' = critical.",
      format: `{ "llmFlags": [ { "category": str, "severity": "critical"|"review", "explanation": str } ], "summary": str }`,
      output: "severity is 'critical' or 'review'. Be precise, not paranoid - flag only real risks. Remember nothing publishes without Marketing Manager approval regardless of your verdict.",
    },
    async run(body) {
      const rules = guardrails.evaluate(body.draft);
      let llm = { llmFlags: [], summary: "" };
      try {
        const system = buildSystem(this.rctefo);
        llm = await chatJSON({ system, user: `Draft:\n${body.draft}`, temperature: 0.3 });
      } catch (e) {
        llm = { llmFlags: [], summary: "LLM nuance check unavailable: " + e.message };
      }
      const llmCrit = (llm.llmFlags || []).some((f) => f.severity === "critical");
      let verdict = rules.verdict;
      if (verdict === "PASS" && llmCrit) verdict = "FAIL";
      else if (verdict === "PASS" && (llm.llmFlags || []).length) verdict = "REVIEW";
      return { verdict, ruleFlags: rules.flags, llmFlags: llm.llmFlags || [], summary: llm.summary || "" };
    },
  },
};

module.exports = { MODULES, buildSystem };
