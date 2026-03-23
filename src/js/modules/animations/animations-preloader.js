import { gsap } from "gsap/all";

export default function preLoader(docElement, cb = () => {}) {
  const preloader = document.querySelector(".preloader");
  const logo = preloader.querySelector("svg");
  const homeLogo = document.querySelector("[data-home-logo]");

  function checkIsLoaded() {
    docElement.classList.add("loaded");
    setTimeout(cb, 10);
  }

  window.addEventListener("load", () => {
    const tl = gsap.timeline();

    tl.to(logo, {
      opacity: 1,
      duration: 0.5,
    });
    tl.pause();

    const hidePreloader = () => {
      gsap.to(preloader, {
        autoAlpha: 0,
        duration: 0.8,
        delay: 0.5,
      });
      gsap.to([], {
        duration: 0.5,
        delay: 0.5,
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
