// Deterministic guardrail rule engine (M7). Runs instantly, no API call.
// Mirrors the standalone prototype so results are consistent and demoable.

const BANNED = [
  { en: ["cheapest", "cheaper than", "lowest price", "lowest priced"], ar: ["الأرخص", "أرخص"], label: "Risky claim: price superiority" },
  { en: ["best", "number one", "number 1", "#1", "no.1"], ar: ["الأفضل", "رقم واحد", "الأول"], label: "Risky claim: superiority" },
  { en: ["guaranteed", "guarantee", "guarantees"], ar: ["مضمون", "نضمن", "ضمان"], label: "Risky claim: guarantee" },
  { en: ["fastest", "instant", "instantly", "immediately approved"], ar: ["الأسرع", "فوري", "فورية", "فوراً"], label: "Risky claim: speed / instant" },
  { en: ["no questions asked"], ar: ["بدون أسئلة", "بلا أسئلة"], label: "Risky claim: no questions asked" },
  { en: ["all companies", "every company", "all insurers"], ar: ["كل الشركات", "جميع الشركات"], label: "Risky claim: 'all companies'" },
  { en: ["always approved", "never rejected", "approval guaranteed", "guaranteed approval"], ar: ["موافقة مضمونة"], label: "Risky claim: always/guaranteed approval" },
  { en: ["risk-free", "100%", "100 percent"], ar: ["مئة بالمئة", "بدون مخاطرة"], label: "Risky claim: risk-free / 100%" },
];

const NUMBER_RULES = [
  { re: /(?:sar|sr|﷼|ريال|ر\.?س)\s?\d[\d,\.]*/gi, label: "Price/amount figure" },
  { re: /\d[\d,\.]*\s?(?:sar|sr|﷼|ريال|ر\.?س)/gi, label: "Price/amount figure" },
  { re: /\d{1,3}\s?%/g, label: "Percentage (coverage/discount?)" },
  { re: /\b(in|within|just|only)\s+\d+\s+(second|seconds|minute|minutes|hour|hours|day|days)\b/gi, label: "Approval/turnaround speed claim" },
];

const CULTURAL = {
  en: ["politics", "political", "religion", "religious", "sect", "gambling", "alcohol", "crisis", "tragedy"],
  ar: ["سياسة", "سياسي", "دين", "ديني", "طائفة", "قمار", "خمر", "أزمة", "كارثة"],
  label: "Cultural / sensitive-topic review",
};

const COMPETITORS = {
  tokens: ["shory", "bcare", "b-care", "gonsure", "tawuniya", "al rajhi takaful", "alrajhi takaful", "شوري", "بي كير", "جونشور", "التعاونية", "تكافل الراجحي"],
  label: "Competitor mention - needs Marketing Manager approval",
};

const LEGAL = {
  en: ["promotion", "promo", "competition", "prize", "prize draw", "giveaway", "win a", "discount", "offer", "coupon", "sama", "regulation", "regulatory", "fully covered", "will pay", "claim is covered"],
  ar: ["عرض", "تخفيض", "مسابقة", "جائزة", "سحب", "اربح", "كوبون", "ساما", "تنظيم", "مغطى بالكامل", "نعوضك", "تغطية كاملة"],
  label: "Legal-escalation trigger - route to legal review",
};

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function findEn(text, phrase) {
  const re = new RegExp("(^|[^\\p{L}])(" + escRe(phrase) + ")(?=[^\\p{L}]|$)", "giu");
  const hits = []; let m;
  while ((m = re.exec(text)) !== null) hits.push(m[2]);
  return hits;
}
function findAr(text, token) { return text.includes(token) ? [token] : []; }
function uniq(a) { return [...new Set(a)]; }

function evaluate(text) {
  text = (text || "").trim();
  const flags = [];
  if (!text) return { verdict: "EMPTY", flags };

  BANNED.forEach((rule) => {
    let m = [];
    rule.en.forEach((p) => (m = m.concat(findEn(text, p))));
    rule.ar.forEach((p) => (m = m.concat(findAr(text, p))));
    if (m.length) flags.push({ severity: "critical", category: rule.label, matches: uniq(m), action: "Remove or rephrase - banned claim. Hard fail." });
  });
  NUMBER_RULES.forEach((rule) => {
    const m = text.match(rule.re);
    if (m) flags.push({ severity: "review", category: "Product figure: " + rule.label, matches: uniq(m.map((x) => x.trim())), action: "Verify against the approved-claims allow-list, or remove." });
  });
  let cult = [];
  CULTURAL.en.forEach((p) => (cult = cult.concat(findEn(text, p))));
  CULTURAL.ar.forEach((p) => (cult = cult.concat(findAr(text, p))));
  if (cult.length) flags.push({ severity: "review", category: CULTURAL.label, matches: uniq(cult), action: "Route to native Saudi reviewer for cultural/sensitivity check." });
  let comp = [];
  COMPETITORS.tokens.forEach((t) => { if (text.toLowerCase().includes(t.toLowerCase())) comp.push(t); });
  if (comp.length) flags.push({ severity: "review", category: COMPETITORS.label, matches: uniq(comp), action: "No public competitor mention without Marketing Manager approval." });
  let leg = [];
  LEGAL.en.forEach((p) => (leg = leg.concat(findEn(text, p))));
  LEGAL.ar.forEach((p) => (leg = leg.concat(findAr(text, p))));
  if (leg.length) flags.push({ severity: "review", category: LEGAL.label, matches: uniq(leg), action: "Flag to legal review." });

  const crit = flags.filter((f) => f.severity === "critical").length;
  const verdict = crit > 0 ? "FAIL" : flags.length ? "REVIEW" : "PASS";
  return { verdict, flags };
}

module.exports = { evaluate };
