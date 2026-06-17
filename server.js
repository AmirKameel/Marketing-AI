require("dotenv").config();
const express = require("express");
const path = require("path");
const { MODULES } = require("./lib/modules");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Health + config (never exposes the key, only whether it is present + model name)
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    keyPresent: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4o",
  });
});

// Module metadata for the UI to build forms dynamically
app.get("/api/modules", (req, res) => {
  const meta = {};
  for (const [id, m] of Object.entries(MODULES)) {
    meta[id] = { title: m.title, blurb: m.blurb, inputs: m.inputs, workflow: m.workflow, rctefo: m.rctefo };
  }
  res.json(meta);
});

// Run a module
app.post("/api/run/:id", async (req, res) => {
  const id = req.params.id;
  const mod = MODULES[id];
  if (!mod) return res.status(404).json({ error: `Unknown module: ${id}` });
  try {
    const result = await mod.run(req.body || {});
    res.json({ ok: true, id, result });
  } catch (e) {
    console.error(`[${id}]`, e.message);
    res.status(500).json({ ok: false, id, error: e.message });
  }
});

const PORT = process.env.PORT || 5050;

// Export for Vercel serverless; listen only when run locally.
module.exports = app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Tameeni AI Workbench running at http://localhost:${PORT}`);
    if (!process.env.OPENAI_API_KEY) console.warn("WARNING: OPENAI_API_KEY not set in .env");
  });
}
