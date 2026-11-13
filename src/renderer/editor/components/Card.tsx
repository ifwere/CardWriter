// One card in a column.
//
// Three mutually exclusive renderings, matching `viewCardActive`,
// `viewCardEditing` and `viewCardOther` in `Page.Doc`:
//
//   active     — selected, shows the insert/delete/edit buttons
//   editing    — selected and open, renders the autogrowing textarea
//   other      — anything else, click to activate, double-click to edit
//
// Class names, ids and DOM order are unchanged so `style.css` and the E2E
// selectors keep working.

import { memo, useEffect, useLayoutEffect, useRef, type MouseEvent } from "react";

import type { Tree } from "../model/tree.ts";
import { renderContent } from "../model/markdown.ts";
import { useDocument } from "../state/documentStore.ts";
import { FullscreenOutlined } from "./icons.tsx";
import { t } from "../../shared/i18n.ts";

/** Fillets: the small curves that link an active card to its column. */
export function Fillet({
  position
}: {
  position: "top-left" | "bottom-left" | "top-right" | "bottom-right";
}) {
  return (
    <svg
      className={`fillet ${position}`}
      preserveAspectRatio="none"
      viewBox="0 0 30 30"
      aria-hidden="true"
    >
      <g>
        <path d="M 30 0 A 30 30 0 0 1 0 30 L 30 30 L 30 0 z " />
      </g>
    </svg>
  );
}

interface CardViewProps {
  cardId: string;
  content: string;
  onActivate: () => void;
  onEdit: () => void;
}

/**
 * The rendered card body.
 *
 * `marked` produces an HTML string, so the DOM is built with
 * `dangerouslySetInnerHTML`. Card text is authored by the document owner and
 * the page CSP blocks remote scripts — the same trade-off the Elm view made by
 * passing `sanitize = False` to `Markdown.toHtmlWith`.
 *
 * Markdown checkboxes arrive as `<input data-checkbox="n">`; clicking one
 * toggles the card text instead of activating the card.
 */
function CardView({ cardId, content, onActivate, onEdit }: CardViewProps) {
  const toggleCheckboxAt = useDocument((state) => state.toggleCheckboxAt);
  const html = renderContent(content, cardId);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) {
      const number = Number(target.dataset.checkbox);
      if (Number.isFinite(number)) toggleCheckboxAt(cardId, number);
      return;
    }
    onActivate();
  };

  return (
    <div className="view" onClick={handleClick} onDoubleClick={onEdit}>
      {/* The inner wrapper matches `Markdown.toHtmlWith`'s attribute so the
          `data-private` marker sits exactly where the Elm DOM had it. */}
      <div data-private="lipsum" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** Auto-grows the textarea to fit its content, like the hidden `::before` clone. */
function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return ref;
}

interface EditingCardProps {
  card: Tree;
  hasChildren: boolean;
  language: string;
}

function EditingCard({ card, hasChildren, language }: EditingCardProps) {
  const field = useDocument((state) => state.field);
  const updateField = useDocument((state) => state.updateField);
  const saveAndCloseCard = useDocument((state) => state.saveAndCloseCard);
  const enterFullscreen = useDocument((state) => state.enterFullscreen);
  const textareaRef = useAutoGrow(field);

  // Focus and place the caret at the end when the card opens, matching
  // `Browser.Dom.focus "card-edit-<id>"`.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [card.id, textareaRef]);

  return (
    <div
      id={`card-${card.id}`}
      dir="auto"
      className={`card active editing${hasChildren ? " has-children" : ""}`}
      data-cloned-content={field}
    >
      <textarea
        ref={textareaRef}
        id={`card-edit-${card.id}`}
        dir="auto"
        className="edit mousetrap"
        data-private="lipsum"
        value={field}
        onChange={(event) => updateField(event.target.value)}
      />
      <div className="flex-column card-right-overlay">
        <div className="fullscreen-card-btn" title="Edit in Fullscreen" onClick={enterFullscreen}>
          <FullscreenOutlined width={16} />
        </div>
        <div
          className="card-btn save"
          title={t(language, "Elm:SaveChangesTitle")}
          onClick={saveAndCloseCard}
        />
      </div>
    </div>
  );
}

/** Drop targets, rendered only while a card is being dragged. */
function DropRegions({ cardId, isLast }: { cardId: string; isLast: boolean }) {
  const dropTarget = useDocument((state) => state.dropTarget);
  const dropTree = useDocument((state) => state.dropTree);

  const region = (kind: "above" | "into" | "below") => {
    const id = `${kind}:${cardId}`;
    return (
      <div
        key={kind}
        className={`drop-region-${kind}${dropTarget === id ? " drop-hover" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (useDocument.getState().dropTarget !== id) {
            useDocument.setState({ dropTarget: id });
          }
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          if (useDocument.getState().dropTarget === id) {
            useDocument.setState({ dropTarget: null });
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dropTree(kind, cardId);
        }}
      />
    );
  };

  return (
    <>
      {region("above")}
      {region("into")}
      {isLast ? region("below") : null}
    </>
  );
}

interface CardProps {
  card: Tree;
  isActive: boolean;
  isEditing: boolean;
  isAncestor: boolean;
  isLast: boolean;
  isDragging: boolean;
  language: string;
}

function CardImpl({
  card,
  isActive,
  isEditing,
  isAncestor,
  isLast,
  isDragging,
  language
}: CardProps) {
  const activate = useDocument((state) => state.activate);
  const openCard = useDocument((state) => state.openCard);
  const insertAbove = useDocument((state) => state.insertAbove);
  const insertBelow = useDocument((state) => state.insertBelow);
  const insertChild = useDocument((state) => state.insertChild);
  const deleteCard = useDocument((state) => state.deleteCard);
  const startDrag = useDocument((state) => state.startDrag);
  const endDrag = useDocument((state) => state.endDrag);

  const hasChildren = card.children.length > 0;

  if (isEditing) {
    return <EditingCard card={card} hasChildren={hasChildren} language={language} />;
  }

  const dragRegion = (
    <div
      className="drag-region"
      title="Drag to move"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text", "");
        event.dataTransfer.effectAllowed = "move";
        startDrag(card.id);
      }}
      onDragEnd={endDrag}
    >
      <div className="handle" />
    </div>
  );

  const view = (
    <CardView
      cardId={card.id}
      content={card.content}
      onActivate={() => activate(card.id)}
      onEdit={() => openCard(card.id)}
    />
  );

  if (!isActive) {
    return (
      <div
        id={`card-${card.id}`}
        dir="auto"
        className={`card${isAncestor ? " ancestor" : ""}${hasChildren ? " has-children" : ""}`}
      >
        {dragRegion}
        {isDragging ? <DropRegions cardId={card.id} isLast={isLast} /> : null}
        {view}
      </div>
    );
  }

  return (
    <div
      id={`card-${card.id}`}
      dir="auto"
      className={`card active${hasChildren ? " has-children" : ""}`}
    >
      {dragRegion}
      <div className="flex-row card-top-overlay">
        <span
          className="card-btn ins-above"
          title={t(language, "Elm:InsertAboveTitle")}
          onClick={() => insertAbove(card.id)}
        >
          +
        </span>
      </div>
      <div className="flex-column card-right-overlay">
        <span
          className="card-btn delete"
          title={t(language, "Elm:DeleteCardTitle")}
          onClick={() => deleteCard(card.id)}
        />
        <span
          className="card-btn ins-right"
          title={t(language, "Elm:InsertChildTitle")}
          onClick={() => insertChild(card.id)}
        >
          +
        </span>
        <span
          className="card-btn edit"
          title={t(language, "Elm:EditCardTitle")}
          onClick={() => openCard(card.id)}
        />
      </div>
      <div className="flex-row card-bottom-overlay">
        <span
          className="card-btn ins-below"
          title={t(language, "Elm:InsertBelowTitle")}
          onClick={() => insertBelow(card.id)}
        >
          +
        </span>
      </div>
      {hasChildren ? <Fillet position="top-right" /> : null}
      {hasChildren ? <Fillet position="bottom-right" /> : null}
      {isDragging ? <DropRegions cardId={card.id} isLast={isLast} /> : null}
      {view}
      <span className="collaborators" />
    </div>
  );
}

export const Card = memo(CardImpl);
