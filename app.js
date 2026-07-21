// Add desktop-first focus behavior for the search input.
function initSearchFocus() {
  if (window.matchMedia("(max-width: 680px)").matches) {
    return;
  }

  const searchInput = document.getElementById("duckduckgo-search");
  if (!searchInput) {
    return;
  }

  searchInput.focus();
  searchInput.select();
}

const DOMAIN_ACCENTS = {
  "dr.dk": "#000000",
  "nyheder.tv2.dk": "#ff0000",
  "lapresse.ca": "#ed1c23",
  "cnn.com": "#cc0000",
  "theguardian.com": "#052962",
  "macrumors.com": "#101114",
  "nintendolife.com": "#111111",
  "retrohandhelds.gg": "#2a7c4a",
  "youtube.com": "#ff0000",
};

function getMappedAccent(hostname) {
  const domains = Object.keys(DOMAIN_ACCENTS);
  for (const domain of domains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return DOMAIN_ACCENTS[domain];
    }
  }
  return null;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getDominantColorFromImage(img) {
  try {
    const canvas = document.createElement("canvas");
    const size = 24;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return null;
    }

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 80) {
        continue;
      }

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;

      // Skip almost-white and almost-black anti-aliased pixels to avoid noise.
      const brightness = (r + g + b) / 3;
      if (brightness > 245 || brightness < 12) {
        continue;
      }

      const step = 24;
      const qr = Math.round(r / step) * step;
      const qg = Math.round(g / step) * step;
      const qb = Math.round(b / step) * step;
      const key = `${qr},${qg},${qb}`;

      // Prefer saturated colors so branding tones win over neutral grays.
      const weight = 1 + saturation * 2;
      buckets.set(key, (buckets.get(key) || 0) + weight);
    }

    if (buckets.size === 0) {
      return null;
    }

    let bestKey = null;
    let bestWeight = -1;
    for (const [key, weight] of buckets.entries()) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestKey = key;
      }
    }

    if (!bestKey) {
      return null;
    }

    const [r, g, b] = bestKey.split(",").map((value) => Number(value));
    return rgbToHex(r, g, b);
  } catch {
    // Cross-origin icons can taint the canvas; skip dominant-color extraction.
    return null;
  }
}

// Load favicons for links that do not provide their own image.
function initFavicons() {
  const links = document.querySelectorAll(".quick-links .icon-link:not([data-no-favicon])");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) {
      return;
    }

    try {
      const url = new URL(href);

      const mappedAccent = getMappedAccent(url.hostname);
      if (mappedAccent) {
        link.style.setProperty("--accent", mappedAccent);
      }

      const minIconSize = 16;

      // Use 32x32 favicon sources and keep the icon itself fixed-size.
      const sources = [
        `https://api.faviconkit.com/${url.hostname}/32`,
        `${url.origin}/favicon.ico`,
        `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`,
      ];

      let attempt = 0;
      const tryNext = () => {
        if (attempt >= sources.length) {
          return;
        }

        const img = document.createElement("img");
        img.className = "icon-favicon icon-favicon-auto";
        img.alt = "";
        img.decoding = "async";

        img.addEventListener("load", () => {
          const width = img.naturalWidth || 0;
          const height = img.naturalHeight || 0;

          if (width < minIconSize || height < minIconSize) {
            tryNext();
            return;
          }

          if (!mappedAccent) {
            const dominant = getDominantColorFromImage(img);
            if (dominant) {
              link.style.setProperty("--accent", dominant);
            }
          }

          link.replaceChildren(img);
        });

        img.addEventListener("error", tryNext);
        img.src = sources[attempt];
        attempt += 1;
      };

      tryNext();
    } catch {
      // Ignore invalid URLs to keep the launcher resilient.
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initSearchFocus();
  initFavicons();
});
