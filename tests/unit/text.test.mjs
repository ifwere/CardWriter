import test from "node:test";
import assert from "node:assert/strict";

import {
  count,
  countWords,
  setHeadingLevel,
  surroundSelection,
  toggleCheckbox
} from "../../src/renderer/editor/model/text.ts";

test("counts words after removing the Elm punctuation set", () => {
  assert.equal(countWords("Hello, world!"), 2);
  assert.equal(countWords("don't stop"), 2); // the apostrophe is removed
  assert.equal(countWords("well-known word"), 2); // hyphens are kept
  assert.equal(countWords("snake_case name"), 2);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t "), 0);
  assert.equal(countWords("ONE two THREE"), 3);
});

test("counts code points, not UTF-16 units", () => {
  assert.deepEqual(count("Hi 😀"), [2, 4]);
  assert.deepEqual(count("中文"), [1, 2]);
  assert.deepEqual(count("a😀b"), [1, 3]);
});

test("surrounds a non-empty selection and moves the cursor", () => {
  assert.deepEqual(surroundSelection("hello world", 6, 11, "**"), {
    value: "hello **world**",
    selectionStart: 15,
    selectionEnd: 15
  });

  assert.deepEqual(surroundSelection("abc", 0, 3, "*"), {
    value: "*abc*",
    selectionStart: 5,
    selectionEnd: 5
  });

  assert.equal(surroundSelection("abc", 1, 1, "**"), null);
});

test("sets and clears heading levels on the first line", () => {
  assert.equal(setHeadingLevel("Title\nBody", 1), "# Title\nBody");
  assert.equal(setHeadingLevel("Title\nBody", 3), "### Title\nBody");
  assert.equal(setHeadingLevel("## Title\nBody", 0), "Title\nBody");
  assert.equal(setHeadingLevel("##Title", 2), "## Title");
});

test("toggles the requested checkbox", () => {
  assert.equal(toggleCheckbox("[ ] a [ ] b", 2), "[ ] a [X] b");
  assert.equal(toggleCheckbox("[ ] a [ ] b", 1), "[X] a [ ] b");
  assert.equal(toggleCheckbox("[X] done", 1), "[ ] done");
  assert.equal(toggleCheckbox("[x] done", 1), "[ ] done");
  assert.equal(toggleCheckbox("[ ] a", 2), "[ ] a");
});
