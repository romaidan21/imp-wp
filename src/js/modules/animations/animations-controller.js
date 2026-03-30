import { gsap, ScrollTrigger } from "gsap/all";
gsap.registerPlugin(ScrollTrigger);
// gsap.config({ nullTargetWarn: false });

import preLoader from "./animations-preloader";

const toggleClass = (element, className, bool) =>
  element?.classList.toggle(className, bool);

// DOM elements shared across functions
const html = document.querySelector("html");
const body = html.querySelector("body");
const header = body.querySelector("header");
const footer = body.querySelector("footer");
const main = body.querySelector("main");
const sections = [...main.querySelectorAll("section")];
const headerHeight = header.offsetHeight;

// Elements, animated on scroll
const darkSections = sections.filter(
  (section) => section.dataset.theme === "dark",
);
// const coverSections = sections.filter(section => section.hasAttribute("data-cover-section"));
// const revealCollapsed = [...body.querySelectorAll('[data-reveal-collapse]')];
const textRevealed = [...body.querySelectorAll("[data-reveal-text]")];
const fades = [...body.querySelectorAll("[data-fade]")];
const staggers = [...body.querySelectorAll("[data-stagger]")];

export default function animationsController() {
  preLoader(html, () => {
    initializeAnimations();
    createCornerButtons();
  });

  // Combined function for all animations and ScrollTriggers
  function initializeAnimations() {
    // Add here load dependend functions

    // OnScroll Animations
    onScrollAnimations();
  }

  function onScrollAnimations() {
    const animateTextReveal = (text) => {
      const split = Splitting({ target: text, by: "chars" });
      const chars = text.querySelectorAll(".char");

      const tl = gsap.timeline({
        scrollTrigger: {
          // markers: true,
          trigger: text,
          start: "top 90%",
          toggleActions: "play none none reverse",
        },
      });

      tl.set(text, { autoAlpha: 1 }).to(
        [chars],
        { duration: 1, y: 0, autoAlpha: 1, immediateRender: true },
        "reveal",
      );
    };

    const animateFades = (el) => {
      let type = el.dataset.fade;

      let tl = gsap.timeline({
        defaults: {
          ease: "circ.out",
        },
        scrollTrigger: {
          // markers: true,
          trigger: el,
          // start: "top 90%",
          toggleActions: "play none none reverse",
        },
      });

      switch (type) {
        case "in":
          tl.to(el, { duration: 1.5, autoAlpha: 1, ease: "none" });
          break;
        case "up":
          tl.to(el, { duration: 1, y: 0, autoAlpha: 1 });
          break;
        default:
          break;
      }
    };

    const animateStaggers = (el) => {
      let items = [...el.querySelectorAll("[data-item]")];
      if (!items.length) return;

      let type = el.dataset.stagger;
      let tl = gsap.timeline({
        scrollTrigger: {
          // markers: true,
          trigger: el,
          toggleActions: "play none none reverse",
        },
      });

      switch (type) {
        case "fadein":
          tl.from([items], { autoAlpha: 0, ease: "none", stagger: 0.15 });
          break;
        case "fadeup":
          tl.to([items], {
            y: 0,
            autoAlpha: 1,
            // ease: "none",
            duration: 1,
            stagger: 0.15,
          });
          break;
        default:
          tl.from([items], { autoAlpha: 0, ease: "none", stagger: 0.15 });
          break;
      }
    };

    const animateCoverScroll = (section) => {
      gsap
        .timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
            end: "top top",
            scrub: true,
          },
        })
        .to(section, { duration: 2, clipPath: "inset(0%)" });
    };

    const animateRevealCollapse = (section) => {
      const clipMask = section.querySelector(".clip-mask");
      const clipBg = section.querySelector(".clip-bg");
      const scrollTriggerObject = { trigger: section, scrub: true };
      const prevSection = section.previousElementSibling;

      // Reveal-collapse section clip mask
      gsap
        .timeline({
          scrollTrigger: {
            ...scrollTriggerObject,
            start: "top bottom",
            end: "top top",
          },
        })
        .from(clipMask, { clipPath: "inset(50%)" });

      clipBg &&
        gsap
          .timeline({
            scrollTrigger: { ...scrollTriggerObject, end: "bottom+=100% top" },
          })
          .to(clipBg, { y: "-50%" });

      gsap
        .timeline({
          scrollTrigger: { ...scrollTriggerObject, start: "bottom 80%" },
        })
        .to(clipMask, { clipPath: "inset(50%)" });

      // Toggle previous section background
      if (prevSection) {
        let prevBgColor = window
          .getComputedStyle(prevSection)
          .getPropertyValue("background-color");
        let currentBgColor = window
          .getComputedStyle(section)
          .getPropertyValue("background-color");

        if (
          prevBgColor === currentBgColor ||
          currentBgColor === "none" ||
          prevBgColor === "none"
        )
          return;

        gsap
          .timeline({
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "top top",
              scrub: true,
            },
          })
          .to(prevSection, {
            backgroundColor: currentBgColor,
            overwrite: "auto",
          });
      }
    };
    const invertHeader = (section) => {
      ScrollTrigger.create({
        trigger: section,
        start: `top ${headerHeight / 2}px`,
        end: `bottom ${headerHeight / 2}px`,
        onToggle: (e) => {
          if (e.isActive) {
            header.setAttribute("data-theme", "dark");
          } else {
            header.removeAttribute("data-theme");
          }
        },
      });
    };

    const bluredHeader = () => {
      ScrollTrigger.create({
        trigger: main,
        start: `top ${-headerHeight}px`,
        end: `bottom ${-headerHeight}px`,
        onToggle: (e) => {
          toggleClass(header, "blurred", e.isActive);
        },
      });
    };

    fades.length && fades.forEach(animateFades);
    staggers.length && staggers.forEach(animateStaggers);
    textRevealed.length && textRevealed.forEach(animateTextReveal);
    darkSections.length &&
      [...darkSections, footer].forEach((s) => invertHeader(s));
    bluredHeader();
    // classToggles.length && classToggles.forEach(el => animateClassToggle);
    // coverSections.length && coverSections.forEach(animateCoverScroll);
    // revealCollapsed.length && revealCollapsed.forEach(animateRevealCollapse);
  }
}

function createCornerButtons() {
  if (!document.body || document.querySelector("[data-button-panel]")) return;

  const panel = document.createElement("div");
  panel.dataset.buttonPanel = "";
  panel.className = "corner-button-panel";

  const style = document.createElement("style");
  style.dataset.buttonPanelStyle = "";
  style.textContent = `
    .corner-button-panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      gap: 8px;
      z-index: 9999;
    }

    .corner-button-panel__btn {
      height: 38px;
      padding-inline: 8px;
      border: 0;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.9);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s ease, opacity 0.2s ease;
      opacity: 0.85;
    }

    .corner-button-panel__btn:hover {
      transform: translateY(-2px);
      opacity: 1;
    }

    .corner-button-panel__btn.is-active {
      background: #2563eb;
      opacity: 1;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.5);
      pointer-events: none;
    }
  `;

  const buttons = [];

  const onClick = (value, clicked) => {
    document.body.dataset.button = String(value);
    buttons.forEach((btn) => btn.classList.remove("is-active"));
    clicked.classList.add("is-active");
  };

  [1, 2, 3].forEach((number) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "corner-button-panel__btn";
    button.textContent = "Колір -" + String(number);
    button.addEventListener("click", () => onClick(number, button));
    buttons.push(button);
    panel.append(button);
    number === 1 && button.click();
  });

  document.head.append(style);
  document.body.append(panel);
}
