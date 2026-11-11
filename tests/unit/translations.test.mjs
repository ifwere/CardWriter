import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplacements,
  applyTranslations,
  findUnreplaced
} from "../../scripts/translations.mjs";

test("builds language replacements from i18n files", () => {
  const replacements = buildReplacements();
  assert.equal(replacements.get("%de:Cancel%"), "Abbrechen");
  assert.equal(replacements.get("%fr:Cancel%"), "Annuler");
  assert.ok(replacements.size > 100);
});

test("replaces non-language placeholders", () => {
  const replacements = buildReplacements();
  for (const token of [
    "{%SUPPORT_EMAIL%}",
    "{%SUPPORT_URGENT_EMAIL%}",
    "{%HOMEPAGE_URL%}",
    "{%TESTIMONIAL_URL%}"
  ]) {
    assert.ok(replacements.has(token), `missing replacement for ${token}`);
    assert.ok(!replacements.get(token).startsWith("{%"));
  }
});

test("escapes replacements that would break a JS string literal", () => {
  const replacements = buildReplacements();
  const german = replacements.get("%de:ExportSettingEverythingDesc%");
  assert.ok(german.includes('\\"'), "double quotes are escaped");
  const code = 'var x="%de:ExportSettingEverythingDesc%";';
  const output = applyTranslations(code, replacements);
  assert.doesNotThrow(() => new Function(output));
});

test("every replacement keeps a double-quoted JS literal parseable", () => {
  const replacements = buildReplacements();
  const code = [...replacements.keys()]
    .map((token, index) => `var value${index}="${token}";`)
    .join("\n");
  const output = applyTranslations(code, replacements);
  assert.doesNotThrow(() => new Function(output));
});

test("leaves unknown placeholders untouched", () => {
  const replacements = new Map([["%de:Cancel%", "Abbrechen"]]);
  const code = 'var a="%de:Cancel%";var b="%de:Missing%";';
  assert.equal(applyTranslations(code, replacements), 'var a="Abbrechen";var b="%de:Missing%";');
});

test("exact plural tokens win, otherwise the base is kept with its suffix", () => {
  const exact = new Map([["%de:Card%:0", "eine Karte"], ["%de:Card%:1", "Karten"]]);
  assert.equal(applyTranslations("%de:Card%:0", exact), "eine Karte");
  assert.equal(applyTranslations("%de:Card%:1", exact), "Karten");

  const baseOnly = new Map([["%de:Card%", "Karte"]]);
  assert.equal(applyTranslations("%de:Card%:0", baseOnly), "Karte:0");
});

test("findUnreplaced reports leftovers", () => {
  const leftovers = findUnreplaced('x="%xx:Y%";y="{%NOPE%}"');
  assert.deepEqual(leftovers.sort(), ["%xx:Y%", "{%NOPE%}"]);
});
