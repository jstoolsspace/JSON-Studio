import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Image as ImageIcon } from "lucide-react";
import type { JsonNode } from "@jstools/json-ui";
import type { Tab } from "../stores/app";
import { useApp } from "../stores/app";
import { useSettings } from "../stores/settings";
import { useWindowedRows } from "../hooks/useWindowedRows";
import {
  collapseAll,
  expandToDepth,
  getNodePath,
  getNodeValue,
  getTreeWindow,
  revealNode,
  setNodeExpanded,
  setSubtreeExpanded,
} from "../ipc/commands";
import { NodeContextMenu, type MenuState } from "../components/NodeContextMenu";
import { ImagePreview, isImageValue } from "../components/ImagePreview";

export function TreeView({ tab }: { tab: Tab }) {
  const docId = tab.docId;
  const parentRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const expanded = useRef<Set<number>>(new Set([0]));
  const [version, setVersion] = useState(0);
  const [selIndex, setSelIndex] = useState(0);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const indentWidth = useSettings((st) => st.indentWidth);
  const collapseDepth = useSettings((st) => st.collapseDepth);

  const [imageNode, setImageNode] = useState<JsonNode | null>(null);
  const [detail, setDetail] = useState<{ path: string; value: string } | null>(
    null,
  );
  const treeReveal = useApp((s) => s.treeReveal);
  const clearTreeReveal = useApp((s) => s.clearTreeReveal);

  const { total, get, ensureRange } = useWindowedRows<JsonNode>(
    async (offset, limit) => {
      const w = await getTreeWindow(docId, offset, limit);
      return { rows: w.nodes, total: w.total };
    },
    [docId, version],
  );

  const rerender = () => setVersion((v) => v + 1);

  // Apply the configured initial expand depth once per document.
  useEffect(() => {
    if (collapseDepth > 1) {
      void expandToDepth(docId, collapseDepth).then(rerender);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const toggle = useCallback(
    async (node: JsonNode, isOpen: boolean) => {
      if (!isExpandable(node)) return;
      const willExpand = !isOpen;
      if (willExpand) expanded.current.add(node.id);
      else expanded.current.delete(node.id);
      await setNodeExpanded(docId, node.id, willExpand);
      rerender();
    },
    [docId],
  );

  const virtualizer = useVirtualizer({
    count: total.current,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 24,
  });

  const items = virtualizer.getVirtualItems();
  const firstIndex = items.length > 0 ? items[0]!.index : 0;
  const lastIndex = items.length > 0 ? items[items.length - 1]!.index : 0;
  useEffect(() => {
    if (total.current > 0) ensureRange(firstIndex, lastIndex);
  }, [firstIndex, lastIndex, ensureRange, total, version]);

  const isOpenAt = useCallback(
    (i: number) => {
      const n = get(i);
      if (!n || !isExpandable(n)) return false;
      const next = get(i + 1);
      return next ? next.depth > n.depth : expanded.current.has(n.id);
    },
    [get],
  );

  const move = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(total.current - 1, i));
      setSelIndex(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto" });
    },
    [virtualizer, total],
  );

  // ARIA tree keyboard navigation.
  const onTreeKey = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const node = get(selIndex);
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(selIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          move(selIndex - 1);
          break;
        case "Home":
          e.preventDefault();
          move(0);
          break;
        case "End":
          e.preventDefault();
          move(total.current - 1);
          break;
        case "ArrowRight":
          if (node && isExpandable(node)) {
            e.preventDefault();
            if (!isOpenAt(selIndex)) void toggle(node, false);
            else move(selIndex + 1);
          }
          break;
        case "ArrowLeft":
          if (node) {
            e.preventDefault();
            if (isExpandable(node) && isOpenAt(selIndex)) {
              void toggle(node, true);
            } else if (node.parent_id != null) {
              for (let j = selIndex - 1; j >= 0; j--) {
                const p = get(j);
                if (!p) break;
                if (p.depth === node.depth - 1) {
                  move(j);
                  break;
                }
              }
            }
          }
          break;
        case "Enter":
        case " ":
          if (node && isExpandable(node)) {
            e.preventDefault();
            void toggle(node, isOpenAt(selIndex));
          }
          break;
      }
    },
    [get, selIndex, move, isOpenAt, toggle, total],
  );

  const selectedId = get(selIndex)?.id;

  // Consume a pending "reveal node" request (from search / query results):
  // expand the node's ancestors on the backend, then scroll it into view.
  useEffect(() => {
    if (!treeReveal || treeReveal.docId !== docId) return;
    let alive = true;
    void revealNode(docId, treeReveal.nodeId).then((idx) => {
      if (!alive) return;
      rerender();
      requestAnimationFrame(() => {
        setSelIndex(idx);
        virtualizer.scrollToIndex(idx, { align: "center" });
        treeRef.current?.focus();
      });
      clearTreeReveal();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeReveal?.nonce, docId]);

  // Keep the detail panel in sync with the selected node.
  useEffect(() => {
    const n = get(selIndex);
    if (!n) {
      setDetail(null);
      return;
    }
    let alive = true;
    void Promise.all([
      getNodePath(docId, n.id),
      getNodeValue(docId, n.id),
    ]).then(([p, v]) => {
      if (alive) setDetail({ path: p.path, value: v });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, selIndex, version]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable in some contexts */
    }
  }

  async function onMenuAction(action: string, node: JsonNode) {
    setMenu(null);
    switch (action) {
      case "value":
      case "object":
      case "raw":
        await copyText(await getNodeValue(docId, node.id));
        break;
      case "key":
        await copyText(node.key ?? (node.array_index?.toString() ?? ""));
        break;
      case "path":
        await copyText((await getNodePath(docId, node.id)).path);
        break;
      case "pointer":
        await copyText((await getNodePath(docId, node.id)).pointer);
        break;
      case "expand-subtree":
        await setSubtreeExpanded(docId, node.id, true);
        markSubtree(node.id, true);
        rerender();
        break;
      case "collapse-subtree":
        await setSubtreeExpanded(docId, node.id, false);
        markSubtree(node.id, false);
        rerender();
        break;
    }
  }

  // Keep the local expanded mirror roughly in sync for subtree ops. The exact
  // set is the backend's; locally we just need chevron direction for loaded rows.
  function markSubtree(rootId: number, on: boolean) {
    // We don't have the subtree range on the client; clearing is safe because
    // chevron state is re-derived from the next render's loaded rows.
    if (on) expanded.current.add(rootId);
    else expanded.current.delete(rootId);
  }

  if (tab.parseError) {
    return (
      <div className="placeholder">
        <div>
          This document could not be parsed as a single JSON value.
          <br />
          Open the <strong>Raw</strong> view to inspect it (error at line{" "}
          {tab.parseError.line}, column {tab.parseError.column}).
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="viewbar" style={{ borderBottom: "none", paddingTop: 0 }}>
        <button
          className="btn"
          onClick={async () => {
            await collapseAll(docId);
            expanded.current = new Set([0]);
            rerender();
          }}
        >
          Collapse all
        </button>
        {[2, 3, 5].map((d) => (
          <button
            key={d}
            className="btn"
            onClick={async () => {
              await expandToDepth(docId, d);
              rerender();
            }}
          >
            Expand to {d}
          </button>
        ))}
        <button
          className="btn"
          title="Expand every node"
          onClick={async () => {
            await expandToDepth(docId, 2_000_000_000);
            rerender();
          }}
        >
          Expand all
        </button>
      </div>

      <div className="scroll" ref={parentRef} style={{ top: 36 }}>
        <div
          className="tree"
          role="tree"
          aria-label="JSON tree"
          tabIndex={0}
          ref={treeRef}
          onKeyDown={onTreeKey}
          aria-activedescendant={
            selectedId != null ? `tnode-${selectedId}` : undefined
          }
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {items.map((vi) => {
            const node = get(vi.index);
            // Infer expanded state from the next visible row's depth (robust
            // across expand-to-depth); fall back to the local mirror.
            const nextNode = node ? get(vi.index + 1) : undefined;
            const isOpen =
              !!node && isExpandable(node)
                ? nextNode
                  ? nextNode.depth > node.depth
                  : expanded.current.has(node.id)
                : false;
            return (
              <div
                key={vi.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {node ? (
                  <TreeRow
                    node={node}
                    indent={indentWidth}
                    expanded={isOpen}
                    selected={selIndex === vi.index}
                    onSelect={() => {
                      setSelIndex(vi.index);
                      treeRef.current?.focus();
                    }}
                    onToggle={() => void toggle(node, isOpen)}
                    onContext={(x, y) => setMenu({ x, y, node })}
                    onImage={() => setImageNode(node)}
                  />
                ) : (
                  <div className="tree-row" style={{ opacity: 0.4 }}>
                    <span style={{ marginLeft: 24 }}>…</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {detail && (
        <div className="node-detail">
          <div className="nd-row">
            <span className="nd-label">Path</span>
            <code className="nd-path" title={detail.path}>
              {detail.path}
            </code>
            <button
              className="btn icon"
              title="Copy path"
              onClick={() => void copyText(detail.path)}
            >
              ⧉
            </button>
          </div>
          <div className="nd-row">
            <span className="nd-label">Value</span>
            <code className="nd-value" title={detail.value}>
              {detail.value}
            </code>
            <button
              className="btn icon"
              title="Copy value"
              onClick={() => void copyText(detail.value)}
            >
              ⧉
            </button>
          </div>
        </div>
      )}

      {menu && (
        <NodeContextMenu
          state={menu}
          onAction={onMenuAction}
          onClose={() => setMenu(null)}
        />
      )}

      {imageNode && (
        <ImagePreview
          docId={docId}
          nodeId={imageNode.id}
          label={imageNode.key ?? `[${imageNode.array_index ?? 0}]`}
          onClose={() => setImageNode(null)}
        />
      )}
    </>
  );
}

function isExpandable(n: JsonNode): boolean {
  return (n.value_type === "object" || n.value_type === "array") && n.child_count > 0;
}

function TreeRow({
  node,
  indent,
  expanded,
  selected,
  onSelect,
  onToggle,
  onContext,
  onImage,
}: {
  node: JsonNode;
  indent: number;
  expanded: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onContext: (x: number, y: number) => void;
  onImage: () => void;
}) {
  const expandable = isExpandable(node);
  const showImage = node.value_type === "string" && isImageValue(node.preview);
  return (
    <div
      id={`tnode-${node.id}`}
      className={`tree-row${selected ? " selected" : ""}`}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      tabIndex={-1}
      style={{ paddingLeft: node.depth * indent + 4 }}
      onClick={onSelect}
      onDoubleClick={() => expandable && onToggle()}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
        onContext(e.clientX, e.clientY);
      }}
    >
      <span
        className="twisty"
        onClick={(e) => {
          e.stopPropagation();
          if (expandable) onToggle();
        }}
      >
        {expandable ? (
          expanded ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )
        ) : null}
      </span>

      {node.key !== null ? (
        <>
          <span className="tree-key">{node.key}</span>
          <span className="tree-colon">:</span>
        </>
      ) : node.array_index !== null ? (
        <>
          <span className="tree-index">{node.array_index}</span>
          <span className="tree-colon">:</span>
        </>
      ) : null}

      {node.value_type === "object" || node.value_type === "array" ? (
        <span className="tree-val preview">{node.preview}</span>
      ) : (
        <span className={`tree-val ${node.value_type}`}>{node.preview}</span>
      )}

      {showImage && (
        <button
          className="tree-img-btn"
          title="Preview image"
          onClick={(e) => {
            e.stopPropagation();
            onImage();
          }}
        >
          <ImageIcon size={12} />
        </button>
      )}

      <span className="tree-loc">L{node.line}</span>
    </div>
  );
}
