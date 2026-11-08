import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data.json"));
const MAX_HISTORY = 20;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomStep() {
  return Math.floor(Math.random() * 3) - 1;
}

function readData() {
  if (!fs.existsSync(FILE)) return { history: [] };
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  return { history: Array.isArray(parsed.history) ? parsed.history : [] };
}

function simulate() {
  try {
    const data = readData();
    const history = data.history;
    const last = history.at(-1) || {
      current: { x: 2, y: 2 },
      heartRate: 90
    };

    const previous = last.current || { x: 2, y: 2 };
    const current = {
      x: clamp(previous.x + randomStep(), 1, 4),
      y: clamp(previous.y + randomStep(), 1, 4)
    };
    const moving = current.x !== previous.x || current.y !== previous.y ? 1 : 0;

    let heartRate = clamp(Number(last.heartRate ?? 90) + (Math.random() * 6 - 3), 50, 120);
    const falling = Math.random() < 0.05 ? 1 : 0;
    if (falling) heartRate = clamp(heartRate - 40, 20, 120);

    const entry = {
      timestamp: Date.now(),
      current,
      previous: { ...previous },
      moving,
      falling,
      heartRate: Math.round(heartRate)
    };

    history.push(entry);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ history: history.slice(-MAX_HISTORY) }, null, 2));
    console.log("Simulated record:", entry);
  } catch (error) {
    console.error("Simulation update failed:", error.message);
  }
}

console.log("SafeNet demo simulator started. Press Ctrl+C to stop.");
simulate();
setInterval(simulate, 3000);
