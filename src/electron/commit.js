"use strict";

const crypto = require("node:crypto");

async function writeTree(workingTree) {
  const treeObjects = [];

  async function addShaIds(tree) {
    if (tree.children.length === 0) {
      const shaId = crypto.createHash("sha1").update(tree.content + "\n").digest("hex");
      treeObjects.push({ _id: shaId, type: "tree", content: tree.content, children: [] });
      return Object.assign(tree, { _id: shaId });
    }

    const childrenWithShas = await Promise.all(tree.children.map((t) => addShaIds(t)));
    const str = tree.content + "\n" + childrenWithShas.map((c) => c._id + " " + c.id).join("\n");
    const shaId = crypto.createHash("sha1").update(str).digest("hex");
    treeObjects.push({
      _id: shaId,
      type: "tree",
      content: tree.content,
      children: childrenWithShas.map((c) => [c._id, c.id])
    });
    return Object.assign(tree, { _id: shaId });
  }

  await addShaIds(workingTree);
  return treeObjects;
}

/**
 * @param {string} author
 * @param {string[]} parents
 * @param {object} tree
 * @param {number} timestamp
 * @param {string} metadata encoded JSON value
 */
async function commitTree(author, parents, tree, timestamp, metadata) {
  const treeObjects = await writeTree(tree);
  const rootId = treeObjects[treeObjects.length - 1]._id;
  const str =
    rootId +
    "\n" +
    (parents.length === 1 ? parents[0] + "\n" : parents.join("\n")) +
    author +
    " " +
    timestamp.toString();
  const commitSha = crypto.createHash("sha1").update(str).digest("hex");
  const commitObj = {
    _id: commitSha,
    type: "commit",
    tree: rootId,
    parents,
    author,
    timestamp
  };
  return [commitSha, treeObjects.concat([commitObj]), metadata];
}

module.exports = commitTree;
module.exports.commitTree = commitTree;
module.exports.default = commitTree;
