import { useEffect, useMemo, useState } from "react";

import type { HomeData, RecentDocument } from "../shared/api";
import { formatDateTime, formatRelative, t } from "../shared/i18n";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function DirectoryIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 16 16" fill="#24292f" aria-hidden="true">
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
    </svg>
  );
}

function FileCodeIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 16 16" fill="#24292f" aria-hidden="true">
      <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v8.586A1.75 1.75 0 0 1 14.25 15h-9a.75.75 0 0 1 0-1.5h9a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 10 4.25V1.5H5.75a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0V1.75Z" />
      <path d="M7.03 8.47a.75.75 0 0 1 0 1.06L5.56 11l1.47 1.47a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 0Zm1.94 0a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1 0 1.06l-2 2a.75.75 0 1 1-1.06-1.06L10.44 11 8.97 9.53a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function DocumentRow({
  document,
  language,
  now
}: {
  document: RecentDocument;
  language: string;
  now: number;
}) {
  const isRecent = now - document.atimeMs < ONE_DAY_MS;
  const relative = formatRelative(language, document.atimeMs, now);
  const absolute = formatDateTime(language, document.atimeMs);
  const primary = isRecent ? relative : absolute;
  const secondary = isRecent ? absolute : relative;

  return (
    <div
      className="document-item"
      onClick={() => window.electronAPI.clickedDocument(document.path)}
    >
      <div className="doc-title" title={document.path}>
        {document.name}
      </div>
      <div className="doc-opened" title={secondary}>
        {primary}
      </div>
      <div
        className="remove-button"
        title="Remove from list"
        onClick={(event) => {
          event.stopPropagation();
          window.electronAPI.clickedRemoveDocument(document.path);
        }}
      >
        ×
      </div>
    </div>
  );
}

export function HomeApp({ data }: { data: HomeData }) {
  const language = data.language;
  const [documents, setDocuments] = useState<RecentDocument[]>(
    () => data.recentDocuments ?? []
  );
  const [now, setNow] = useState(() => data.currentTime || Date.now());

  useEffect(() => {
    setDocuments(data.recentDocuments ?? []);
  }, [data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => b.atimeMs - a.atimeMs),
    [documents]
  );

  return (
    <div id="container" data-renderer="react">
      <div id="new-row">
        <div className="template-row">
          <div
            id="template-new"
            className="template-item"
            onClick={() => window.electronAPI.clickedNew()}
          >
            <div className="template-thumbnail new" />
            <div className="template-title">{t(language, "Elm:HomeBlank")}</div>
          </div>
        </div>
      </div>

      <div id="open-import-row">
        <div className="template-row">
          <div
            id="template-open"
            className="template-item"
            onClick={() => window.electronAPI.clickedOpen()}
          >
            <div className="template-thumbnail">
              <DirectoryIcon />
            </div>
            <div className="template-title">Open</div>
          </div>

          <div
            id="template-import"
            className="template-item"
            onClick={() => window.electronAPI.clickedImport()}
          >
            <div className="template-thumbnail">
              <FileCodeIcon />
            </div>
            <div className="template-title">{t(language, "Elm:HomeImportJSON")}</div>
          </div>
        </div>
      </div>

      <div id="recent-documents-block">
        <div className="list-section-header">
          <span>{t(language, "Elm:RecentDocuments")}</span>
          <div className="list-header">{t(language, "Elm:LastOpened")}</div>
        </div>
        {sortedDocuments.map((document) => (
          <DocumentRow
            key={document.path}
            document={document}
            language={language}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}
