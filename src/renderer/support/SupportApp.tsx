// Contact support window.
//
// Port of `Doc.ContactForm` + `Electron.SupportModal`. The desktop app has no
// backend to POST to, so both the form button and the mailto link open the
// user's mail client through `shell.openExternal`.

import { useState } from "react";

import { t } from "../shared/i18n";
import { ModalFrame } from "../shared/ModalFrame";

type RequestType = "standard" | "urgent";

// These tokens are replaced with the real addresses by the post-bundle
// translation pass (`scripts/translations.mjs`), exactly like the Elm bundles.
const SUPPORT_EMAIL = "{%SUPPORT_EMAIL%}";
const SUPPORT_URGENT_EMAIL = "{%SUPPORT_URGENT_EMAIL%}";

function supportEmail(requestType: RequestType): string {
  return requestType === "urgent" ? SUPPORT_URGENT_EMAIL : SUPPORT_EMAIL;
}

function mailto(requestType: RequestType, subject: string, body: string): string {
  const query = (value: string) => encodeURIComponent(value);
  return `mailto:${supportEmail(requestType)}?subject=${query(subject)}&body=${query(body)}`;
}

export function SupportApp({ language }: { language: string }) {
  const [fromField, setFromField] = useState("");
  const [subjectField, setSubjectField] = useState("Could you help me with this?");
  const [bodyField, setBodyField] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("standard");

  const urgent = requestType === "urgent";
  const shownEmail = supportEmail(requestType);

  function submit() {
    // The standalone Elm window appended the sender address to the body
    // because the desktop build cannot POST the contact form.
    const body = `${bodyField}\n\n--\nFrom: ${fromField}`;
    window.electronAPI.openExternal(mailto(requestType, subjectField, body));
  }

  return (
    <ModalFrame
      title={t(language, "Elm:ContactSupport")}
      modalClassName={urgent ? "red-alert" : undefined}
    >
      <form
        id="contact-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          id="contact-from-email"
          type="email"
          value={fromField}
          placeholder="Your Email"
          onChange={(event) => setFromField(event.target.value)}
        />
        <input
          id="contact-subject"
          value={subjectField}
          onChange={(event) => setSubjectField(event.target.value)}
        />
        <textarea
          id="contact-body"
          rows={7}
          value={bodyField}
          onChange={(event) => setBodyField(event.target.value)}
        />
        <div>
          <input
            id="contact-urgency-standard"
            name="contact-urgency"
            type="radio"
            value="standard"
            checked={requestType === "standard"}
            onChange={() => setRequestType("standard")}
          />
          <label htmlFor="contact-urgency-standard">
            <span>{"Standard Request "}</span>
            <span id="std-req-info" className="extra-info">
              {" (Checked every Wednesday)"}
            </span>
          </label>
        </div>
        <div>
          <input
            id="contact-urgency-urgent"
            name="contact-urgency"
            type="radio"
            value="urgent"
            checked={urgent}
            onChange={() => setRequestType("urgent")}
          />
          <label htmlFor="contact-urgency-urgent">
            <span>{"Urgent Request "}</span>
            <span id="urg-req-info" className="extra-info">
              {" (Notification to Developer's Phone)"}
            </span>
          </label>
        </div>
        <br />
        <button id="contact-send" type="submit">
          Send Now
        </button>
      </form>
      <p>or</p>
      <p>
        {"send an email instead : "}
        <br />
        <a href={mailto(requestType, subjectField, bodyField)}>{shownEmail}</a>
        <small id="email-copy-btn" onClick={() => window.electronAPI.copySupportEmail(urgent)}>
          copy
        </small>
      </p>
    </ModalFrame>
  );
}
