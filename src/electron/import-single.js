"use strict";

// JSON -> document importer, replacing the Elm worker.
//
// Faithful port of `Import.Single.decoder` + `Coders.treeToMarkdownOutline`.
// A Gingko JSON file is a list of `{ content, children? }` nodes. Import:
//   1. each node starts with an empty id
//   2. the tree is re-labelled in preorder (`0`, `0.0`, `0.0.0`, ...) — this
//      numbering defines each node's position, not a stable identity
//   3. every node id is rewritten to `node-<sha1(salt + oldId)>`, where `salt`
//      is a fresh 5-character alphanumeric string so ids do not collide with
//      an existing document's (the legacy app derived the whole audit trail
//      from the same salt)
//   4. the tree is serialized to the canonical `.gkw` markdown outline
//
// The SHA-1 digest is uppercase hex, matching the `elm/sha1` package the
// legacy worker used. ids only need to be unique within the document, so the
// wording of a note that is imported, edited and re-committed is unaffected.

const crypto = require("node:crypto");

/** Uppercase hex SHA-1, as produced by the `elm/sha1` package. */
function sha1Upper(value) {
  return crypto.createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

/** A random 5-character salt from the `[0-9A-Za-z]` alphabet (`RandomId`). */
function randomSalt() {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Preorder re-labelling: nodes become `0`, `0.0`, `0.0.0`, ... (`labelTree`). */
function labelTree(index, parentId, node) {
  const id = `${parentId}.${index}`;
  return {
    id,
    content: node.content,
    children: (node.children || []).map((child, childIndex) =>
      labelTree(childIndex, id, child)
    )
  };
}

/** Rewrites every node id to `node-<sha1(salt + id)>` (`renameNodes`). */
function renameNodes(salt, node) {
  return {
    id: `node-${sha1Upper(salt + node.id)}`,
    content: node.content,
    children: node.children.map((child) => renameNodes(salt, child))
  };
}

/** Canonical `.gkw` outline (`Coders.treeToMarkdownOutline`, root omitted). */
function toMarkdownOutline(tree) {
  return tree.children.map(outlineNode).join("\n");
}

function outlineNode(node) {
  const children = node.children.map(outlineNode).concat("");
  return `<gingko-card id="${node.id}">\n\n${node.content}\n\n${children.join(
    "\n"
  )}</gingko-card>`;
}

/**
 * Parses a Gingko JSON string and returns the markdown outline to save as a
 * new document. Throws with a readable message when the input is invalid.
 *
 * @param {string} jsonString
 * @returns {string}
 */
function importSingle(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of cards.");
  }

  const labelled = parsed.map((child, i) => labelTree(i, "", toNode(child)));
  const root = { id: "", content: "", children: labelled };
  const renamed = renameNodes(randomSalt(), root);
  return toMarkdownOutline(renamed);
}

/**
 * Coerces a parsed JSON value into a `{ content, children? }` node, validating
 * the shape as the legacy decoder did.
 *
 * @param {unknown} value
 * @returns {{ content: string, children: unknown[] }}
 */
function toNode(value) {
  if (typeof value !== "object" || value === null) {
    throw new Error("Each card must be an object.");
  }
  const { content, children } = value;
  if (typeof content !== "string") {
    throw new Error('Each card needs a "content" string.');
  }
  const kids = children === undefined ? [] : children;
  if (!Array.isArray(kids)) {
    throw new Error('"children" must be an array.');
  }
  return { content, children: kids };
}

module.exports = { importSingle };