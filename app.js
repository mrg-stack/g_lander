// Load favicons for each link from common favicon services.
function initFavicons() {
  const links = document.querySelectorAll(".quick-links .icon-link:not([data-no-favicon])");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    try {
      const url = new URL(href);
      const img = document.createElement("img");
      img.className = "icon-favicon";
      img.alt = "";
      img.decoding = "async";

      // Try Google's favicon service first, then fallbacks.
      const sources = [
        `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url.origin)}`,
        `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`,
      ];

      let attempt = 0;
      const tryNext = () => {
        if (attempt >= sources.length) return;
        img.src = sources[attempt];
        attempt++;
      };

      img.addEventListener("error", tryNext);
      link.replaceChildren(img);
      tryNext();
    } catch {
      // Ignore invalid URLs.
    }
  });
}

initFavicons();
