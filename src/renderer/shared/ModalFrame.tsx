// Markup shared by the standalone help windows.
//
// Mirrors `SharedUI.modalWrapper` from the Elm sources: an overlay sibling
// followed by `.modal` > `.modal-header` and `.modal-guts`. The standalone
// windows hide the header with CSS, but keeping it here means the same markup
// is used if these views are ever embedded in the document window again.

import type { ReactNode } from "react";

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="64 64 896 896" fill="currentColor" aria-hidden="true">
      <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" />
      <path d="M685.4 354.8c0-4.4-3.6-8-8-8l-66 .3L512 465.6l-99.3-118.4-66.1-.3c-4.4 0-8 3.5-8 8 0 1.9.7 3.7 1.9 5.2l130.1 155L340.5 670a8.32 8.32 0 0 0-1.9 5.2c0 4.4 3.6 8 8 8l66.1-.3L512 564.4l99.3 118.4 66 .3c4.4 0 8-3.5 8-8 0-1.9-.7-3.7-1.9-5.2L553.5 515l130.1-155c1.2-1.6 1.8-3.4 1.8-5.2z" />
    </svg>
  );
}

export interface ModalFrameProps {
  title: string;
  /** Extra classes appended to `.modal`, e.g. `video-viewer` or `red-alert`. */
  modalClassName?: string;
  /** Id applied to `.modal-guts`, matching the Elm `modalWrapper` id argument. */
  gutId?: string;
  onClose?: () => void;
  children: ReactNode;
}

export function ModalFrame({
  title,
  modalClassName,
  gutId,
  onClose,
  children
}: ModalFrameProps) {
  const close = () => onClose?.();

  return (
    <>
      <div className="modal-overlay" onClick={close} />
      <div className={modalClassName ? `modal ${modalClassName}` : "modal"}>
        <div className="modal-header">
          <h2>{title}</h2>
          <div className="close-button" onClick={close}>
            <CloseIcon />
          </div>
        </div>
        <div className="modal-guts" id={gutId}>
          {children}
        </div>
      </div>
    </>
  );
}
