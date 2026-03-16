export default function preLoader(docElement, cb = () => { }) {

  function checkIsLoaded() {
    docElement.classList.add("loaded");
    cb();
  }

  window.addEventListener("load", checkIsLoaded);

}