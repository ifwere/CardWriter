// Tests for the editor's rendering, export and history helpers.
//
// These pin the parts of `Doc.UI`, `Page.Doc.Export` and `Doc.Data` that the
// React editor reproduces: the custom Markdown rewrites, the export selection
// semantics, and the version-object payload shapes.

import test from "node:test";
import assert from "node:assert/strict";

import { makeTree } from "../../src/renderer/editor/model/tree.ts";
import { cardTitle, preprocessContent, renderContent } from "../../src/renderer/editor/model/markdown.ts";
import { exportToString, toExtension } from "../../src/renderer/editor/model/export.ts";
import {
  decodeHistory,
  emptyHistory,
  headSha,
  lastCommitTime,
  mergeHistory,
  requestCommit
} from "../../src/renderer/editor/model/history.ts";

/* ================= Markdown ================= */

test("rewrites the diff markers into ins/del elements", () => {
  assert.equal(
    preprocessContent("{++added++} and {--removed--}", "c1"),
    "<ins class='diff'>added</ins> and <del class='diff'>removed</del>"
  );
});

test("numbers checkboxes per card, 1-based, and marks checked ones", () => {
  const html = preprocessContent("[ ] a [x] b [X] c", "card-7");
  assert.match(html, /data-card-id='card-7' data-checkbox='1'/);
  assert.match(html, /checked data-card-id='card-7' data-checkbox='2'/);
  assert.match(html, /checked data-card-id='card-7' data-checkbox='3'/);
  assert.equal(html.match(/type='checkbox'/g)?.length, 3);
});

test("escapes a card id used in a checkbox attribute", () => {
  assert.match(preprocessContent("[ ] x", "a'b"), /data-card-id='a&#39;b'/);
});

test("renders GFM tables, hard breaks and emphasis", () => {
  const html = renderContent("# Title\n\nline one\nline two\n\n**bold**", "c1");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /line one<br>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("passes inline HTML through, like Markdown.toHtmlWith with sanitize = False", () => {
  const html = renderContent('literal <gingko-card id="9"> text', "c1");
  assert.match(html, /<gingko-card id="9">/);
});

test("card titles use the trimmed first line", () => {
  assert.equal(cardTitle("  First line  \nSecond"), "First line");
  assert.equal(cardTitle("\n\nBody"), "(empty)");
  assert.equal(cardTitle(""), "(empty)");
  assert.equal(cardTitle("One\r\nTwo"), "One");
});

/* ================= Export ================= */

function document() {
  return makeTree("0", "", [
    makeTree("1", "Root", [makeTree("3", "Leaf A"), makeTree("4", "Leaf B")]),
    makeTree("2", "Second")
  ]);
}

test("maps formats to file extensions", () => {
  assert.equal(toExtension("docx"), "docx");
  assert.equal(toExtension("json"), "json");
  assert.equal(toExtension("opml"), "opml");
  assert.equal(toExtension("text"), "md");
});

test("exports everything without the root content", () => {
  const output = exportToString("Doc", "everything", "text", document().children[0], document());
  assert.equal(output, "Root\n\nLeaf A\n\nLeaf B\n\nSecond");
});

test("exports the subtree with its own content first", () => {
  const tree = document();
  const active = tree.children[0];
  assert.equal(exportToString("Doc", "subtree", "text", active, tree), "Root\n\nLeaf A\n\nLeaf B");
});

test("exports leaves only", () => {
  const tree = document();
  assert.equal(
    exportToString("Doc", "leaves", "text", tree.children[0], tree),
    "Leaf A\n\nLeaf B\n\nSecond"
  );
});

test("exports the current column, flattened and childless", () => {
  const tree = document();
  assert.equal(
    exportToString("Doc", "column", "text", tree.children[0], tree),
    "Root\n\nSecond"
  );
});

test("JSON export nests content and children", () => {
  const tree = document();
  const parsed = JSON.parse(exportToString("Doc", "subtree", "json", tree.children[0], tree));
  assert.deepEqual(parsed, [
    {
      content: "Root",
      children: [
        { content: "Leaf A", children: [] },
        { content: "Leaf B", children: [] }
      ]
    }
  ]);
});

test("OPML export escapes attribute text", () => {
  const tree = makeTree("0", "", [makeTree("1", 'a "quote" & <tag>')]);
  const opml = exportToString("Doc & Co", "everything", "opml", tree.children[0], tree);
  assert.match(opml, /<title>Doc &amp; Co<\/title>/);
  assert.match(opml, /text="a &quot;quote&quot; &amp; &lt;tag>/);
});

/* ================= History ================= */

const GROUPED = {
  ref: [{ _id: "heads/master", type: "ref", value: "c2", ancestors: ["c1"], _rev: "" }],
  commit: [
    {
      _id: "c2",
      type: "commit",
      tree: "t2",
      parents: ["c1"],
      author: "<local-file>",
      timestamp: 2000
    },
    {
      _id: "c1",
      type: "commit",
      tree: "t1",
      parents: [],
      author: "<local-file>",
      timestamp: 1000
    }
  ],
  tree: [
    { _id: "t2", type: "tree", content: "Root", children: [["t1", "1"]] },
    { _id: "t1", type: "tree", content: "Child", children: [] }
  ]
};

test("decodes the grouped payload from the main process", () => {
  const history = decodeHistory(GROUPED);
  assert.equal(history.refs["heads/master"].value, "c2");
  assert.deepEqual(history.refs["heads/master"].ancestors, ["c1"]);
  assert.equal(history.commits.c2.parents[0], "c1");
  assert.deepEqual(history.trees.t2.children, [["t1", "1"]]);
});

test("ignores malformed history entries instead of throwing", () => {
  const history = decodeHistory({
    ref: [null, { value: 5 }, { _id: "ok", value: "c1", ancestors: [], _rev: "" }],
    commit: [{ _id: "c1" }],
    tree: "not an array"
  });

  assert.deepEqual(Object.keys(history.refs), ["ok"]);
  assert.deepEqual(Object.keys(history.commits), []);
  assert.deepEqual(Object.keys(history.trees), []);
});

test("treats a missing payload as empty history", () => {
  assert.deepEqual(decodeHistory(null), emptyHistory());
  assert.deepEqual(decodeHistory(undefined), emptyHistory());
  assert.deepEqual(decodeHistory("nope"), emptyHistory());
});

test("merges history with newer objects winning", () => {
  const merged = mergeHistory(
    { refs: { "heads/master": { value: "old", ancestors: [], rev: "" } }, commits: {}, trees: {} },
    decodeHistory(GROUPED)
  );
  assert.equal(merged.refs["heads/master"].value, "c2");
  assert.equal(Object.keys(merged.commits).length, 2);
});

test("reads the head sha and the newest commit time", () => {
  const history = decodeHistory(GROUPED);
  assert.equal(headSha(history), "c2");
  assert.equal(lastCommitTime(history), 2000);
  assert.equal(headSha(emptyHistory()), undefined);
  assert.equal(lastCommitTime(emptyHistory()), undefined);
});

test("builds the commit request with the head as its parent", () => {
  const history = decodeHistory(GROUPED);
  const workingTree = { id: "0", content: "", children: [] };
  const request = requestCommit(workingTree, history, '"doc.gkw"');

  assert.equal(request.author, "<local-file>");
  assert.deepEqual(request.parents, ["c2"]);
  assert.equal(request.metadata, '"doc.gkw"');
  assert.deepEqual(request.workingTree, workingTree);
});

test("a document without history commits with no parents", () => {
  assert.deepEqual(requestCommit({}, emptyHistory(), '""').parents, []);
});
