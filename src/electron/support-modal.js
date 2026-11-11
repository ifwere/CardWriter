"use strict";

const Elm = window.Elm;

const language = "en";
const supportModal = Elm.Electron.SupportModal.init({ flags: { language } });

supportModal.ports.copyEmail.subscribe((isUrgent) => {
  window.electronAPI.copySupportEmail(isUrgent);
});

// The desktop app has no backend to POST the contact form to, so "Send Now"
// turns the same fields into a mailto: URL.
supportModal.ports.submitForm.subscribe((formData) => {
  const toEmail = formData && formData.toEmail ? String(formData.toEmail) : "";
  const fromEmail = formData && formData.fromEmail ? String(formData.fromEmail) : "";
  const subject = formData && formData.subject ? String(formData.subject) : "";
  const body = formData && formData.body ? String(formData.body) : "";

  const fullBody = `${body}\n\n--\nFrom: ${fromEmail}`;
  const url = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
  window.electronAPI.openExternal(url);
});
