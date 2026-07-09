/* =========================================================================
   LANDMARK STEPS — edit this array to add/remove/reorder directions.
   image:   filename of the screenshot (same folder as index.html)
   caption: short Tagalog/Taglish instruction for that step
   ========================================================================= */
const landmarks = [
  {
    image: "road1.JPG",
    alt: "Del Rosario stoplight",
    caption: "Mula sa Del Rosario stoplight, pumasok sa Del Rosario Proper (right if coming from Angeles, left if coming from San Fernando)"
  },
  {
    image: "road2.JPG",
    alt: "Right turn at the corner before Mega Dike",
    caption: "Pumasok sa kaliwa (left) na kanto bago umakyat sa Mega Dike."
  },
  {
    image: "road3.JPG",
    alt: "First road split, take the right fork",
    caption: "Sa unang split na daan, kumanan (right)."
  },
  {
    image: "jerlens_gate.JPG",
    alt: "Jerlen Farm and Resort gate",
    caption: "Makikita niyo na ang gate ng Jerlen Farm and Resort — diretso lang papasok."
  }
];

/* ===================== RENDER LANDMARK STEPS ===================== */
function renderLandmarks() {
  const list = document.getElementById("landmark-list");
  if (!list) return;

  list.innerHTML = landmarks.map((step, i) => {
    const isLast = i === landmarks.length - 1;
    return `
      <div class="landmark-step reveal">
        <div class="landmark-marker">
          <div class="landmark-number">${i + 1}</div>
          ${isLast ? "" : '<div class="landmark-line"></div>'}
        </div>
        <div class="landmark-card">
          <div class="landmark-image-wrap">
            <img src="${step.image}" alt="${step.alt}"
                 onerror="this.closest('.landmark-image-wrap').innerHTML='Add photo: ${step.image}'">
          </div>
          <p class="landmark-caption">${step.caption}</p>
        </div>
      </div>
    `;
  }).join("");
}

/* ===================== RENDER QR CODES ===================== */
function renderQRCode(containerId, url) {
  const container = document.getElementById(containerId);
  if (!container || typeof qrcode === "undefined") return;

  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  container.innerHTML = qr.createImgTag(4, 4);
}

/* ===================== SCROLL-REVEAL ===================== */
function initReveal() {
  const targets = Array.from(document.querySelectorAll(".reveal"));
  if (!targets.length) return;

  // manual viewport check — initial state + fallback if the observer misbehaves
  function checkViewport() {
    const vh = window.innerHeight;
    targets.forEach(el => {
      if (el.classList.contains("is-visible")) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh - 40 && r.bottom > 0) el.classList.add("is-visible");
    });
  }

  if ("IntersectionObserver" in window) {
    // held on window so the observer can't be garbage-collected
    window.__revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          window.__revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    targets.forEach(el => window.__revealObserver.observe(el));
  }

  let ticking = false;
  function onScrollOrResize() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { checkViewport(); ticking = false; });
  }

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });
  checkViewport();
}

document.addEventListener("DOMContentLoaded", () => {
  renderLandmarks();

  renderQRCode("qr-church-waze", "https://www.waze.com/ul?ll=15.0956409%2C120.6485541&navigate=yes&zoom=17");
  renderQRCode("qr-church-gmaps", "https://maps.app.goo.gl/5EctbTBjNRFkuyFG8");

  renderQRCode("qr-resort-waze", "https://www.waze.com/ul?ll=15.0535156%2C120.6402261&navigate=yes&zoom=17");
  renderQRCode("qr-resort-gmaps", "https://maps.app.goo.gl/yw5xvFV6weHmTxjc6");

  initReveal();
});
