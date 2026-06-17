// Thin OpenAI Chat Completions wrapper that always returns parsed JSON.
// The API key is read from the environment (never sent to the browser).

const API_URL = "https://api.openai.com/v1/chat/completions";

const GUARDRAIL_CLAUSE = `
STANDARD GUARDRAILS (always apply):
- Do NOT invent prices, premiums, discounts, coverage percentages, insurer numbers, approval speed, or guarantees.
- Never use: cheapest, best, guaranteed, fastest, instant, "no questions asked", "all companies", "always approved", 100%, risk-free.
- Avoid anything religiously, politically, or culturally sensitive in Saudi Arabia.
- Competitors may be analyzed internally, but never attacked in public-facing copy.
- Treat all output as a DRAFT for human review, not final fact. Flag anything uncertain.
- Any assumed number must be labelled with "[ASSUMPTION]".
`;

async function chatJSON({ system, user, temperature = 0.4 }) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to app/.env");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + "\n" + GUARDRAIL_CLAUSE + "\nRespond ONLY with valid JSON matching the requested schema." },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error("Model did not return valid JSON. Raw: " + content.slice(0, 300));
  }
}

module.exports = { chatJSON, GUARDRAIL_CLAUSE };
