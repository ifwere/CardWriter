// The `/` search box in the lower-right corner (`Doc.UI.viewSearchField`).
//
// The input only exists in normal mode; while editing, the Elm view rendered an
// empty container so the layout did not shift.

import { useEffect, useRef } from "react";

import { useDocument } from "../state/documentStore.ts";
import { SearchIcon } from "./icons.tsx";
import { t } from "../../shared/i18n.ts";

export function SearchField() {
  const viewMode = useDocument((state) => state.viewMode);
  const searchField = useDocument((state) => state.searchField);
  const setSearchField = useDocument((state) => state.setSearchField);
  const language = useDocument((state) => state.language);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The `/` shortcut focuses `#search-input`, exactly like the Elm command.
  useEffect(() => {
    const focusSearch = () => inputRef.current?.focus();
    window.addEventListener("focus-search", focusSearch);
    return () => window.removeEventListener("focus-search", focusSearch);
  }, []);

  if (viewMode !== "normal") {
    return <div id="search-field" />;
  }

  return (
    <div id="search-field">
      <input
        ref={inputRef}
        type="search"
        id="search-input"
        required
        title={t(language, "Elm:PressToSearch")}
        value={searchField ?? ""}
        onChange={(event) => setSearchField(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setSearchField("");
            event.currentTarget.blur();
          }
        }}
      />
      {searchField === null ? (
        <span className="octicon search">
          <SearchIcon />
        </span>
      ) : null}
    </div>
  );
}
