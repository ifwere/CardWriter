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

export const LANGUAGES = [
  "zh_hans", "zh_hant", "es", "ar", "fr", "ru", "de", "ja", "mr", "pes",
  "it", "ro", "hr", "nl", "hu", "sv", "ca", "br", "cs", "fa",
  "id", "ko", "pl", "uk", "nb"
];

function prepTranslation(langCode, langData) {
  return langData.flatMap((t) => {
    const target = t.reference.replace("Elm:", `%${langCode}:`) + "%";
    const replacement = t.definition;

    if (typeof target === "string" && target.startsWith(`%${langCode}`) && typeof replacement === "string") {
      return [{ search: target, replace: replacement.replace("\n", "\\n").replace(/'/g, "\\'") }];
    }

    if (replacement === null) {
      return [{ search: target, replace: t.term.replace(/'/g, "\\'") }];
    }

    if (
      Object.prototype.hasOwnProperty.call(t, "term_plural") &&
      typeof replacement === "object" &&
      replacement !== null &&
      Object.prototype.hasOwnProperty.call(replacement, "one")
    ) {
      const singReplace = replacement.one.replace(/'/g, "\\'");
      const plurReplace = (replacement.other.replace(/'/g, "\\'") || t.term_plural);
      return [
        { search: target + ":0", replace: singReplace },
        { search: target + ":1", replace: plurReplace }
      ];
    }

    return [];
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

  for (const langCode of LANGUAGES) {
    const langPath = path.join(ROOT, "i18n", `${langCode}.json`);
    const langData = JSON.parse(fs.readFileSync(langPath, "utf-8"));
    for (const { search, replace } of prepTranslation(langCode, langData)) {
      // First definition wins, matching the upstream sequential-replace pass.
      if (typeof replace === "string" && !replacements.has(search)) {
        replacements.set(search, replace);
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
