// Detect if a link's href goes to the current page
export function isHash(link) {
  const current = window.location;
  return (link.href.split('#')[0] === current.href.split('#')[0]) && link.hash;
}

export function debounce(func, wait, immediate = false) {
  let timeout;
  return function (...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

export function throttle(func, wait) {
  let timeout = null;
  let previous = 0;
  return function (...args) {
    const now = Date.now();
    const remaining = wait - (now - previous);
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

export function lazyLoader() {
  const lazyElements = document.querySelectorAll("[data-lazy]");
  if (!lazyElements.length) return;

  initLazyLoad();

  function initLazyLoad() {
    const observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target;

            // Call the createCallback function with the target element
            createCallback(target);
            // Stop observing the element after it has loaded
            observer.unobserve(target);
          }
        });
      },
      {
        root: null,
        rootMargin: `${window.innerHeight}px`,
      }
    );

    lazyElements.forEach((element) => {
      observer.observe(element);
    });
  }

  function createCallback(el) {
    // Remove the 'data-lazy' attribute to indicate the element has loaded
    el.removeAttribute("data-lazy");

    // Change 'data-src' to 'src' for iframe and video elements
    if (el.tagName.toLowerCase() === "iframe") {
      el.src = el.dataset.src;
    } else if (el.tagName.toLowerCase() === "video") {
      // Handle <video> elements
      const sources = el.querySelectorAll("source[data-src]");
      sources.forEach((source) => (source.src = source.dataset.src));

      if (!el.isLoaded) {
        el.addEventListener(
          "canplaythrough",
          function () {
            el.isLoaded = true;
          },
          { once: true }
        );
        el.load();
      }
    }
  }
}

export function handleGoBack() {
  const backButtons = document.querySelectorAll("[data-go-back]");

  backButtons.length &&
    backButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      });
    });
};