/* =========================================================================
   Olivia's Birthday Wall — view routing, selfie capture/compression,
   Firestore guestbook write + live listener, floating bubble pond, modal.
   ========================================================================= */
import { db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// Bubbles never display larger than ~130px (modal) on screen, so 280px
// source photos already give 2x headroom for retina — smaller than the
// original 400px means smaller Firestore payloads and cheaper decodes
// per bubble, which matters once dozens of guests have submitted.
const PHOTO_SIZE = 280;
const TARGET_BYTES = 150 * 1024;
const MAX_QUALITY_STEPS = [0.7, 0.6, 0.5, 0.4, 0.3];

const state = { photoDataUrl: null, name: "", message: "" };

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

/* ===================== VIEW ROUTING ===================== */
// TEMP: gallery is the default view while we tune the layout. Set back to
// "view-landing" (and remove the "Start Over" button in index.html) when done.
const DEFAULT_VIEW = "view-gallery";

const views = document.querySelectorAll(".view");
function switchView(id) {
  views.forEach(v => v.classList.toggle("active", v.id === id));
  window.scrollTo({ top: 0, behavior: "instant" });
  if (id === "view-gallery") startBubbleLoop();
  else stopBubbleLoop();
}

document.getElementById("joinBtn").addEventListener("click", () => switchView("view-capture"));
document.getElementById("addAnotherBtn").addEventListener("click", () => {
  resetCaptureState();
  switchView("view-capture");
});
document.getElementById("backToLandingBtn").addEventListener("click", () => switchView("view-landing"));

/* ===================== STEP 1: SELFIE CAPTURE ===================== */
const cameraInput = document.getElementById("cameraInput");
const captureCanvas = document.getElementById("captureCanvas");
const captureCtx = captureCanvas.getContext("2d");
const capturePlaceholder = document.getElementById("capturePlaceholder");
const captureActionsInitial = document.getElementById("captureActionsInitial");
const captureActionsResult = document.getElementById("captureActionsResult");

document.getElementById("takePhotoBtn").addEventListener("click", () => cameraInput.click());
document.getElementById("retakeBtn").addEventListener("click", resetCaptureState);
document.getElementById("nextBtn").addEventListener("click", () => {
  document.getElementById("messageThumb").src = state.photoDataUrl;
  switchView("view-message");
});

cameraInput.addEventListener("change", () => {
  const file = cameraInput.files && cameraInput.files[0];
  if (file) handleSelfie(file);
});

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("Could not read photo")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function drawCover(ctx, img, size) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(size / iw, size / ih);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
}

function estimateBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

function compressCanvas(canvas) {
  let best = canvas.toDataURL("image/jpeg", MAX_QUALITY_STEPS[0]);
  for (const q of MAX_QUALITY_STEPS) {
    const attempt = canvas.toDataURL("image/jpeg", q);
    best = attempt;
    if (estimateBytes(attempt) <= TARGET_BYTES) break;
  }
  return best;
}

async function handleSelfie(file) {
  try {
    const img = await loadImageFromFile(file);
    captureCanvas.width = PHOTO_SIZE;
    captureCanvas.height = PHOTO_SIZE;
    drawCover(captureCtx, img, PHOTO_SIZE);

    state.photoDataUrl = compressCanvas(captureCanvas);

    captureCanvas.hidden = false;
    capturePlaceholder.hidden = true;
    captureActionsInitial.hidden = true;
    captureActionsResult.hidden = false;
  } catch (err) {
    capturePlaceholder.textContent = "Could not read that photo, please try again.";
  }
}

function resetCaptureState() {
  state.photoDataUrl = null;
  captureCanvas.hidden = true;
  capturePlaceholder.hidden = false;
  capturePlaceholder.innerHTML = "🦋<br>Your photo will appear here";
  captureActionsInitial.hidden = false;
  captureActionsResult.hidden = true;
  cameraInput.value = "";
}

/* ===================== STEP 2: MESSAGE + SUBMIT ===================== */
const messageForm = document.getElementById("messageForm");
const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const charCount = document.getElementById("charCount");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const retrySubmitBtn = document.getElementById("retrySubmitBtn");

messageInput.addEventListener("input", () => {
  charCount.textContent = String(messageInput.value.length);
});

messageForm.addEventListener("submit", e => {
  e.preventDefault();
  attemptSubmit();
});

retrySubmitBtn.addEventListener("click", attemptSubmit);

async function attemptSubmit() {
  state.name = nameInput.value.trim();
  state.message = messageInput.value.trim();

  if (!state.name || !state.message || !state.photoDataUrl) {
    setFormStatus("Please add your name, a message, and a photo.", "error");
    return;
  }

  submitBtn.disabled = true;
  retrySubmitBtn.hidden = true;
  setFormStatus("Sending your greeting…", "");

  try {
    await withTimeout(
      addDoc(collection(db, "guestbook"), {
        name: state.name,
        message: state.message,
        photoBase64: state.photoDataUrl,
        createdAt: serverTimestamp()
      }),
      15000,
      "Request timed out"
    );

    setFormStatus("Sent! 🎉", "success");
    messageForm.reset();
    charCount.textContent = "0";
    resetCaptureState();
    switchView("view-gallery");
    setFormStatus("", "");
  } catch (err) {
    setFormStatus("Couldn't send your greeting. Check your connection and try again.", "error");
    retrySubmitBtn.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
}

function setFormStatus(message, type) {
  formStatus.textContent = message;
  formStatus.classList.toggle("is-error", type === "error");
  formStatus.classList.toggle("is-success", type === "success");
}

/* ===================== GALLERY: BUBBLE POND ===================== */
// Only MAX_ACTIVE_BUBBLES ever exist in the DOM/animating at once, no matter
// how many guests have submitted — everyone else waits in entryQueue and
// gets their turn as bubbles drift off-screen or get popped. This keeps
// performance flat whether there are 10 guests or 200.
const pond = document.getElementById("bubblePond");
const galleryStatus = document.getElementById("galleryStatus");

const MAX_ACTIVE_BUBBLES = 14;
const BUBBLE_MIN = 72;
const BUBBLE_MAX = 112;
const SPEED_MIN = 18;
const SPEED_MAX = 34;
const WANDER_ACCEL = 16;

// Continuous drifting motion is JS-driven (requestAnimationFrame), so the
// CSS prefers-reduced-motion media query alone can't cover it — check it
// here too and keep bubbles static (spawned in place, still tappable).
const PREFERS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const entryQueue = [];
const activeBubbles = new Map();
let hasReceivedInitialSnapshot = false;
let rafHandle = null;
let lastFrameTime = null;

function isGalleryActive() {
  return document.getElementById("view-gallery").classList.contains("active");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function enqueueEntry(id, data) {
  if (activeBubbles.has(id) || entryQueue.some(e => e.id === id)) return;
  entryQueue.push({ id, data });
  clearEmptyState();
  if (isGalleryActive()) trySpawnFromQueue();
}

function trySpawnFromQueue() {
  if (!isGalleryActive()) return;
  while (entryQueue.length && activeBubbles.size < MAX_ACTIVE_BUBBLES) {
    spawnBubble(entryQueue.shift());
  }
}

function randomEdgeSpawn(size, boundsW, boundsH) {
  const margin = size * 0.6;
  const edge = Math.floor(Math.random() * 4);
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  const inward = speed * 0.6 + Math.random() * speed * 0.4;
  const lateral = (Math.random() - 0.5) * speed;

  if (edge === 0) return { x: Math.random() * boundsW, y: -margin, vx: lateral, vy: inward };
  if (edge === 1) return { x: boundsW + margin, y: Math.random() * boundsH, vx: -inward, vy: lateral };
  if (edge === 2) return { x: Math.random() * boundsW, y: boundsH + margin, vx: lateral, vy: -inward };
  return { x: -margin, y: Math.random() * boundsH, vx: inward, vy: lateral };
}

// Used instead of randomEdgeSpawn when motion is reduced: bubbles never
// drift, so they need to spawn already inside the visible bounds rather
// than at the edges expecting to drift inward.
function randomStaticSpawn(size, boundsW, boundsH) {
  const margin = size * 0.5;
  const x = margin + Math.random() * Math.max(boundsW - size, 0);
  const y = margin + Math.random() * Math.max(boundsH - size, 0);
  return { x, y, vx: 0, vy: 0 };
}

function spawnBubble(entry) {
  const { id, data } = entry;
  if (activeBubbles.has(id)) return;

  const rect = pond.getBoundingClientRect();
  const size = Math.round(BUBBLE_MIN + Math.random() * (BUBBLE_MAX - BUBBLE_MIN));
  const { x, y, vx, vy } = PREFERS_REDUCED_MOTION
    ? randomStaticSpawn(size, rect.width, rect.height)
    : randomEdgeSpawn(size, rect.width, rect.height);

  const el = document.createElement("button");
  el.type = "button";
  el.className = "bubble";
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.transform = `translate(${x}px, ${y}px)`;

  const safeName = escapeHtml(data.name || "A guest");
  el.innerHTML = `
    <span class="bubble-inner">
      <span class="bubble-shell">
        <span class="bubble-shine" aria-hidden="true"></span>
        <span class="bubble-photo-ring"><img src="${data.photoBase64}" alt="${safeName}'s selfie" loading="eager" decoding="async"></span>
      </span>
    </span>
  `;

  const bubble = { id, data, el, x, y, vx, vy, size, popped: false };
  el.addEventListener("click", () => popBubble(bubble));
  pond.appendChild(el);
  activeBubbles.set(id, bubble);
}

function despawnBubble(id, wasPopped) {
  const b = activeBubbles.get(id);
  if (!b) return;
  activeBubbles.delete(id);
  b.el.remove();
  if (!wasPopped) entryQueue.push({ id: b.id, data: b.data });
  trySpawnFromQueue();
  maybeShowEmptyState();
}

function popBubble(b) {
  if (b.popped) return;
  b.popped = true;
  b.el.classList.add("is-popping");
  b.el.addEventListener("animationend", () => despawnBubble(b.id, true), { once: true });
  openModal(b.data);
}

function stepPhysics(dt) {
  const rect = pond.getBoundingClientRect();
  activeBubbles.forEach(b => {
    if (b.popped) return;

    b.vx += (Math.random() - 0.5) * WANDER_ACCEL * dt;
    b.vy += (Math.random() - 0.5) * WANDER_ACCEL * dt;

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > SPEED_MAX) {
      b.vx = (b.vx / speed) * SPEED_MAX;
      b.vy = (b.vy / speed) * SPEED_MAX;
    } else if (speed < SPEED_MIN * 0.4) {
      const angle = Math.random() * Math.PI * 2;
      b.vx += Math.cos(angle) * SPEED_MIN * 0.4;
      b.vy += Math.sin(angle) * SPEED_MIN * 0.4;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;

    // half the bubble's own size = the point where the whole circle has
    // fully cleared the edge, i.e. genuinely "out of camera"
    const margin = b.size * 0.5;
    if (b.x < -margin || b.x > rect.width + margin || b.y < -margin || b.y > rect.height + margin) {
      despawnBubble(b.id, false);
    }
  });
}

function loopFrame(ts) {
  if (lastFrameTime == null) lastFrameTime = ts;
  const dt = Math.min((ts - lastFrameTime) / 1000, 0.1);
  lastFrameTime = ts;
  stepPhysics(dt);
  rafHandle = requestAnimationFrame(loopFrame);
}

function startBubbleLoop() {
  trySpawnFromQueue();
  if (PREFERS_REDUCED_MOTION || rafHandle != null) return;
  lastFrameTime = null;
  rafHandle = requestAnimationFrame(loopFrame);
}

function stopBubbleLoop() {
  if (rafHandle != null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

function maybeShowEmptyState() {
  if (activeBubbles.size === 0 && entryQueue.length === 0 && hasReceivedInitialSnapshot) {
    showEmptyState();
  }
}

function showEmptyState() {
  if (pond.querySelector(".bubble-empty")) return;
  const p = document.createElement("p");
  p.className = "bubble-empty";
  p.textContent = "No greetings yet — be the first! 🎈";
  pond.appendChild(p);
}

function clearEmptyState() {
  const empty = pond.querySelector(".bubble-empty");
  if (empty) empty.remove();
}

function startGalleryListener() {
  const q = query(collection(db, "guestbook"), orderBy("createdAt", "asc"));
  onSnapshot(
    q,
    snapshot => {
      galleryStatus.textContent = "";
      galleryStatus.classList.remove("is-error");
      hasReceivedInitialSnapshot = true;
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") enqueueEntry(change.doc.id, change.doc.data());
      });
      maybeShowEmptyState();
    },
    err => {
      galleryStatus.textContent = "Couldn't load the birthday wall. Check your connection.";
      galleryStatus.classList.add("is-error");
    }
  );
}

/* ===================== MODAL ===================== */
const modal = document.getElementById("guestModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalPhoto = document.getElementById("modalPhoto");
const modalName = document.getElementById("modalName");
const modalMessage = document.getElementById("modalMessage");

function openModal(data) {
  modalPhoto.src = data.photoBase64;
  modalPhoto.alt = (data.name || "Guest") + "'s selfie";
  modalName.textContent = data.name || "A guest";
  modalMessage.textContent = data.message || "";
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

/* ===================== INIT ===================== */
switchView(DEFAULT_VIEW);
startGalleryListener();
