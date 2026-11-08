const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

/* ===== OFFSCREEN CANVAS FOR WALLS ===== */
const wallCanvas = document.createElement("canvas");
wallCanvas.width = canvas.width;
wallCanvas.height = canvas.height;
const wallCtx = wallCanvas.getContext("2d");

/* ===== LOGICAL SCALE ===== */
const GRID_PX = 40;   // 1 grid square = 1 meter

/* ===== STATE ===== */
let startX, startY;
let isDrawing = false;
let drawMode = "room"; // room | door | restricted

let rooms = [];
let doors = [];
let restricted = [];

/* ===== UNDO HISTORY ===== */
let history = [];

/* ===== INIT ===== */
saveState();
redraw();

/* ===== EVENTS ===== */
canvas.addEventListener("mousedown", e => {
  startX = snap(e.offsetX);
  startY = snap(e.offsetY);
  isDrawing = true;

  if (e.ctrlKey) drawMode = "restricted";
  else if (e.shiftKey) drawMode = "door";
  else drawMode = "room";
});

canvas.addEventListener("mousemove", e => {
  if (!isDrawing) return;

  redraw();

  const x = snap(e.offsetX);
  const y = snap(e.offsetY);

  drawPreview(startX, startY, x - startX, y - startY);
  drawDimensions(startX, startY, x - startX, y - startY);
});

canvas.addEventListener("mouseup", e => {
  if (!isDrawing) return;

  const rect = normalize({
    x: startX,
    y: startY,
    w: snap(e.offsetX) - startX,
    h: snap(e.offsetY) - startY
  });

  if (drawMode === "room") {
    const name = prompt("Room name?");
    if (name) {
      rect.name = name;
      rect.color = randomColor();
      rooms.push(rect);
      saveState();
    }
  }

  if (drawMode === "door") {
    doors.push(rect);
    saveState();
  }

  if (drawMode === "restricted") {
    restricted.push(rect);
    saveState();
  }

  isDrawing = false;
  redraw();
});

/* ===== UNDO ===== */
document.getElementById("undoBtn").addEventListener("click", undo);

function undo() {
  if (history.length <= 1) return;

  history.pop();
  const prev = history[history.length - 1];

  rooms = structuredClone(prev.rooms);
  doors = structuredClone(prev.doors);
  restricted = structuredClone(prev.restricted);

  redraw();
}

function saveState() {
  history.push({
    rooms: structuredClone(rooms),
    doors: structuredClone(doors),
    restricted: structuredClone(restricted)
  });
}

/* ===== MAIN DRAW ===== */
function redraw() {
  // background
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid FIRST
  drawGrid();

  // rooms + restricted
  rooms.forEach(drawRoomFill);
  restricted.forEach(drawRestrictedArea);

  // walls + doors
  drawWallsOffscreen();
  ctx.drawImage(wallCanvas, 0, 0);
}

/* ===== ROOM FILLS ===== */
function drawRoomFill(r) {
  ctx.fillStyle = r.color;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2);
}

/* ===== RESTRICTED AREAS ===== */
function drawRestrictedArea(r) {
  ctx.fillStyle = "rgba(239,68,68,0.28)";
  ctx.fillRect(r.x, r.y, r.w, r.h);

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);

  ctx.fillStyle = "#fecaca";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RESTRICTED", r.x + r.w / 2, r.y + r.h / 2);
}

/* ===== WALL LAYER ===== */
function drawWallsOffscreen() {
  wallCtx.clearRect(0, 0, wallCanvas.width, wallCanvas.height);

  wallCtx.strokeStyle = "#38bdf8";
  wallCtx.lineWidth = 2;

  rooms.forEach(r => {
    wallCtx.strokeRect(r.x, r.y, r.w, r.h);
  });

  wallCtx.save();
  wallCtx.globalCompositeOperation = "destination-out";
  doors.forEach(d => {
    wallCtx.fillRect(d.x, d.y, d.w, d.h);
  });
  wallCtx.restore();
}

/* ===== GRID (BRIGHTER & CORRECT) ===== */
function drawGrid() {
  ctx.lineWidth = 1;

  for (let x = 0.5; x <= canvas.width; x += GRID_PX) {
    ctx.beginPath();
    ctx.strokeStyle =
      x % (GRID_PX * 5) === 0
        ? "rgba(56,189,248,0.6)"
        : "rgba(56,189,248,0.35)";
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0.5; y <= canvas.height; y += GRID_PX) {
    ctx.beginPath();
    ctx.strokeStyle =
      y % (GRID_PX * 5) === 0
        ? "rgba(56,189,248,0.6)"
        : "rgba(56,189,248,0.35)";
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

/* ===== PREVIEW ===== */
function drawPreview(x, y, w, h) {
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "#38bdf8";
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

/* ===== DIMENSIONS ===== */
function drawDimensions(x, y, w, h) {
  const widthM = Math.abs(w) / GRID_PX;
  const heightM = Math.abs(h) / GRID_PX;

  ctx.fillStyle = "#cbd5f5";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(
    `${widthM.toFixed(1)} m x ${heightM.toFixed(1)} m`,
    x + w / 2,
    y + h / 2
  );
}

/* ===== HELPERS ===== */
function snap(v) {
  return Math.round(v / GRID_PX) * GRID_PX;
}

function normalize(r) {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h)
  };
}

function randomColor() {
  const colors = [
    "rgba(147,197,253,0.45)",
    "rgba(134,239,172,0.45)",
    "rgba(253,224,71,0.45)",
    "rgba(251,182,206,0.45)",
    "rgba(216,180,254,0.45)"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/* ================= AI + SENSOR INTEGRATION ================= */

async function updateSensorsFromBackend() {
  try {
    const res = await fetch("/data");
    if (!res.ok) throw new Error(`Data endpoint returned ${res.status}`);
    const data = await res.json();
    const last = data.history?.at(-1);
    if (!last) {
      document.getElementById("movement").innerText = "NO DATA";
      document.getElementById("activity").innerText = "Waiting";
      document.getElementById("velocity").innerText = "–";
      document.getElementById("heartRate").innerText = "–";
      document.getElementById("restricted").innerText = "NOT CONNECTED";
      return;
    }

    document.getElementById("movement").innerText =
      last.moving ? "MOVING" : "NOT MOVING";

    document.getElementById("activity").innerText =
      last.moving ? "Active" : "Inactive";

    document.getElementById("velocity").innerText =
      last.moving ? "Normal" : "0";

    document.getElementById("heartRate").innerText =
      last.heartRate + " BPM";

    // Restricted-zone evaluation is not wired to sensor coordinates yet.
    document.getElementById("restricted").innerText = "NOT CONNECTED";

  } catch (err) {
    console.error("Sensor update failed", err);
  }
}

/* ===== AI UPDATE (EXTENDS TO BOTTOM) ===== */
async function updateAIFromBackend() {
  const aiBox = document.getElementById("aiResult");

  try {
    const res = await fetch("/analyze");
    const data = await res.json();

    aiBox.innerText = data.result || "AI analysis is unavailable.";

    // 🔑 force scroll to bottom so AI fills panel visually
    aiBox.scrollTop = aiBox.scrollHeight;

  } catch {
    aiBox.innerText = "AI unavailable";
  }
}

// Initial load
updateSensorsFromBackend();
updateAIFromBackend();

// Live updates
setInterval(updateSensorsFromBackend, 6000);
setInterval(updateAIFromBackend, 10000);
