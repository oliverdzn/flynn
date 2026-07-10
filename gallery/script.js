/* =========================================================================
   Olivia's Birthday Wall — view routing, selfie capture/compression,
   Firestore guestbook write + live listener, balloon gallery, modal.
   ========================================================================= */
import { db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PHOTO_SIZE = 400;
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
const views = document.querySelectorAll(".view");
function switchView(id) {
  views.forEach(v => v.classList.toggle("active", v.id === id));
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.getElementById("joinBtn").addEventListener("click", () => switchView("view-capture"));
document.getElementById("addAnotherBtn").addEventListener("click", () => {
  resetCaptureState();
  switchView("view-capture");
});

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

/* ===================== GALLERY: LIVE LISTENER ===================== */
const balloonField = document.getElementById("balloonField");
const galleryStatus = document.getElementById("galleryStatus");
let renderedCount = 0;

function renderBalloon(id, data) {
  const empty = balloonField.querySelector(".balloon-empty");
  if (empty) empty.remove();

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "balloon";
  btn.dataset.id = id;

  const duration = (4 + Math.random() * 3).toFixed(2) + "s";
  const delay = (-(Math.random() * 5)).toFixed(2) + "s";
  const rotA = (-4 - Math.random() * 3).toFixed(1) + "deg";
  const rotB = (3 + Math.random() * 3).toFixed(1) + "deg";
  btn.style.setProperty("--float-dur", duration);
  btn.style.setProperty("--float-delay", delay);
  btn.style.setProperty("--rot-a", rotA);
  btn.style.setProperty("--rot-b", rotB);
  btn.style.marginTop = Math.round(Math.random() * 22) + "px";

  const safeName = escapeHtml(data.name || "A guest");
  btn.innerHTML = `
    <span class="balloon-body">
      <span class="balloon-photo-ring"><img src="${data.photoBase64}" alt="${safeName}'s selfie" loading="lazy"></span>
      <span class="balloon-knot"></span>
    </span>
    <span class="balloon-string"></span>
    <span class="balloon-name">${safeName}</span>
  `;

  btn.addEventListener("click", () => openModal(btn, data));
  balloonField.appendChild(btn);
  renderedCount++;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function startGalleryListener() {
  const q = query(collection(db, "guestbook"), orderBy("createdAt", "asc"));
  onSnapshot(
    q,
    snapshot => {
      galleryStatus.textContent = "";
      galleryStatus.classList.remove("is-error");
      if (renderedCount === 0 && snapshot.empty) {
        showEmptyState();
      }
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") renderBalloon(change.doc.id, change.doc.data());
      });
    },
    err => {
      galleryStatus.textContent = "Couldn't load the birthday wall. Check your connection.";
      galleryStatus.classList.add("is-error");
    }
  );
}

function showEmptyState() {
  if (balloonField.querySelector(".balloon-empty")) return;
  const p = document.createElement("p");
  p.className = "balloon-empty";
  p.textContent = "No greetings yet — be the first! 🎈";
  balloonField.appendChild(p);
}

/* ===================== MODAL ===================== */
const modal = document.getElementById("guestModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalPhoto = document.getElementById("modalPhoto");
const modalName = document.getElementById("modalName");
const modalMessage = document.getElementById("modalMessage");
let activeBalloon = null;

function openModal(balloonEl, data) {
  activeBalloon = balloonEl;
  balloonEl.classList.add("is-paused");

  modalPhoto.src = data.photoBase64;
  modalPhoto.alt = (data.name || "Guest") + "'s selfie";
  modalName.textContent = data.name || "A guest";
  modalMessage.textContent = data.message || "";

  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  if (activeBalloon) {
    activeBalloon.classList.remove("is-paused");
    activeBalloon = null;
  }
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

/* ===================== INIT ===================== */
startGalleryListener();
