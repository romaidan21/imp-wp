export default function Forms() {
  const forms = document.querySelectorAll("[data-form]");

  forms.forEach(formsCF7);
}

function formsCF7(form) {
  if (!form) return;
  form.addEventListener("wpcf7mailsent", handleFormEvent);
  form.addEventListener("wpcf7mailfailed", handleFormEvent);
  form.addEventListener("wpcf7invalid", handleFormEvent);

  function handleFormEvent(e) {
    const ress = e?.detail?.apiResponse || null;
    if (ress && e.type !== "wpcf7invalid") {
      e.preventDefault();
      const mgs = ress.message
        .split("|")
        .map((item) => `<p>${item}</p>`)
        .join("");
      handlePopUp.message({
        title: mgs || "<p>Ваше повідомлення успішно відправлено!</p>",
      });
    }
  }
}
