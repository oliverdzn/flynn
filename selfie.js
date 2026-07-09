/* =========================================================================
   SELFIE / CHECK-IN — capture via file input (front camera), composite
   onto the 1080x1080 branded frame, then download or share.
   Edit FRAME_SRC below if you swap the overlay artwork.
   ========================================================================= */
const CANVAS_SIZE = 1080;
const FRAME_SRC = "binyag_frame_transparent.png";
const DOWNLOAD_NAME = "olivia-flynn-binyag.png";

const cameraInput = document.getElementById("cameraInput");
const canvas = document.getElementById("selfieCanvas");
const ctx = canvas.getContext("2d");
const frameEl = document.getElementById("selfieFrame");
const placeholder = document.getElementById("selfiePlaceholder");
const captureActions = document.getElementById("captureActions");
const resultActions = document.getElementById("resultActions");
const captureBtn = document.getElementById("captureBtn");
const shareBtn = document.getElementById("shareBtn");
const downloadBtn = document.getElementById("downloadBtn");
const retakeBtn = document.getElementById("retakeBtn");
const statusEl = document.getElementById("selfieStatus");

canvas.hidden = true;

let frameImagePromise = null;
function loadFrameImage() {
  if (frameImagePromise) return frameImagePromise;
  frameImagePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load frame overlay: " + FRAME_SRC));
    img.src = FRAME_SRC;
  });
  return frameImagePromise;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("Could not read photo")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/* cover-fit draw: crop+center to fill a square, like object-fit: cover */
function drawCover(context, img, size) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(size / iw, size / ih);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  context.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
}

function setStatus(message, isError) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("is-error", !!isError);
}

async function handlePhoto(file) {
  setStatus("Framing your photo…");
  try {
    const [photo, frame] = await Promise.all([loadImageFromFile(file), loadFrameImage()]);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    drawCover(ctx, photo, CANVAS_SIZE);
    ctx.drawImage(frame, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    canvas.hidden = false;
    frameEl.classList.add("has-photo");
    captureActions.hidden = true;
    resultActions.hidden = false;
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Something went wrong, please try again.", true);
  }
}

function resetToCapture() {
  canvas.hidden = true;
  frameEl.classList.remove("has-photo");
  captureActions.hidden = false;
  resultActions.hidden = true;
  cameraInput.value = "";
  setStatus("");
}

function canvasToBlob() {
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

captureBtn.addEventListener("click", () => cameraInput.click());

cameraInput.addEventListener("change", () => {
  const file = cameraInput.files && cameraInput.files[0];
  if (file) handlePhoto(file);
});

retakeBtn.addEventListener("click", resetToCapture);

downloadBtn.addEventListener("click", async () => {
  const blob = await canvasToBlob();
  if (!blob) { setStatus("Could not prepare download, please try again.", true); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = DOWNLOAD_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

async function trySetupShare() {
  if (!navigator.share || !navigator.canShare) return;
  const testBlob = await canvasToBlob();
  if (!testBlob) return;
  const testFile = new File([testBlob], DOWNLOAD_NAME, { type: "image/png" });
  if (navigator.canShare({ files: [testFile] })) shareBtn.hidden = false;
}

shareBtn.addEventListener("click", async () => {
  const blob = await canvasToBlob();
  if (!blob) { setStatus("Could not prepare photo, please try again.", true); return; }
  const file = new File([blob], DOWNLOAD_NAME, { type: "image/png" });
  try {
    await navigator.share({
      files: [file],
      title: "Olivia Flynn's Christening & 1st Birthday",
      text: "Salamat sa pagdalo! 🦋"
    });
  } catch (err) {
    if (err.name !== "AbortError") setStatus("Could not share, try Download instead.", true);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadFrameImage().catch(err => setStatus(err.message, true));
  trySetupShare();
});
