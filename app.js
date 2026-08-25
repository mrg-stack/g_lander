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
const ICON_LAYOUT_STORAGE_KEY = "glander.quickLinksLayout.v1";

function getQuickLinksContainer() {
  return document.querySelector(".quick-links");
}

function getLinkKey(link) {
  return link.getAttribute("href") || link.getAttribute("aria-label") || link.title || "";
}

function getItemId(item) {
  if (item.type === "link") {
    return `link:${item.key}`;
  }
  return `group:${item.id}`;
}

function findItemById(layoutState, itemId) {
  return layoutState.items.find((item) => getItemId(item) === itemId) || null;
}

function collectLinkNodes(container) {
  const map = new Map();
  const links = Array.from(container.querySelectorAll(":scope > a.icon-link"));
  links.forEach((link) => {
    const key = getLinkKey(link);
    if (!key) {
      return;
    }
    map.set(key, link);
  });
  return map;
}

function normalizeSavedItems(savedItems, availableKeys) {
  if (!Array.isArray(savedItems)) {
    return [];
  }

  const consumed = new Set();
  const items = [];

  savedItems.forEach((raw) => {
    if (!raw || typeof raw !== "object") {
      return;
    }

    if (raw.type === "link" && typeof raw.key === "string") {
      if (!availableKeys.has(raw.key) || consumed.has(raw.key)) {
        return;
      }
      consumed.add(raw.key);
      items.push({ type: "link", key: raw.key });
      return;
    }

    if (raw.type === "group" && typeof raw.id === "string" && Array.isArray(raw.items)) {
      const filteredKeys = raw.items.filter((key) => {
        if (typeof key !== "string") {
          return false;
        }
        if (!availableKeys.has(key) || consumed.has(key)) {
          return false;
        }
        consumed.add(key);
        return true;
      });

      if (filteredKeys.length >= 2) {
        items.push({
          type: "group",
          id: raw.id,
          name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Folder",
          items: filteredKeys,
        });
      } else if (filteredKeys.length === 1) {
        items.push({ type: "link", key: filteredKeys[0] });
      }
    }
  });

  availableKeys.forEach((key) => {
    if (!consumed.has(key)) {
      items.push({ type: "link", key });
    }
  });

  return items;
}

function buildInitialLayout(container) {
  const linkMap = collectLinkNodes(container);
  const availableKeys = new Set(linkMap.keys());

  let items = [];
  let nextGroupNumber = 1;

  try {
    const raw = window.localStorage.getItem(ICON_LAYOUT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.items)) {
      items = normalizeSavedItems(parsed.items, availableKeys);
      if (Number.isInteger(parsed.nextGroupNumber) && parsed.nextGroupNumber > 0) {
        nextGroupNumber = parsed.nextGroupNumber;
      }
    }
  } catch {
    items = [];
  }

  if (items.length === 0) {
    let legacyOrder = [];
    try {
      const rawLegacy = window.localStorage.getItem(ICON_ORDER_STORAGE_KEY);
      const parsedLegacy = rawLegacy ? JSON.parse(rawLegacy) : [];
      if (Array.isArray(parsedLegacy)) {
        legacyOrder = parsedLegacy.map((key) => ({ type: "link", key }));
      }
    } catch {
      legacyOrder = [];
    }

    items = normalizeSavedItems(legacyOrder, availableKeys);
  }

  return {
    items,
    linkMap,
    nextGroupNumber,
    activeGroupId: null,
  };
}

function saveLayoutState(layoutState) {
  try {
    window.localStorage.setItem(
      ICON_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        items: layoutState.items,
        nextGroupNumber: layoutState.nextGroupNumber,
      })
    );
  } catch {
    // Ignore storage failures (private mode/quota) to keep sorting usable.
  }
}

function createGroupTile(group, layoutState) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-link icon-group is-sortable";
  button.setAttribute("draggable", "false");
  button.dataset.itemType = "group";
  button.dataset.itemId = getItemId(group);
  button.dataset.groupId = group.id;
  button.setAttribute("aria-label", `Open group ${group.name}`);
  button.title = group.name;

  const preview = document.createElement("span");
  preview.className = "icon-group-preview";

  group.items.slice(0, 4).forEach((linkKey) => {
    const sourceLink = layoutState.linkMap.get(linkKey);
    const cell = document.createElement("span");
    cell.className = "icon-group-preview-cell";
    if (sourceLink) {
      const sourceImg = sourceLink.querySelector("img");
      if (sourceImg) {
        const clone = sourceImg.cloneNode(true);
        clone.removeAttribute("style");
        clone.className = "icon-group-preview-image";
        clone.setAttribute("draggable", "false");
        cell.appendChild(clone);
      }
    }
    preview.appendChild(cell);
  });

  const name = document.createElement("span");
  name.className = "icon-group-name";
  name.textContent = group.name;

  button.appendChild(preview);
  button.appendChild(name);
  return button;
}

function renderQuickLinksLayout(container, layoutState) {
  container.replaceChildren();

  layoutState.items.forEach((item) => {
    if (item.type === "link") {
      const link = layoutState.linkMap.get(item.key);
      if (!link) {
        return;
      }

      link.classList.add("is-sortable");
      link.dataset.itemType = "link";
      link.dataset.itemId = getItemId(item);
      link.setAttribute("draggable", "false");

      const img = link.querySelector("img");
      if (img) {
        img.setAttribute("draggable", "false");
      }

      container.appendChild(link);
      return;
    }

    const groupTile = createGroupTile(item, layoutState);
    container.appendChild(groupTile);
  });
}

function reorderItemsFromDom(container, layoutState) {
  const ids = Array.from(container.children)
    .map((node) => node.dataset.itemId)
    .filter(Boolean);

  const byId = new Map(layoutState.items.map((item) => [getItemId(item), item]));
  layoutState.items = ids.map((id) => byId.get(id)).filter(Boolean);
}

function createGroupFromLinks(layoutState, targetLinkItem, movingLinkItem) {
  const targetIndex = layoutState.items.indexOf(targetLinkItem);
  const movingIndex = layoutState.items.indexOf(movingLinkItem);
  if (targetIndex < 0 || movingIndex < 0) {
    return null;
  }

  const groupId = `g${layoutState.nextGroupNumber}`;
  layoutState.nextGroupNumber += 1;

  const group = {
    type: "group",
    id: groupId,
    name: "New Folder",
    items: [targetLinkItem.key, movingLinkItem.key],
  };

  const firstIndex = Math.min(targetIndex, movingIndex);
  const secondIndex = Math.max(targetIndex, movingIndex);

  layoutState.items.splice(secondIndex, 1);
  layoutState.items.splice(firstIndex, 1, group);

  return groupId;
}

function moveLinkIntoGroup(layoutState, linkItem, targetGroup) {
  const linkIndex = layoutState.items.indexOf(linkItem);
  if (linkIndex < 0) {
    return false;
  }

  if (targetGroup.items.includes(linkItem.key)) {
    return false;
  }

  layoutState.items.splice(linkIndex, 1);
  targetGroup.items.push(linkItem.key);
  return true;
}

function initGroupModal(layoutState) {
  const overlay = document.createElement("div");
  overlay.className = "group-modal-overlay";
  overlay.hidden = true;

  const panel = document.createElement("section");
  panel.className = "group-modal";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = document.createElement("header");
  header.className = "group-modal-header";

  const nameDisplay = document.createElement("button");
  nameDisplay.type = "button";
  nameDisplay.className = "group-name-display";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "group-name-input";
  nameInput.placeholder = "Group name";
  nameInput.maxLength = 32;
  nameInput.hidden = true;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "group-close-btn";
  closeBtn.textContent = "Done";

  header.appendChild(nameDisplay);
  header.appendChild(nameInput);
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "group-modal-content";

  const help = document.createElement("p");
  help.className = "group-modal-help";
  help.textContent = "Tip: drag an icon outside this panel to move it back to the launcher.";

  panel.appendChild(header);
  panel.appendChild(content);
  panel.appendChild(help);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let isEditingName = false;
  let modalDragNode = null;
  let modalPlaceholder = null;
  let modalPointerId = null;
  let modalDragStarted = false;
  let modalSuppressClick = false;
  let modalStartX = 0;
  let modalStartY = 0;
  let modalOffsetX = 0;
  let modalOffsetY = 0;
  let modalDragWidth = 0;
  let modalDragHeight = 0;

  const MODAL_DRAG_DISTANCE = 10;

  function getActiveGroup() {
    if (!layoutState.activeGroupId) {
      return null;
    }
    return layoutState.items.find((item) => item.type === "group" && item.id === layoutState.activeGroupId) || null;
  }

  function commitLayoutAndRender() {
    saveLayoutState(layoutState);
    const launcher = getQuickLinksContainer();
    if (launcher) {
      renderQuickLinksLayout(launcher, layoutState);
    }
  }

  function captureLauncherDropAnchor(clientX, clientY) {
    const launcher = getQuickLinksContainer();
    if (!launcher) {
      return null;
    }

    const hovered = document.elementFromPoint(clientX, clientY);
    if (!hovered) {
      return null;
    }

    const targetNode = hovered.closest(".quick-links > .icon-link");
    if (!targetNode || !launcher.contains(targetNode)) {
      return null;
    }

    const targetId = targetNode.dataset.itemId;
    if (!targetId) {
      return null;
    }

    const rect = targetNode.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mostlyLowerHalf = clientY > centerY;
    const nearCenterY = Math.abs(clientY - centerY) < rect.height * 0.35;
    const rightHalfWhenSameRow = nearCenterY && clientX > centerX;
    const insertAfter = mostlyLowerHalf || rightHalfWhenSameRow;

    return { targetId, insertAfter };
  }

  function resolveInsertIndexFromAnchor(anchor) {
    if (!anchor) {
      return layoutState.items.length;
    }

    const targetItem = findItemById(layoutState, anchor.targetId);
    if (!targetItem) {
      return layoutState.items.length;
    }

    const index = layoutState.items.indexOf(targetItem);
    if (index < 0) {
      return layoutState.items.length;
    }

    return anchor.insertAfter ? index + 1 : index;
  }

  function insertTopLevelItemAtAnchor(item, anchor) {
    const requestedIndex = resolveInsertIndexFromAnchor(anchor);
    const clampedIndex = Math.max(0, Math.min(requestedIndex, layoutState.items.length));
    layoutState.items.splice(clampedIndex, 0, item);
  }

  function setNameEditMode(editing, options = {}) {
    isEditingName = editing;
    nameDisplay.hidden = editing;
    nameInput.hidden = !editing;

    if (editing) {
      const active = getActiveGroup();
      nameInput.value = active ? active.name : "";
      if (options.focus) {
        nameInput.focus();
        nameInput.select();
      }
      return;
    }

    if (options.commit) {
      const group = getActiveGroup();
      if (group) {
        const value = nameInput.value.trim();
        group.name = value || "Folder";
        commitLayoutAndRender();
      }
    }
  }

  function ejectLinkFromActiveGroup(linkKey, dropPoint) {
    const group = getActiveGroup();
    if (!group) {
      return;
    }

    const anchor = dropPoint ? captureLauncherDropAnchor(dropPoint.clientX, dropPoint.clientY) : null;

    const groupIndex = layoutState.items.findIndex((item) => item.type === "group" && item.id === group.id);
    if (groupIndex < 0) {
      return;
    }

    const linkIndex = group.items.indexOf(linkKey);
    if (linkIndex < 0) {
      return;
    }

    group.items.splice(linkIndex, 1);
    const ejectedItem = { type: "link", key: linkKey };

    if (group.items.length >= 2) {
      insertTopLevelItemAtAnchor(ejectedItem, anchor);
      commitLayoutAndRender();
      renderActiveGroup();
      return;
    }

    if (group.items.length === 1) {
      const remainingItem = { type: "link", key: group.items[0] };
      layoutState.items.splice(groupIndex, 1, remainingItem);
      insertTopLevelItemAtAnchor(ejectedItem, anchor);
      commitLayoutAndRender();
      closeModal();
      return;
    }

    layoutState.items.splice(groupIndex, 1);
    insertTopLevelItemAtAnchor(ejectedItem, anchor);
    commitLayoutAndRender();
    closeModal();
  }

  function resetModalDragState() {
    overlay.classList.remove("is-eject-target");

    if (modalDragNode) {
      modalDragNode.classList.remove("is-dragging");
      modalDragNode.style.position = "";
      modalDragNode.style.left = "";
      modalDragNode.style.top = "";
      modalDragNode.style.width = "";
      modalDragNode.style.height = "";
      modalDragNode.style.zIndex = "";
      modalDragNode.style.pointerEvents = "";
      modalDragNode.style.margin = "";
      modalDragNode.style.transform = "";
    }

    if (modalPlaceholder) {
      modalPlaceholder.remove();
    }

    modalDragNode = null;
    modalPlaceholder = null;
    modalPointerId = null;
    modalDragStarted = false;
  }

  function positionModalDrag(clientX, clientY) {
    if (!modalDragNode) {
      return;
    }

    modalDragNode.style.left = `${clientX - modalOffsetX}px`;
    modalDragNode.style.top = `${clientY - modalOffsetY}px`;
  }

  function beginModalDrag(clientX, clientY) {
    if (!modalDragNode) {
      return;
    }

    const rect = modalDragNode.getBoundingClientRect();
    modalDragWidth = rect.width;
    modalDragHeight = rect.height;
    modalOffsetX = clientX - rect.left;
    modalOffsetY = clientY - rect.top;

    modalPlaceholder = document.createElement("span");
    modalPlaceholder.className = "icon-link group-item-placeholder";
    modalPlaceholder.style.width = `${modalDragWidth}px`;
    modalPlaceholder.style.height = `${modalDragHeight}px`;
    modalDragNode.insertAdjacentElement("afterend", modalPlaceholder);

    modalDragNode.classList.add("is-dragging");
    modalDragNode.style.position = "fixed";
    modalDragNode.style.width = `${modalDragWidth}px`;
    modalDragNode.style.height = `${modalDragHeight}px`;
    modalDragNode.style.zIndex = "1700";
    modalDragNode.style.pointerEvents = "none";
    modalDragNode.style.margin = "0";

    positionModalDrag(clientX, clientY);
    modalDragStarted = true;
  }

  function renderActiveGroup() {
    const group = getActiveGroup();
    if (!group) {
      return;
    }

    nameDisplay.textContent = group.name;
    if (isEditingName) {
      nameInput.value = group.name;
    }

    content.replaceChildren();

    group.items.forEach((linkKey) => {
      const source = layoutState.linkMap.get(linkKey);
      if (!source) {
        return;
      }

      const clone = source.cloneNode(true);
      clone.classList.remove("is-sortable", "is-dragging", "is-group-target");
      clone.classList.add("group-item-link");
      clone.removeAttribute("data-item-id");
      clone.removeAttribute("data-item-type");
      clone.removeAttribute("style");
      clone.setAttribute("draggable", "false");
      clone.dataset.linkKey = linkKey;

      const img = clone.querySelector("img");
      if (img) {
        img.setAttribute("draggable", "false");
      }

      content.appendChild(clone);
    });
  }

  function closeModal() {
    resetModalDragState();
    overlay.hidden = true;
    layoutState.activeGroupId = null;
    setNameEditMode(false);
    nameDisplay.textContent = "";
    nameInput.value = "";
    content.replaceChildren();
  }

  function openModal(groupId) {
    const exists = layoutState.items.some((item) => item.type === "group" && item.id === groupId);
    if (!exists) {
      closeModal();
      return;
    }

    layoutState.activeGroupId = groupId;
    overlay.hidden = false;
    setNameEditMode(false);
    renderActiveGroup();
  }

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeModal();
    }
  });

  nameDisplay.addEventListener("click", () => {
    setNameEditMode(true, { focus: true });
  });

  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setNameEditMode(false, { commit: true });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setNameEditMode(false);
    }
  });

  nameInput.addEventListener("blur", () => {
    if (isEditingName) {
      setNameEditMode(false, { commit: true });
    }
  });

  content.addEventListener("pointerdown", (event) => {
    const tile = event.target.closest(".group-item-link");
    if (!tile) {
      return;
    }

    modalDragNode = tile;
    modalPointerId = event.pointerId;
    modalStartX = event.clientX;
    modalStartY = event.clientY;
    modalSuppressClick = false;

    modalDragNode.setPointerCapture(modalPointerId);
  });

  content.addEventListener("pointermove", (event) => {
    if (!modalDragNode || event.pointerId !== modalPointerId) {
      return;
    }

    const dx = event.clientX - modalStartX;
    const dy = event.clientY - modalStartY;
    const distance = Math.hypot(dx, dy);

    if (!modalDragStarted && distance >= MODAL_DRAG_DISTANCE) {
      beginModalDrag(event.clientX, event.clientY);
      modalSuppressClick = true;
    }

    if (!modalDragStarted) {
      return;
    }

    event.preventDefault();
    positionModalDrag(event.clientX, event.clientY);

    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    const outsidePanel = hovered ? !panel.contains(hovered) : true;
    overlay.classList.toggle("is-eject-target", outsidePanel);
  });

  function endModalPointer(event) {
    if (!modalDragNode || event.pointerId !== modalPointerId) {
      return;
    }

    if (modalDragStarted) {
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const outsidePanel = hovered ? !panel.contains(hovered) : true;

      if (outsidePanel) {
        const linkKey = modalDragNode.dataset.linkKey;
        if (linkKey) {
          ejectLinkFromActiveGroup(linkKey, { clientX: event.clientX, clientY: event.clientY });
        }
      } else if (modalPlaceholder) {
        modalPlaceholder.insertAdjacentElement("beforebegin", modalDragNode);
      }

      modalSuppressClick = true;
    }

    try {
      modalDragNode.releasePointerCapture(modalPointerId);
    } catch {
      // Ignore when capture is already released.
    }

    resetModalDragState();
  }

  content.addEventListener("pointerup", endModalPointer);
  content.addEventListener("pointercancel", endModalPointer);

  content.addEventListener(
    "click",
    (event) => {
      if (!modalSuppressClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      modalSuppressClick = false;
    },
    true
  );

  return { openModal, closeModal, renderActiveGroup };
}

function enableQuickLinkSorting() {
  const container = getQuickLinksContainer();
  if (!container) {
    return;
  }

  const layoutState = buildInitialLayout(container);
  const groupModal = initGroupModal(layoutState);
  renderQuickLinksLayout(container, layoutState);

  let activeNode = null;
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
  let groupTargetNode = null;

  const DRAG_START_DISTANCE = 10;

  function clearGroupTarget() {
    if (groupTargetNode) {
      groupTargetNode.classList.remove("is-group-target");
      groupTargetNode = null;
    }
  }

  function resetDragState() {
    clearGroupTarget();

    if (activeNode) {
      activeNode.classList.remove("is-dragging");
      activeNode.style.position = "";
      activeNode.style.left = "";
      activeNode.style.top = "";
      activeNode.style.width = "";
      activeNode.style.height = "";
      activeNode.style.zIndex = "";
      activeNode.style.pointerEvents = "";
      activeNode.style.margin = "";
      activeNode.style.transform = "";
    }

    if (placeholder) {
      placeholder.remove();
    }

    container.classList.remove("is-sorting");
    document.body.classList.remove("is-sorting");

    activeNode = null;
    placeholder = null;
    pointerId = null;
    dragStarted = false;
  }

  function positionDraggedNode(clientX, clientY) {
    if (!activeNode) {
      return;
    }

    activeNode.style.left = `${clientX - offsetX}px`;
    activeNode.style.top = `${clientY - offsetY}px`;
  }

  function beginDrag(clientX, clientY) {
    if (!activeNode) {
      return;
    }

    const rect = activeNode.getBoundingClientRect();
    fixedWidth = rect.width;
    fixedHeight = rect.height;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;

    placeholder = document.createElement("span");
    placeholder.className = "icon-link icon-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.width = `${fixedWidth}px`;
    placeholder.style.height = `${fixedHeight}px`;
    activeNode.insertAdjacentElement("afterend", placeholder);

    activeNode.classList.add("is-dragging");
    activeNode.style.position = "fixed";
    activeNode.style.width = `${fixedWidth}px`;
    activeNode.style.height = `${fixedHeight}px`;
    activeNode.style.zIndex = "999";
    activeNode.style.pointerEvents = "none";
    activeNode.style.margin = "0";

    container.classList.add("is-sorting");
    document.body.classList.add("is-sorting");

    positionDraggedNode(clientX, clientY);
    dragStarted = true;
  }

  function resolveGroupingTarget(clientX, clientY) {
    const hovered = document.elementFromPoint(clientX, clientY);
    if (!hovered || !activeNode) {
      return null;
    }

    const target = hovered.closest(".quick-links > .icon-link");
    if (!target || target === activeNode || target === placeholder) {
      return null;
    }

    const activeItem = findItemById(layoutState, activeNode.dataset.itemId || "");
    const targetItem = findItemById(layoutState, target.dataset.itemId || "");
    if (!activeItem || !targetItem || activeItem.type !== "link") {
      return null;
    }

    if (targetItem.type !== "link" && targetItem.type !== "group") {
      return null;
    }

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const normX = Math.abs(clientX - centerX) / (rect.width / 2);
    const normY = Math.abs(clientY - centerY) / (rect.height / 2);
    const insideGroupingZone = normX <= 0.55 && normY <= 0.55;

    return insideGroupingZone ? target : null;
  }

  function movePlaceholder(clientX, clientY) {
    if (!dragStarted || !placeholder || !activeNode) {
      return;
    }

    const groupingTarget = resolveGroupingTarget(clientX, clientY);
    clearGroupTarget();

    if (groupingTarget) {
      groupTargetNode = groupingTarget;
      groupTargetNode.classList.add("is-group-target");
      return;
    }

    const hovered = document.elementFromPoint(clientX, clientY);
    if (!hovered) {
      return;
    }

    const target = hovered.closest(".quick-links > .icon-link");
    if (!target || target === activeNode || target === placeholder) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mostlyLowerHalf = clientY > centerY;
    const nearCenterY = Math.abs(clientY - centerY) < rect.height * 0.35;
    const rightHalfWhenSameRow = nearCenterY && clientX > centerX;
    const insertAfter = mostlyLowerHalf || rightHalfWhenSameRow;

    if (insertAfter) {
      target.insertAdjacentElement("afterend", placeholder);
    } else {
      target.insertAdjacentElement("beforebegin", placeholder);
    }
  }

  function applyGrouping(targetNode) {
    const movingItem = findItemById(layoutState, activeNode?.dataset.itemId || "");
    const targetItem = findItemById(layoutState, targetNode.dataset.itemId || "");
    if (!movingItem || !targetItem || movingItem.type !== "link") {
      return;
    }

    let createdGroupId = null;

    if (targetItem.type === "link") {
      createdGroupId = createGroupFromLinks(layoutState, targetItem, movingItem);
    } else if (targetItem.type === "group") {
      moveLinkIntoGroup(layoutState, movingItem, targetItem);
      createdGroupId = targetItem.id;
    }

    if (!createdGroupId) {
      return;
    }

    saveLayoutState(layoutState);
    renderQuickLinksLayout(container, layoutState);
    groupModal.openModal(createdGroupId);
    suppressClick = true;
  }

  container.addEventListener("pointerdown", (event) => {
    const tile = event.target.closest(".quick-links > .icon-link");
    if (!tile) {
      return;
    }

    activeNode = tile;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    suppressClick = false;

    activeNode.setPointerCapture(pointerId);
  });

  container.addEventListener("pointermove", (event) => {
    if (!activeNode || event.pointerId !== pointerId) {
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
    positionDraggedNode(event.clientX, event.clientY);
    movePlaceholder(event.clientX, event.clientY);
  });

  function endPointer(event) {
    if (!activeNode || event.pointerId !== pointerId) {
      return;
    }

    const targetForGroup = groupTargetNode;
    if (dragStarted) {
      if (targetForGroup) {
        applyGrouping(targetForGroup);
      } else if (placeholder) {
        placeholder.insertAdjacentElement("beforebegin", activeNode);
        reorderItemsFromDom(container, layoutState);
        saveLayoutState(layoutState);
        suppressClick = true;
      }
    }

    try {
      activeNode.releasePointerCapture(pointerId);
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

  container.addEventListener("click", (event) => {
    const tile = event.target.closest(".quick-links > .icon-group");
    if (!tile) {
      return;
    }
    event.preventDefault();
    const groupId = tile.dataset.groupId;
    if (groupId) {
      groupModal.openModal(groupId);
    }
  });
}

function initServiceMenu() {
  const toggle = document.querySelector(".service-menu-toggle");
  const menu = document.getElementById("service-menu");
  if (!toggle || !menu) {
    return;
  }

  const closeMenu = () => {
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  enableQuickLinkSorting();
  initSearchFocus();
  initFavicons();
  initServiceMenu();
});
