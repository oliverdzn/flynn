/* =========================================================================
   Olivia's Birthday Wall (gallery2) — view routing, selfie capture/
   compression, Firestore guestbook write + live listener, fixed bubble
   pool (no drifting animation), modal.
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
  if (id === "view-gallery") repackBubbles();
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

/* ===================== GALLERY: FIXED BUBBLE POOL ===================== */
// Every guest always has a bubble — there's no queue and no cap. Instead,
// whenever the guest list changes (or the viewport resizes), we recompute
// a single layout pass for ALL bubbles at once: bubble diameter shrinks as
// the count grows so everyone fits the visible pond without scrolling,
// like balls settling into a bowl. No CSS animation and no
// requestAnimationFrame loop are involved in showing a bubble, which
// rules out any animation/rAF timing issue leaving them invisible.
const pond = document.getElementById("bubblePond");
const galleryStatus = document.getElementById("galleryStatus");

const MIN_SIZE = 56;
const MAX_SIZE = 120;
const PACK_EFFICIENCY = 0.72; // conservative fudge factor for a loose, organic (non-hex-tight) scatter
const PLACEMENT_ATTEMPTS = 40;

const guests = new Map(); // id -> data
let hasReceivedInitialSnapshot = false;
let resizeTimer = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function isGalleryActive() {
  return document.getElementById("view-gallery").classList.contains("active");
}

function computeBubbleSize(n, w, h) {
  const area = Math.max(w * h, 1);
  const idealArea = (area * PACK_EFFICIENCY) / Math.max(n, 1);
  const idealDiameter = 2 * Math.sqrt(idealArea / Math.PI);
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(idealDiameter)));
}

// Best-candidate random placement: for each bubble, sample a handful of
// random spots and keep whichever is farthest from every bubble already
// placed. Guaranteed to terminate and place every bubble even if the pond
// is too small to fit them all without any overlap at all.
function packCircles(n, size, w, h) {
  const r = size / 2;
  const spanW = Math.max(w - size, 0);
  const spanH = Math.max(h - size, 0);
  const placed = [];

  for (let i = 0; i < n; i++) {
    let best = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = r + Math.random() * spanW;
      const y = r + Math.random() * spanH;

      if (placed.length === 0) { best = { x, y }; break; }

      let minDist = Infinity;
      for (const p of placed) {
        const d = Math.hypot(x - p.x, y - p.y) - (r + p.r);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) { bestScore = minDist; best = { x, y }; }
      if (minDist > 6) break; // good enough gap, stop sampling early
    }

    placed.push({ x: best.x, y: best.y, r });
  }

  return placed.map(p => ({ left: Math.round(p.x - r), top: Math.round(p.y - r) }));
}

function createBubbleElement(id, data, size) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "bubble";
  el.style.width = size + "px";
  el.style.height = size + "px";

  const safeName = escapeHtml(data.name || "A guest");
  el.innerHTML = `
    <span class="bubble-shell">
      <span class="bubble-shine" aria-hidden="true"></span>
      <span class="bubble-photo-ring"><img src="${data.photoBase64}" alt="${safeName}'s selfie" loading="eager" decoding="async"></span>
    </span>
  `;
  el.addEventListener("click", () => popBubble(id));
  return el;
}

function repackBubbles() {
  if (!isGalleryActive()) return;

  const n = guests.size;
  if (n === 0) {
    pond.innerHTML = "";
    if (hasReceivedInitialSnapshot) showEmptyState();
    return;
  }

  clearEmptyState();

  const rect = pond.getBoundingClientRect();
  const size = computeBubbleSize(n, rect.width, rect.height);
  const positions = packCircles(n, size, rect.width, rect.height);

  pond.innerHTML = "";
  let i = 0;
  guests.forEach((data, id) => {
    const el = createBubbleElement(id, data, size);
    el.style.left = positions[i].left + "px";
    el.style.top = positions[i].top + "px";
    pond.appendChild(el);
    i++;
  });
}

function popBubble(id) {
  const data = guests.get(id);
  if (!data) return;
  guests.delete(id);
  repackBubbles();
  openModal(data);
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

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(repackBubbles, 150);
});

function startGalleryListener() {
  const q = query(collection(db, "guestbook"), orderBy("createdAt", "asc"));
  onSnapshot(
    q,
    snapshot => {
      galleryStatus.textContent = "";
      galleryStatus.classList.remove("is-error");
      hasReceivedInitialSnapshot = true;

      let changed = false;
      snapshot.docChanges().forEach(change => {
        if (change.type === "added" && !guests.has(change.doc.id)) {
          guests.set(change.doc.id, change.doc.data());
          changed = true;
        }
      });
      if (changed) repackBubbles();
      else if (guests.size === 0) showEmptyState();
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
