import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(
  process.env.DATA_FILE || path.join(__dirname, "data.json")
);
const PUBLIC_DIR = path.join(__dirname, "public");
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const MAX_HISTORY = 20;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(PUBLIC_DIR));

const SYSTEM_MESSAGE = `
You are an AI assistant operating as a child-safety monitoring prototype.

You receive a short sequence of recent sensor records. Review the records as a time series rather than treating the latest record in isolation.

Look for sustained movement, sudden stops, repeated inactivity, reported falls, and unusual heart-rate trends. Treat missing, contradictory, or physiologically implausible values as unreliable data. Do not invent information that is not present in the records.

Privacy rules:
- Do not repeat raw JSON, coordinates, field names, or exact positions.
- Do not describe where the child is located or give directions.
- Describe movement only in general terms.

Use these prototype risk labels:
- NONE: no concerning pattern is visible in the supplied records.
- LOW: a brief or minor irregularity is visible.
- MEDIUM: a fall or abnormal pattern is reported, but the available sequence does not show sustained deterioration.
- HIGH: a reported fall is followed by immobility, deterioration, or another concerning pattern.
- EXTREME: the supplied records suggest a potentially critical condition.

Return 2–3 short sentences describing the observed trend, followed by exactly one line in this format:
RISK: <NONE | LOW | MEDIUM | HIGH | EXTREME>

This is a prototype data summary, not a medical diagnosis or a substitute for a caregiver or emergency response.
`;

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify({ history: [] }, null, 2));
  }
}

async function readHistory() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.history) ? parsed.history : [];
}

async function writeHistory(history) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(
    DATA_FILE,
    JSON.stringify({ history: history.slice(-MAX_HISTORY) }, null, 2)
  );
}

function isValidPosition(position) {
  return (
    position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 1 && position.x <= 4 &&
    position.y >= 1 && position.y <= 4
  );
}

function normalizeFlag(value) {
  return value === true || value === 1 ? 1 : 0;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeNet API" });
});

// The dashboard polls this endpoint for the latest sensor/simulation history.
app.get("/data", async (_req, res) => {
  try {
    const history = await readHistory();
    res.json({ history });
  } catch (error) {
    console.error("Unable to read monitoring data:", error.message);
    res.status(500).json({ error: "Unable to read monitoring data." });
  }
});

// Optional ingestion endpoint for a future sensor adapter or another local process.
// The current repository does not include a physical mmWave sensor driver.
app.post("/data", async (req, res) => {
  const incoming = req.body;

  if (!incoming || !isValidPosition(incoming.current)) {
    return res.status(400).json({
      error: "A current position with x and y values between 1 and 4 is required."
    });
  }

  const heartRate = Number(incoming.heartRate);
  if (!Number.isFinite(heartRate) || heartRate < 0 || heartRate > 250) {
    return res.status(400).json({ error: "A valid heartRate value is required." });
  }

  try {
    const history = await readHistory();
    const previousRecord = history.at(-1);
    const record = {
      timestamp: Number.isFinite(Number(incoming.timestamp))
        ? Number(incoming.timestamp)
        : Date.now(),
      current: {
        x: Number(incoming.current.x),
        y: Number(incoming.current.y)
      },
      previous: isValidPosition(incoming.previous)
        ? { x: Number(incoming.previous.x), y: Number(incoming.previous.y) }
        : previousRecord?.current || { ...incoming.current },
      moving: normalizeFlag(incoming.moving),
      falling: normalizeFlag(incoming.falling),
      heartRate
    };

    history.push(record);
    await writeHistory(history);
    res.status(201).json({ saved: true, record });
  } catch (error) {
    console.error("Unable to save monitoring data:", error.message);
    res.status(500).json({ error: "Unable to save monitoring data." });
  }
});

app.get("/analyze", async (_req, res) => {
  try {
    const history = await readHistory();

    if (history.length === 0) {
      return res.json({
        result: "No monitoring data is available yet. Start the simulator or connect a data source.\n\nRISK: NONE"
      });
    }

    if (!GROQ_API_KEY || GROQ_API_KEY === "your_groq_api_key_here") {
      return res.status(503).json({
        result: "AI analysis is not configured. Add GROQ_API_KEY to your local .env file.\n\nRISK: UNAVAILABLE"
      });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: "user",
              content: `${SYSTEM_MESSAGE}\n\nRecent monitoring records:\n${JSON.stringify(history.slice(-5))}`
            }
          ],
          temperature: 0.2,
          max_completion_tokens: 400,
          reasoning_effort: "low",
          reasoning_format: "hidden"
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = responseBody.error?.message || `Groq returned HTTP ${response.status}`;
      throw new Error(apiMessage);
    }

    const aiText = responseBody.choices?.[0]?.message?.content;
    if (typeof aiText !== "string" || aiText.trim() === "") {
      throw new Error("The AI provider returned an empty response.");
    }

    res.json({ result: aiText.trim() });
  } catch (error) {
    console.error("AI analysis failed:", error.message);
    res.status(502).json({
      result: "AI analysis is currently unavailable. Check your Groq API key, model setting, and network connection. This is an application error, not a risk assessment.\n\nRISK: UNAVAILABLE"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SafeNet is running at http://localhost:${PORT}`);
  console.log(`Monitoring data file: ${DATA_FILE}`);
});
