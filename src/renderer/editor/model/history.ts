// Version-history objects exchanged with the main process.
//
// Mirrors the parts of `Doc.Data` the renderer needs: decoding the grouped
// payload from `file-received` / `commit-data-result`, merging it, and building
// the `commit-data` request. The main process owns the actual commit (SHA-1
// computation and `objects.log` writes); this module only prepares the payload
// and mirrors the object shapes so the store can read `heads/master`.

export interface RefObject {
  value: string;
  ancestors: string[];
  rev: string;
}

export interface CommitObject {
  tree: string;
  parents: string[];
  author: string;
  timestamp: number;
}

export interface TreeObject {
  content: string;
  children: [string, string][];
}

export interface HistoryData {
  refs: Record<string, RefObject>;
  commits: Record<string, CommitObject>;
  trees: Record<string, TreeObject>;
}

/** Grouped object payload: `objectsToElmData` groups by `type`. */
interface GroupedObjects {
  ref?: unknown;
  commit?: unknown;
  tree?: unknown;
}

export interface CommitRequest {
  workingTree: unknown;
  author: string;
  parents: string[];
  metadata: string;
}

export function emptyHistory(): HistoryData {
  return { refs: {}, commits: {}, trees: {} };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

/**
 * Decodes the grouped payload from the main process.
 *
 * Unknown or malformed entries are skipped: history is an optimisation for the
 * save indicator and (later) the history slider, never the document itself.
 */
export function decodeHistory(payload: unknown): HistoryData {
  const history = emptyHistory();
  if (!payload || typeof payload !== "object") return history;
  const grouped = payload as GroupedObjects;

  for (const entry of asArray(grouped.ref)) {
    const id = typeof entry._id === "string" ? entry._id : undefined;
    if (!id || typeof entry.value !== "string") continue;
    history.refs[id] = {
      value: entry.value,
      ancestors: Array.isArray(entry.ancestors) ? entry.ancestors.map(String) : [],
      rev: typeof entry._rev === "string" ? entry._rev : ""
    };
  }

  for (const entry of asArray(grouped.commit)) {
    const id = typeof entry._id === "string" ? entry._id : undefined;
    if (!id || typeof entry.tree !== "string") continue;
    history.commits[id] = {
      tree: entry.tree,
      parents: Array.isArray(entry.parents) ? entry.parents.map(String) : [],
      author: typeof entry.author === "string" ? entry.author : "",
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0
    };
  }

  for (const entry of asArray(grouped.tree)) {
    const id = typeof entry._id === "string" ? entry._id : undefined;
    if (!id || typeof entry.content !== "string") continue;
    history.trees[id] = {
      content: entry.content,
      children: Array.isArray(entry.children)
        ? entry.children
            .filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2)
            .map((pair) => [String(pair[0]), String(pair[1])] as [string, string])
        : []
    };
  }

  return history;
}

/** Newer objects win; ids are content-addressed so this is a union. */
export function mergeHistory(current: HistoryData, incoming: HistoryData): HistoryData {
  return {
    refs: { ...current.refs, ...incoming.refs },
    commits: { ...current.commits, ...incoming.commits },
    trees: { ...current.trees, ...incoming.trees }
  };
}

/** Commit the next version should point at, if the document has history. */
export function headSha(history: HistoryData): string | undefined {
  return history.refs["heads/master"]?.value;
}

/** Newest commit timestamp, used by the save indicator. */
export function lastCommitTime(history: HistoryData): number | undefined {
  const times = Object.values(history.commits).map((commit) => commit.timestamp);
  return times.length > 0 ? Math.max(...times) : undefined;
}

/**
 * Builds the `commit-data` payload (`Doc.Data.requestCommit`).
 *
 * The author matches the Elm implementation (`<local-file>`); `metadata` is the
 * document path as a JSON string.
 */
export function requestCommit(
  workingTree: unknown,
  history: HistoryData,
  metadata: string
): CommitRequest {
  const head = headSha(history);
  return {
    workingTree,
    author: "<local-file>",
    parents: head ? [head] : [],
    metadata
  };
}
