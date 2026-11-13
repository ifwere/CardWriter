// Fullscreen editing (`Doc.Fullscreen.view`).
//
// Shows only the active card's column, with one textarea per card. Focus moves
// between cards as they are clicked, and the save/exit buttons sit on the right
// edge.

import { useEffect, useLayoutEffect, useRef } from "react";

import type { Tree } from "../model/tree.ts";
import { getColumnById } from "../model/treeView.ts";
import { useDocument } from "../state/documentStore.ts";
import { FullscreenExitOutlined } from "./icons.tsx";
import { t } from "../../shared/i18n.ts";

function FullscreenCard({
  card,
  isActive,
  language
}: {
  card: Tree;
  isActive: boolean;
  language: string;
}) {
  const field = useDocument((state) => state.field);
  const active = useDocument((state) => state.active);
  const updateField = useDocument((state) => state.updateField);
  const openCardFullscreen = useDocument((state) => state.openCardFullscreen);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // The active card shows the in-flight text; others show their stored content.
  const value = card.id === active ? field : card.content;

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!isActive) return;
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [isActive]);

  return (
    <div
      id={`card-${card.id}`}
      dir="auto"
      className={`card-fullscreen${isActive ? " active-fullscreen" : ""}`}
      data-cloned-content={value}
    >
      <textarea
        ref={ref}
        id={`card-edit-${card.id}`}
        dir="auto"
        className="edit mousetrap"
        data-private="lipsum"
        value={value}
        onFocus={() => {
          if (card.id !== active) openCardFullscreen(card.id);
        }}
        onChange={(event) => updateField(event.target.value)}
      />
      {isActive ? <span hidden>{t(language, "Elm:SaveChangesTitle")}</span> : null}
    </div>
  );
}

export function FullscreenEditor() {
  const tree = useDocument((state) => state.tree);
  const active = useDocument((state) => state.active);
  const language = useDocument((state) => state.language);
  const isMac = useDocument((state) => state.isMac);
  const dirty = useDocument((state) => state.dirty);
  const saveAndCloseCard = useDocument((state) => state.saveAndCloseCard);
  const exitFullscreen = useDocument((state) => state.exitFullscreen);

  const column = getColumnById(active, tree) ?? [];
  const saveAndExitTip = isMac
    ? "⌘+Enter to Save and Exit Fullscreen"
    : "Ctrl+Enter to Save and Exit Fullscreen";

  return (
    <>
      <div id="app-fullscreen">
        <div id="fullscreen-main">
          {column.map((group, index) => (
            <div className="group-fullscreen" key={group[0]?.id ?? `empty-${index}`}>
              {group.map((card) => (
                <FullscreenCard
                  key={card.id}
                  card={card}
                  isActive={card.id === active}
                  language={language}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div id="fullscreen-buttons" className={dirty ? "dirty" : ""}>
        <div id="fullscreen-exit" onClick={exitFullscreen} title="Exit Fullscreen Mode">
          <FullscreenExitOutlined width={24} />
        </div>
        <div id="fullscreen-save-and-exit-button" onClick={saveAndCloseCard} title={saveAndExitTip} />
      </div>
    </>
  );
}
