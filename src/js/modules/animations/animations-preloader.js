import { gsap } from "gsap/all";

export default function preLoader(docElement, cb = () => {}) {
  const preloader = document.querySelector(".preloader");
  const logo = preloader?.querySelector("svg");
  const homeLogo = document.querySelector("[data-home-logo]");

  function checkIsLoaded() {
    docElement.classList.add("loaded");
    setTimeout(cb, 10);
  }

  window.addEventListener("load", () => {
    if (!preloader) {
      checkIsLoaded();
      return;
    }
    const tl = gsap.timeline();

    tl.to(logo, { opacity: 1, duration: 0.3 });
    tl.pause();

    const hidePreloader = () => {
      const delay = homeLogo ? 0.5 : 0.3;
      gsap.to(preloader, {
        autoAlpha: 0,
        duration: delay + 0.2,
        delay: delay,
      });
      gsap.to([], {
        duration: delay,
        delay: delay,
        onComplete: checkIsLoaded,
      });
    };

    if (homeLogo) {
      const homeLogoRect = homeLogo.getBoundingClientRect();
      gsap.set(logo, { top: homeLogoRect.top });
    }

    tl.play().then(hidePreloader);
  });
}
