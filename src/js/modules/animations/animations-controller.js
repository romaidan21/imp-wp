import { gsap, ScrollTrigger } from "gsap/all";
gsap.registerPlugin(ScrollTrigger);
// gsap.config({ nullTargetWarn: false });

import preLoader from "./animations-preloader";

const toggleClass = (element, className, bool) => element?.classList.toggle(className, bool);


// DOM elements shared across functions
const html = document.querySelector('html');
const body = html.querySelector('body');
const header = body.querySelector('header');
const footer = body.querySelector('footer');
const main = body.querySelector('main');
const sections = [...main.querySelectorAll("section")];
const lastSection = (sections.length > 1) ? sections[sections.length - 1] : (sections[0] ?? main);
const headerHeight = header.offsetHeight;

// Elements, animated on scroll
const darkSections = sections.filter(section => section.dataset.theme === "dark");
const lightSections = sections.filter(section => section.dataset.theme === "light");
// const parallaxSections = sections.filter(section => section.hasAttribute("data-parallax-section"));
// const coverSections = sections.filter(section => section.hasAttribute("data-cover-section"));
// const revealCollapsed = [...body.querySelectorAll('[data-reveal-collapse]')];
const textRevealed = [...body.querySelectorAll('[data-reveal-text]')];
const fades = [...body.querySelectorAll('[data-fade]')];
const staggers = [...body.querySelectorAll('[data-stagger]')];
const pinned = [...body.querySelectorAll('[data-pin]')];
const classToggles = [...body.querySelectorAll('[data-class-toggle]')];

export default function animationsController() {

  preLoader(html, () => {
    initializeAnimations();
  });

  // Combined function for all animations and ScrollTriggers
  function initializeAnimations() {

    // Add here load dependend functions

    // OnScroll Animations
    onScrollAnimations();
  }

  function onScrollAnimations() {

    const createScrollTrigger = (triggerElement, start, end, toggleClassTarget, toggleClassStr, markers = false) => {
      ScrollTrigger.create({
        markers: markers,
        trigger: triggerElement,
        start: start,
        end: end,
        onToggle: (e) => toggleClass(toggleClassTarget, toggleClassStr, e.isActive),
      });
    };

    const animateTextReveal = (text) => {
      const split = Splitting({ target: text, by: 'chars' });
      const chars = text.querySelectorAll('.char');

      const tl = gsap.timeline({
        scrollTrigger: {
          // markers: true,
          trigger: text,
          start: "top 90%",
          toggleActions: "play none none reverse",
        }
      });

      tl
        .set(text, { autoAlpha: 1 })
        .to([chars], { duration: 1, y: 0, autoAlpha: 1, immediateRender: true }, "reveal")
    }

    const animateFades = (el) => {

      let type = el.dataset.fade;

      let tl = gsap.timeline({
        defaults: {
          ease: "circ.out"
        },
        scrollTrigger: {
          // markers: true,
          trigger: el,
          // start: "top 90%",
          toggleActions: "play none none reverse",
        }
      });

      switch (type) {
        case 'in':
          tl.to(el, { duration: 2, autoAlpha: 1, ease: "none" });
          break;
        case 'up':
          tl.to(el, { duration: 1.5, y: 0, autoAlpha: 1 });
          break;
        default:
          break;
      }
    }

    const animateStaggers = (el) => {

      let items = [...el.querySelectorAll('[data-item]')];
      if (!items.length) return;

      let type = el.dataset.stagger;
      let tl = gsap.timeline({
        scrollTrigger: {
          // markers: true,
          trigger: el,
          toggleActions: "play none none reverse",
        }
      });

      switch (type) {
        case 'fadein':
          tl.from([items], { autoAlpha: 0, ease: "none", stagger: 0.15 });
          break;
        case 'fadeup':
          tl.from([items], { autoAlpha: 0, yPercent: 50, ease: "none", stagger: 0.15 });
          break;
        default:
          tl.from([items], { autoAlpha: 0, ease: "none", stagger: 0.15 });
          break;
      }
    }

    const animateParallax = (section) => {
      const items = section.querySelectorAll('[data-parallax-item]');
      const animate = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          pin: true,
          pinSpacing: false,
          scrub: true
        }
      }).to(section, { y: () => `-=${section.clientHeight / 2}px` }, "parallax");

      items.length && items.forEach(item => {
        const offset = item.dataset.parallaxItem;
        animate.to(item, { y: () => `-=${window.innerHeight * offset}` }, "parallax");
      });
    }

    const animateCoverScroll = (section) => {
      gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top 80%",
          end: "top top",
          scrub: true
        }
      }).to(section, { duration: 2, clipPath: "inset(0%)" });
    }

    const animateRevealCollapse = (section) => {
      const clipMask = section.querySelector('.clip-mask');
      const clipBg = section.querySelector('.clip-bg');
      const scrollTriggerObject = { trigger: section, scrub: true };
      const prevSection = section.previousElementSibling;

      // Reveal-collapse section clip mask
      gsap.timeline({ scrollTrigger: { ...scrollTriggerObject, start: "top bottom", end: "top top" } })
        .from(clipMask, { clipPath: "inset(50%)" })

      clipBg && gsap.timeline({ scrollTrigger: { ...scrollTriggerObject, end: "bottom+=100% top" } })
        .to(clipBg, { y: '-50%' })

      gsap.timeline({ scrollTrigger: { ...scrollTriggerObject, start: 'bottom 80%', } })
        .to(clipMask, { clipPath: "inset(50%)" });

      // Toggle previous section background
      if (prevSection) {
        let prevBgColor = window.getComputedStyle(prevSection).getPropertyValue('background-color');
        let currentBgColor = window.getComputedStyle(section).getPropertyValue('background-color');

        if ((prevBgColor === currentBgColor) || (currentBgColor === 'none') || (prevBgColor === 'none')) return;

        gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'top top',
            scrub: true
          }
        }).to(prevSection, {
          backgroundColor: currentBgColor,
          overwrite: 'auto'
        });
      }
    }
    const invertHeader = (section) => {
      createScrollTrigger(section, `top ${headerHeight}px`, `bottom ${headerHeight}px`, header, 'inverted');
    }

    const pinElements = (el) => {

      let scrollController = null;

      gsap.matchMedia().add("(min-width: 768px)", () => {
        const trigger = el.closest('[data-pin-trigger]');
        if (!trigger) return;

        scrollController = ScrollTrigger.create({
          // markers: true,
          trigger: trigger,
          pin: el,
          end: () => `bottom bottom`,
        });

        return () => {
          scrollController.kill();
        }
      })
    }

    fades.length && fades.forEach(animateFades);
    staggers.length && staggers.forEach(animateStaggers);
    textRevealed.length && textRevealed.forEach(animateTextReveal);
    darkSections.length && darkSections.forEach(s => invertHeader(s));
    pinned.length && pinned.forEach(el => pinElements(el));
    // classToggles.length && classToggles.forEach(el => animateClassToggle);
    // parallaxSections.length && parallaxSections.forEach(animateParallax);
    // coverSections.length && coverSections.forEach(animateCoverScroll);
    // revealCollapsed.length && revealCollapsed.forEach(animateRevealCollapse);
  }

}

