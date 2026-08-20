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

const ICON_ORDER_STORAGE_KEY = "glander.quickLinksOrder.v1";

function getQuickLinksContainer() {
  return document.querySelector(".quick-links");
}

function getSortableLinks(container) {
  return Array.from(container.querySelectorAll(".icon-link"));
}

function getLinkKey(link) {
  return link.getAttribute("href") || link.getAttribute("aria-label") || link.title || "";
}

function restoreQuickLinksOrder() {
  const container = getQuickLinksContainer();
  if (!container) {
    return;
  }

  let savedOrder = [];
  try {
    const raw = window.localStorage.getItem(ICON_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      savedOrder = parsed;
    }
  } catch {
    savedOrder = [];
  }

  if (savedOrder.length === 0) {
    return;
  }

  const links = getSortableLinks(container);
  const keyToNode = new Map();
  links.forEach((link) => keyToNode.set(getLinkKey(link), link));

  const ordered = [];
  savedOrder.forEach((key) => {
    const node = keyToNode.get(key);
    if (node) {
      ordered.push(node);
      keyToNode.delete(key);
    }
  });

  keyToNode.forEach((node) => ordered.push(node));
  ordered.forEach((node) => container.appendChild(node));
}

function saveQuickLinksOrder(container) {
  const order = getSortableLinks(container).map((link) => getLinkKey(link));
  try {
    window.localStorage.setItem(ICON_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Ignore storage failures (private mode/quota) to keep sorting usable.
  }
}

function enableQuickLinkSorting() {
  const container = getQuickLinksContainer();
  if (!container) {
    return;
  }

  const links = getSortableLinks(container);
  links.forEach((link) => {
    link.classList.add("is-sortable");
    link.setAttribute("draggable", "false");

    const img = link.querySelector("img");
    if (img) {
      img.setAttribute("draggable", "false");
    }
  });

  let activeLink = null;
  let placeholder = null;
  let pointerId = null;
  let dragStarted = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let fixedWidth = 0;
  let fixedHeight = 0;

  const DRAG_START_DISTANCE = 10;

  function resetDragState() {
    if (activeLink) {
      activeLink.classList.remove("is-dragging");
      activeLink.style.position = "";
      activeLink.style.left = "";
      activeLink.style.top = "";
      activeLink.style.width = "";
      activeLink.style.height = "";
      activeLink.style.zIndex = "";
      activeLink.style.pointerEvents = "";
      activeLink.style.margin = "";
      activeLink.style.transform = "";
    }

    if (placeholder) {
      placeholder.remove();
    }

    container.classList.remove("is-sorting");
    document.body.classList.remove("is-sorting");

    activeLink = null;
    placeholder = null;
    pointerId = null;
    dragStarted = false;
  }

  function positionDraggedLink(clientX, clientY) {
    if (!activeLink) {
      return;
    }

    activeLink.style.left = `${clientX - offsetX}px`;
    activeLink.style.top = `${clientY - offsetY}px`;
  }

  function beginDrag(clientX, clientY) {
    if (!activeLink) {
      return;
    }

    const rect = activeLink.getBoundingClientRect();
    fixedWidth = rect.width;
    fixedHeight = rect.height;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;

    placeholder = document.createElement("span");
    placeholder.className = "icon-link icon-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.width = `${fixedWidth}px`;
    placeholder.style.height = `${fixedHeight}px`;
    activeLink.insertAdjacentElement("afterend", placeholder);

    activeLink.classList.add("is-dragging");
    activeLink.style.position = "fixed";
    activeLink.style.width = `${fixedWidth}px`;
    activeLink.style.height = `${fixedHeight}px`;
    activeLink.style.zIndex = "999";
    activeLink.style.pointerEvents = "none";
    activeLink.style.margin = "0";

    container.classList.add("is-sorting");
    document.body.classList.add("is-sorting");

    positionDraggedLink(clientX, clientY);
    dragStarted = true;
  }

  function movePlaceholder(clientX, clientY) {
    if (!dragStarted || !placeholder || !activeLink) {
      return;
    }

    const hovered = document.elementFromPoint(clientX, clientY);
    if (!hovered) {
      return;
    }

    const target = hovered.closest(".quick-links .icon-link");
    if (!target || target === activeLink || target === placeholder) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const mostlyLowerHalf = clientY > targetCenterY;
    const nearCenterY = Math.abs(clientY - targetCenterY) < rect.height * 0.35;
    const rightHalfWhenSameRow = nearCenterY && clientX > targetCenterX;
    const insertAfter = mostlyLowerHalf || rightHalfWhenSameRow;

    if (insertAfter) {
      target.insertAdjacentElement("afterend", placeholder);
    } else {
      target.insertAdjacentElement("beforebegin", placeholder);
    }
  }

  container.addEventListener("pointerdown", (event) => {
    const link = event.target.closest(".quick-links .icon-link");
    if (!link) {
      return;
    }

    activeLink = link;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    suppressClick = false;

    activeLink.setPointerCapture(pointerId);
  });

  container.addEventListener("pointermove", (event) => {
    if (!activeLink || event.pointerId !== pointerId) {
      return;
    }

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const distance = Math.hypot(dx, dy);

    if (!dragStarted && distance >= DRAG_START_DISTANCE) {
      beginDrag(event.clientX, event.clientY);
      suppressClick = true;
    }

    if (!dragStarted) {
      return;
    }

    event.preventDefault();
    positionDraggedLink(event.clientX, event.clientY);
    movePlaceholder(event.clientX, event.clientY);
  });

  function endPointer(event) {
    if (!activeLink || event.pointerId !== pointerId) {
      return;
    }

    if (dragStarted && placeholder) {
      placeholder.insertAdjacentElement("beforebegin", activeLink);
      saveQuickLinksOrder(container);
      suppressClick = true;
    }

    try {
      activeLink.releasePointerCapture(pointerId);
    } catch {
      // Ignore when capture is already released.
    }

    resetDragState();
  }

  container.addEventListener("pointerup", endPointer);
  container.addEventListener("pointercancel", endPointer);

  container.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    },
    true
  );
}

window.addEventListener("DOMContentLoaded", () => {
  restoreQuickLinksOrder();
  enableQuickLinkSorting();
  initSearchFocus();
  initFavicons();
});
