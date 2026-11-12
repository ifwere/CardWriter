// Keyboard shortcut reference window.
//
// Port of `Doc.HelpScreen.viewShortcuts`. The tables and translation keys are
// kept in the same order as the Elm source so the window looks unchanged.

import { t } from "../shared/i18n";

type KeySpec =
  | { kind: "key"; term?: string; raw?: string }
  | { kind: "drag"; term: string }
  | { kind: "text"; term?: string; raw?: string };

interface ShortcutRow {
  description: string;
  keys: KeySpec[];
}

interface ShortcutTable {
  title: string;
  rows: ShortcutRow[];
}

const key = (term: string): KeySpec => ({ kind: "key", term });
const rawKey = (raw: string): KeySpec => ({ kind: "key", raw });
const drag = (term: string): KeySpec => ({ kind: "drag", term });
const word = (term: string): KeySpec => ({ kind: "text", term });
const rawWord = (raw: string): KeySpec => ({ kind: "text", raw });

function viewModeTables(ctrlOrCmd: string): ShortcutTable[] {
  return [
    {
      title: "Elm:CardEditCreateDelete",
      rows: [
        { description: "Elm:EditCard", keys: [key("Elm:EnterKey")] },
        { description: "Elm:EditCardFullscreen", keys: [key("Elm:ShiftKey"), key("Elm:EnterKey")] },
        {
          description: "Elm:AddCardBelow",
          keys: [rawKey(ctrlOrCmd), rawKey("↓"), word("Elm:Or"), rawKey(ctrlOrCmd), rawKey("J")]
        },
        {
          description: "Elm:AddCardAbove",
          keys: [rawKey(ctrlOrCmd), rawKey("↑"), word("Elm:Or"), rawKey(ctrlOrCmd), rawKey("K")]
        },
        {
          description: "Elm:AddCardToRight",
          keys: [rawKey(ctrlOrCmd), rawKey("→"), word("Elm:Or"), rawKey(ctrlOrCmd), rawKey("L")]
        },
        { description: "Elm:DeleteCard", keys: [rawKey(ctrlOrCmd), key("Elm:Backspace")] }
      ]
    },
    {
      title: "Elm:NavigationMovingCards",
      rows: [
        {
          description: "Elm:GoUpDownLeftRight",
          keys: [
            rawKey("↑"),
            rawKey("↓"),
            rawKey("←"),
            rawKey("→"),
            word("Elm:Or"),
            rawKey("H"),
            rawKey("J"),
            rawKey("K"),
            rawKey("L")
          ]
        },
        { description: "Elm:GoToBeginningOfGroup", keys: [key("Elm:PageUp")] },
        { description: "Elm:GoToEndOfGroup", keys: [key("Elm:PageDown")] },
        { description: "Elm:GoToBeginningOfColumn", keys: [key("Elm:HomeKey")] },
        { description: "Elm:GoToEndOfColumn", keys: [key("Elm:EndKey")] },
        {
          description: "Elm:MoveCurrentCard",
          keys: [key("Elm:AltKey"), key("Elm:AnyOfAbove"), word("Elm:Or"), drag("Elm:DragCard")]
        }
      ]
    },
    {
      title: "Elm:CopyPaste",
      rows: [
        { description: "Elm:CopyCurrent", keys: [rawKey(ctrlOrCmd), rawKey("C")] },
        { description: "Elm:PasteBelow", keys: [rawKey(ctrlOrCmd), rawKey("V")] },
        {
          description: "Elm:PasteAsChild",
          keys: [rawKey(ctrlOrCmd), key("Elm:ShiftKey"), rawKey("V")]
        },
        { description: "Elm:InsertSelected", keys: [drag("Elm:DragSelected")] }
      ]
    },
    {
      title: "Elm:SearchingMerging",
      rows: [
        { description: "Elm:Search", keys: [rawKey("/")] },
        { description: "Elm:ClearSearch", keys: [key("Elm:EscKey")] },
        {
          description: "Elm:MergeCardUp",
          keys: [
            rawKey(ctrlOrCmd),
            key("Elm:ShiftKey"),
            rawKey("↑"),
            word("Elm:Or"),
            rawKey(ctrlOrCmd),
            key("Elm:ShiftKey"),
            rawKey("J")
          ]
        },
        {
          description: "Elm:MergeCardDown",
          keys: [
            rawKey(ctrlOrCmd),
            key("Elm:ShiftKey"),
            rawKey("↓"),
            word("Elm:Or"),
            rawKey(ctrlOrCmd),
            key("Elm:ShiftKey"),
            rawKey("K")
          ]
        }
      ]
    },
    {
      title: "Elm:HelpInfoDocs",
      rows: [
        { description: "Elm:WordCounts", keys: [rawKey("W")] },
        { description: "Elm:SwitchDocuments", keys: [rawKey(ctrlOrCmd), rawKey("O")] },
        { description: "Elm:ThisHelpScreen", keys: [rawKey("?")] }
      ]
    }
  ];
}

function editModeTables(ctrlOrCmd: string): ShortcutTable[] {
  return [
    {
      title: "Elm:CardSaveCreate",
      rows: [
        { description: "Elm:SaveChanges", keys: [rawKey(ctrlOrCmd), rawKey("S")] },
        { description: "Elm:SaveChangesAndExit", keys: [rawKey(ctrlOrCmd), key("Elm:EnterKey")] },
        { description: "Elm:AddCardBelowSplit", keys: [rawKey(ctrlOrCmd), rawKey("J")] },
        { description: "Elm:AddCardAboveSplit", keys: [rawKey(ctrlOrCmd), rawKey("K")] },
        { description: "Elm:AddCardToRightSplit", keys: [rawKey(ctrlOrCmd), rawKey("L")] },
        { description: "Elm:ExitEditMode", keys: [key("Elm:EscKey")] }
      ]
    },
    {
      title: "Elm:Formatting",
      rows: [
        { description: "Elm:BoldSelection", keys: [rawKey(ctrlOrCmd), rawKey("B")] },
        { description: "Elm:ItalicizeSelection", keys: [rawKey(ctrlOrCmd), rawKey("I")] },
        {
          description: "Elm:SetTitleLevel",
          keys: [key("Elm:AltKey"), rawKey("1"), rawWord(" ... "), rawKey("6")]
        }
      ]
    }
  ];
}

function KeyList({ language, specs }: { language: string; specs: KeySpec[] }) {
  return (
    <>
      {specs.map((spec, index) => {
        if (spec.kind === "text") {
          return spec.raw ?? t(language, spec.term ?? "");
        }
        if (spec.kind === "drag") {
          return (
            <span key={index} className="shortcut-key drag-command">
              {t(language, spec.term)}
            </span>
          );
        }
        return (
          <span key={index} className="shortcut-key">
            {spec.raw ?? t(language, spec.term ?? "")}
          </span>
        );
      })}
    </>
  );
}

function Table({ language, table }: { language: string; table: ShortcutTable }) {
  return (
    <div className="shortcut-table-wrapper">
      <h4 className="shortcut-table-title">{t(language, table.title)}</h4>
      <table className="shortcut-table">
        {table.rows.map((row, index) => (
          <tr key={index} className="shortcut-row">
            <td style={{ textAlign: "right" }}>
              <KeyList language={language} specs={row.keys} />
            </td>
            <td>{`: ${t(language, row.description)}`}</td>
          </tr>
        ))}
      </table>
    </div>
  );
}

function TableGroup({ language, tables }: { language: string; tables: ShortcutTable[] }) {
  return (
    <>
      {tables.map((table) => (
        <Table key={table.title} language={language} table={table} />
      ))}
    </>
  );
}

export function ShortcutsApp({ language, isMac }: { language: string; isMac: boolean }) {
  // SharedUI.ctrlOrCmdText
  const ctrlOrCmd = isMac ? "⌘" : "Ctrl";

  return (
    <>
      <h2 id="shortcut-main-title">{t(language, "Elm:KeyboardShortcuts")}</h2>
      <div id="shortcut-modes-wrapper">
        <div>
          <h3 id="view-mode-shortcuts-title">{t(language, "Elm:ViewModeShortcuts")}</h3>
          <TableGroup language={language} tables={viewModeTables(ctrlOrCmd)} />
        </div>
        <div id="mode-divider" />
        <div>
          <h3 id="edit-mode-shortcuts-title">{t(language, "Elm:EditModeShortcuts")}</h3>
          <TableGroup language={language} tables={editModeTables(ctrlOrCmd)} />
        </div>
      </div>
    </>
  );
}
