// Post-compilation translation substitution.
//
// The Elm sources carry placeholders such as `%zh_hans:Cancel%` (and
// `{%SUPPORT_EMAIL%}`). We replace them after `elm make` so that the compiler
// never has to parse non-Elm replacement text, and so that escaping rules only
// have to hold for JavaScript string literals.
//
// Ported from the upstream client's elm-postprocess.mjs.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Derived from the i18n directory so the build follows the translation set
// shipped with the Elm sources.
export const LANGUAGES = fs
  .readdirSync(path.join(ROOT, "i18n"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length))
  .sort();

function escapeReplacement(value) {
  return String(value).replace(/\n/g, "\\n").replace(/'/g, "\\'");
}

function hasText(value) {
  return typeof value === "string" && value.length > 0;
}

function prepTranslation(langCode, langData) {
  return langData.flatMap((t) => {
    const target = t.reference.replace("Elm:", `%${langCode}:`) + "%";
    const replacement = t.definition;
    const isPluralEntry = hasText(t.term_plural);

    // The Elm source uses explicit `:0` / `:1` tokens for plural messages.
    // Some languages (ja, zh, pes, ...) only provide `other`, so both forms
    // fall back to it instead of leaving a raw placeholder in the UI.
    if (isPluralEntry) {
      let singular = null;
      let plural = null;

      if (typeof replacement === "string") {
        singular = replacement;
        plural = replacement;
      } else if (replacement && typeof replacement === "object") {
        singular = hasText(replacement.one) ? replacement.one : replacement.other;
        plural = hasText(replacement.other) ? replacement.other : replacement.one;
      } else if (replacement === null) {
        singular = t.term;
        plural = t.term_plural;
      }

      if (!hasText(singular)) {
        singular = t.term;
        plural = t.term_plural;
      }

      if (hasText(singular)) {
        const sing = escapeReplacement(singular);
        const plur = escapeReplacement(hasText(plural) ? plural : singular);
        return [
          { search: target + ":0", replace: sing },
          { search: target + ":1", replace: plur }
        ];
      }
      return [];
    }

    if (typeof replacement === "string" && replacement.length > 0) {
      return [{ search: target, replace: escapeReplacement(replacement) }];
    }

    return [{ search: target, replace: escapeReplacement(t.term) }];
  });
}

/**
 * Builds the placeholder -> replacement map used after Elm compilation.
 *
 * @returns {Map<string, string>}
 */
export function buildReplacements() {
  const config = require(path.join(ROOT, "config.js"));
  const replacements = new Map();

  /** @type {Map<string, Map<string, object>>} */
  const entriesByLanguage = new Map();
  /** English terms used when a language is missing a key entirely. */
  const englishTerms = new Map();

  for (const langCode of LANGUAGES) {
    const langPath = path.join(ROOT, "i18n", `${langCode}.json`);
    const langData = JSON.parse(fs.readFileSync(langPath, "utf-8"));
    const byReference = new Map();
    for (const entry of langData) {
      byReference.set(entry.reference, entry);
      if (!englishTerms.has(entry.reference) || !hasText(englishTerms.get(entry.reference).term)) {
        englishTerms.set(entry.reference, entry);
      }
    }
    entriesByLanguage.set(langCode, byReference);
  }

  // Every key known in any language gets a token in every language. Missing
  // translations fall back to the English term rather than shipping a raw
  // `%lang:Key%` placeholder.
  for (const langCode of LANGUAGES) {
    const byReference = entriesByLanguage.get(langCode);
    for (const [reference, englishEntry] of englishTerms) {
      const entry = byReference.get(reference) || {
        reference,
        term: englishEntry.term,
        term_plural: englishEntry.term_plural,
        definition: null
      };
      for (const { search, replace } of prepTranslation(langCode, [entry])) {
        // First definition wins, matching the upstream sequential-replace pass.
        if (typeof replace === "string" && !replacements.has(search)) {
          replacements.set(search, replace);
        }
      }
    }
  }

  const otherReplacements = [
    ["{%SUPPORT_EMAIL%}", config.SUPPORT_EMAIL],
    ["{%SUPPORT_URGENT_EMAIL%}", config.SUPPORT_URGENT_EMAIL],
    ["{%HOMEPAGE_URL%}", config.HOMEPAGE_URL],
    ["{%TESTIMONIAL_URL%}", config.TESTIMONIAL_URL],
    ["{%VOX_EMPORIUM_SALT%}", config.VOX_EMPORIUM_SALT]
  ];

  for (const [search, replace] of otherReplacements) {
    if (typeof replace === "string" && !replacements.has(search)) {
      replacements.set(search, replace);
    }
  }

  return replacements;
}

// Every placeholder has a fixed shape, so one scan of the bundle is enough.
// A `:0`/`:1` plural suffix is only part of the token when a plural definition
// exists; otherwise the bare token is what gets replaced.
const PLACEHOLDER = /%[A-Za-z_]+:[A-Za-z0-9_]+%(?::[01])?|\{%[A-Z_]+%\}/g;

/**
 * @param {string} code
 * @param {Map<string, string>} replacements
 * @returns {string}
 */
export function applyTranslations(code, replacements) {
  return code.replace(PLACEHOLDER, (match) => {
    const replacement = replacements.get(match);
    if (replacement !== undefined) return replacement;

    const suffix = match.slice(-2);
    if (suffix === ":0" || suffix === ":1") {
      const base = replacements.get(match.slice(0, -2));
      if (base !== undefined) return base + suffix;
    }

    return match;
  });
}

/** Placeholders left in generated code indicate a missing translation. */
export function findUnreplaced(code) {
  return code.match(PLACEHOLDER) || [];
}
