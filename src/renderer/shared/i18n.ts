// Translation catalogs for the React renderer.
//
// The JSON files under i18n/ are the same data the Elm build used. English is
// the source language (stored in `term`), so there is no en.json; when a
// language lacks an entry we fall back to the English term.

import ar from "../../../i18n/ar.json";
import br from "../../../i18n/br.json";
import ca from "../../../i18n/ca.json";
import de from "../../../i18n/de.json";
import es from "../../../i18n/es.json";
import fr from "../../../i18n/fr.json";
import hr from "../../../i18n/hr.json";
import hu from "../../../i18n/hu.json";
import it from "../../../i18n/it.json";
import ja from "../../../i18n/ja.json";
import mr from "../../../i18n/mr.json";
import nl from "../../../i18n/nl.json";
import pes from "../../../i18n/pes.json";
import ro from "../../../i18n/ro.json";
import ru from "../../../i18n/ru.json";
import sv from "../../../i18n/sv.json";
import zhHans from "../../../i18n/zh_hans.json";
import zhHant from "../../../i18n/zh_hant.json";

export interface TranslationEntry {
  reference: string;
  term: string;
  term_plural?: string | null;
  definition?: string | { one?: string; other?: string } | null;
}

// JSON module types differ between files (some plural definitions are objects),
// so normalize through unknown once here.
function asCatalog(value: unknown): TranslationEntry[] {
  return value as TranslationEntry[];
}

const SOURCE_CATALOGS: Record<string, TranslationEntry[]> = {
  ar: asCatalog(ar),
  br: asCatalog(br),
  ca: asCatalog(ca),
  de: asCatalog(de),
  es: asCatalog(es),
  fr: asCatalog(fr),
  hr: asCatalog(hr),
  hu: asCatalog(hu),
  it: asCatalog(it),
  ja: asCatalog(ja),
  mr: asCatalog(mr),
  nl: asCatalog(nl),
  pes: asCatalog(pes),
  ro: asCatalog(ro),
  ru: asCatalog(ru),
  sv: asCatalog(sv),
  zh_hans: asCatalog(zhHans),
  zh_hant: asCatalog(zhHant)
};

const CATALOGS = new Map<string, Map<string, TranslationEntry>>();
const FALLBACK_TERMS = new Map<string, TranslationEntry>();

for (const [language, entries] of Object.entries(SOURCE_CATALOGS)) {
  const catalog = new Map<string, TranslationEntry>();
  for (const entry of entries) {
    catalog.set(entry.reference, entry);
    if (!FALLBACK_TERMS.has(entry.reference)) FALLBACK_TERMS.set(entry.reference, entry);
  }
  CATALOGS.set(language, catalog);
}

const LANGUAGE_ALIASES: Record<string, string> = {
  "zh-hans": "zh_hans",
  "zh-hant": "zh_hant",
  "zh-cn": "zh_hans",
  "zh-tw": "zh_hant",
  fa: "pes",
  "fa-ir": "pes"
};

const INTL_LOCALES: Record<string, string> = {
  ar: "ar",
  br: "br",
  ca: "ca",
  de: "de",
  es: "es",
  fr: "fr",
  hr: "hr",
  hu: "hu",
  it: "it",
  ja: "ja",
  mr: "mr",
  nl: "nl",
  pes: "fa",
  ro: "ro",
  ru: "ru",
  sv: "sv",
  zh_hans: "zh-CN",
  zh_hant: "zh-TW"
};

/** Maps settings values such as "zh_hans" or "fa" to a catalog key. */
export function normalizeLanguage(language?: string | null): string {
  const raw = String(language ?? "en").trim().toLowerCase();
  const code = raw.replace(/-/g, "_");
  if (code === "en" || CATALOGS.has(code)) return code;
  return LANGUAGE_ALIASES[raw] ?? LANGUAGE_ALIASES[code] ?? "en";
}

function lookup(language: string | undefined, reference: string): TranslationEntry | undefined {
  const normalized = normalizeLanguage(language);
  return CATALOGS.get(normalized)?.get(reference) ?? FALLBACK_TERMS.get(reference);
}

function textOf(entry: TranslationEntry | undefined, reference: string): string {
  if (!entry) return reference;
  const definition = entry.definition;
  if (typeof definition === "string" && definition.length > 0) return definition;
  if (definition && typeof definition === "object") {
    if (typeof definition.other === "string" && definition.other.length > 0) return definition.other;
    if (typeof definition.one === "string" && definition.one.length > 0) return definition.one;
  }
  return entry.term || reference;
}

/** Translated string for a reference such as "Elm:RecentDocuments". */
export function t(language: string | undefined, reference: string): string {
  return textOf(lookup(language, reference), reference);
}

/** Translated string with plural selection. */
export function tn(language: string | undefined, reference: string, count: number): string {
  const entry = lookup(language, reference);
  if (!entry) return reference;

  const definition = entry.definition;
  if (definition && typeof definition === "object") {
    const chosen = count === 1 ? definition.one ?? definition.other : definition.other ?? definition.one;
    if (typeof chosen === "string" && chosen.length > 0) return chosen;
  }

  if (typeof definition !== "string" && entry.term_plural) {
    return count === 1 ? entry.term : entry.term_plural;
  }

  return textOf(entry, reference);
}

/** BCP-47 locale for Intl; unknown languages fall back to English. */
export function intlLocale(language?: string | null): string {
  return INTL_LOCALES[normalizeLanguage(language)] ?? "en";
}

/** "3 hours ago" / "just now" in the document's language. */
export function formatRelative(language: string | undefined, thenMs: number, nowMs: number): string {
  const deltaSeconds = Math.round((thenMs - nowMs) / 1000);
  const absolute = Math.abs(deltaSeconds);
  let formatter: Intl.RelativeTimeFormat;
  try {
    formatter = new Intl.RelativeTimeFormat(intlLocale(language), { numeric: "auto" });
  } catch {
    formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }

  if (absolute < 45) return formatter.format(deltaSeconds, "second");
  if (absolute < 60 * 45) return formatter.format(Math.round(deltaSeconds / 60), "minute");
  if (absolute < 60 * 60 * 22) return formatter.format(Math.round(deltaSeconds / 3600), "hour");
  if (absolute < 60 * 60 * 24 * 26) return formatter.format(Math.round(deltaSeconds / 86400), "day");
  if (absolute < 60 * 60 * 24 * 320) {
    return formatter.format(Math.round(deltaSeconds / (86400 * 30)), "month");
  }
  return formatter.format(Math.round(deltaSeconds / (86400 * 365)), "year");
}

/** Localized absolute date for tooltips and older documents. */
export function formatDateTime(language: string | undefined, ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale(language), {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
