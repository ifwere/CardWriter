// Golden tests for the `.gkw` document codec.
//
// The Elm sources are the reference implementation; these tests pin the
// byte-level output of `Coders.treeToMarkdownOutline` and the round-trip
// behavior of `normalizeAndParse`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAndParse,
  normalizeInput,
  treeToJSON,
  treeToMarkdownOutline,
  treeToMarkdownString,
  treeToOPML,
  treeToValue
} from "../../src/renderer/editor/model/coders.ts";
import { makeTree } from "../../src/renderer/editor/model/tree.ts";

test("serializes a single card exactly like the Elm implementation", () => {
  // Like the Elm function, withRoot=false writes the *children* of the given
  // node. A one-card document is therefore the child of the document root.
  const document = makeTree("0", "", [makeTree("1", "Hello")]);
  assert.equal(
    treeToMarkdownOutline(false, document),
    '<gingko-card id="1">\n\nHello\n\n</gingko-card>'
  );
  assert.equal(
    treeToMarkdownOutline(true, makeTree("1", "Hello")),
    '<gingko-card id="1">\n\nHello\n\n</gingko-card>'
  );
});

test("serializes nested cards with the same newline layout", () => {
  const child = makeTree("3", "C");
  const second = makeTree("2", "B", [child]);
  const first = makeTree("1", "A");
  const root = makeTree("0", "", [first, second]);

  const expected = [
    '<gingko-card id="0">',
    "",
    "",
    "",
    '<gingko-card id="1">',
    "",
    "A",
    "",
    "</gingko-card>",
    '<gingko-card id="2">',
    "",
    "B",
    "",
    '<gingko-card id="3">',
    "",
    "C",
    "",
    "</gingko-card>",
    "</gingko-card>",
    "</gingko-card>"
  ].join("\n");

  assert.equal(treeToMarkdownOutline(true, root), expected);
});

test("round-trips arbitrary card content", () => {
  const contents = [
    "Hello",
    "",
    "line1\nline2",
    "```js\nconst a = 1 > 0;\n```",
    "中文 😀",
    "  spaces  ",
    "# Title\n\n- a\n- b",
    "**bold** and _italics_",
    "\nleading",
    "trailing\n",
    "\n\nboth\n\n",
    "windows\r\nline endings",
    "angle brackets < and > stay literal"
  ];

  for (const content of contents) {
    const text = treeToMarkdownOutline(true, makeTree("1", content));
    const parsed = normalizeAndParse(text);
    assert.equal(parsed.ok, true, `failed to parse: ${JSON.stringify(content)}`);
    assert.equal(parsed.trees.length, 1);
    assert.equal(parsed.trees[0].content, content);
  }
});

test("round-trips a whole tree", () => {
  const tree = makeTree("0", "Root", [
    makeTree("1", "First"),
    makeTree("2", "Second", [makeTree("3", "Grandchild")]),
    makeTree("4", "")
  ]);

  const parsed = normalizeAndParse(treeToMarkdownOutline(true, tree));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.trees, [tree]);
});

test("round-trips multiple roots", () => {
  const trees = [makeTree("1", "A"), makeTree("2", "B", [makeTree("3", "C")])];
  const text = trees.map((tree) => treeToMarkdownOutline(true, tree)).join("\n");

  const parsed = normalizeAndParse(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.trees, trees);
});

test("parse then serialize reproduces canonical bytes", () => {
  const document = makeTree("0", "", [
    makeTree("1", "A"),
    makeTree("2", "B", [makeTree("3", "C")])
  ]);
  const text = treeToMarkdownOutline(false, document);

  const parsed = normalizeAndParse(text);
  assert.equal(parsed.ok, true);
  assert.equal(treeToMarkdownOutline(false, makeTree("0", "", parsed.trees)), text);
});

test("normalizes whitespace inside tags", () => {
  const input = '< gingko-card id="a">\n\nText\n\n</ gingko-card >\n';

  assert.equal(normalizeInput(input), "%!#<gingko-card|a>\n\nText\n\n%!#<gingko-card/>");

  const parsed = normalizeAndParse(input);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.trees, [makeTree("a", "Text")]);
});

test("keeps literal <gingko-card> text without an id attribute", () => {
  const content = "Use <gingko-card> tags in prose";
  const parsed = normalizeAndParse(treeToMarkdownOutline(true, makeTree("1", content)));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.trees[0].content, content);
});

test("rejects malformed documents", () => {
  const malformed = [
    "plain text",
    "   ",
    '<gingko-card id="1">\n\nA\n\n',
    '<gingko-card id="1">\n\nA\n\n</gingko-card>trailing',
    '<gingko-card id="1">\n\nA\n\n</nope>'
  ];

  for (const input of malformed) {
    const parsed = normalizeAndParse(input);
    assert.equal(parsed.ok, false, `expected a parse failure: ${JSON.stringify(input)}`);
  }
});

test("accepts an empty document", () => {
  assert.deepEqual(normalizeAndParse(""), { ok: true, trees: [] });
});

test("markdown export matches the Elm join rules", () => {
  const tree = makeTree("0", "Root", [
    makeTree("1", "A", [makeTree("3", "C")]),
    makeTree("2", "B")
  ]);

  assert.equal(treeToMarkdownString(false, tree), "A\n\nC\n\nB");
  assert.equal(treeToMarkdownString(true, tree), "Root\n\nA\n\nC\n\nB");
});

test("OPML export escapes attributes", () => {
  const tree = makeTree("0", "Root", [makeTree("1", 'A & "B" <C>')]);
  const opml = treeToOPML('Doc "x" <&>', tree);

  assert.ok(opml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<opml version="2.0">\n'));
  assert.ok(opml.includes("<title>Doc &quot;x&quot; &lt;&amp;&gt;</title>"));
  assert.ok(opml.includes('<outline text="Root">'));
  assert.ok(opml.includes('<outline text="A &amp; &quot;B&quot; &lt;C>">'));
  assert.ok(opml.endsWith("</outline>\n</outline>\n</body></opml>"));
});

test("JSON export drops ids and keeps the shape", () => {
  const tree = makeTree("0", "Root", [makeTree("1", "A")]);

  assert.deepEqual(treeToJSON(true, tree), [
    { content: "Root", children: [{ content: "A", children: [] }] }
  ]);
  assert.deepEqual(treeToJSON(false, tree), [{ content: "A", children: [] }]);
});

test("interop value includes ids", () => {
  const tree = makeTree("0", "Root", [makeTree("1", "A")]);
  assert.deepEqual(treeToValue(tree), {
    id: "0",
    content: "Root",
    children: [{ id: "1", content: "A", children: [] }]
  });
});
