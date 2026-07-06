"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, GripVertical, Check, Loader2, Minus, ZoomIn, ZoomOut, Maximize2, Undo2, Redo2 } from "lucide-react";
import { cn } from "@lib/utils";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";
import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeExecutionStatus,
  FlowNodeType,
} from "@lib/flows/types";

interface FlowCanvasProps {
  graph: FlowGraph;
  onChange: (graph: FlowGraph) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  nodeExecutionState?: Record<string, FlowNodeExecutionStatus>;
  flowId?: string;
}

const NODE_W = 176;
const NODE_H = 80;
const CANVAS_W = 2800;
const CANVAS_H = 1600;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 1;

const EDGE_HIT_WIDTH = 20;
const MAX_UNDO_HISTORY = 40;

type PortSide = "in" | "out-true" | "out-false" | "out";

interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

const DEFAULT_VIEWPORT: Viewport = { panX: 40, panY: 40, zoom: DEFAULT_ZOOM };

function normalizeViewport(viewport: Viewport | null | undefined): Viewport {
  if (!viewport || typeof viewport.panX !== "number" || typeof viewport.panY !== "number") {
    return DEFAULT_VIEWPORT;
  }
  const zoom =
    typeof viewport.zoom === "number" && Number.isFinite(viewport.zoom)
      ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom))
      : DEFAULT_ZOOM;
  return { panX: viewport.panX, panY: viewport.panY, zoom };
}

interface ConnectionDrag {
  sourceId: string;
  branch?: "true" | "false";
  x: number;
  y: number;
}

function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(40, Math.abs(tx - sx) * 0.45);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

function edgeMidpoint(
  source: FlowNode,
  target: FlowNode,
  branch?: "true" | "false"
): { x: number; y: number } {
  const outPort: PortSide =
    source.type === "condition"
      ? branch === "false"
        ? "out-false"
        : "out-true"
      : "out";
  const sp = portPosition(source, outPort);
  const tp = portPosition(target, "in");
  return { x: (sp.x + tp.x) / 2, y: (sp.y + tp.y) / 2 };
}

function portPosition(node: FlowNode, port: PortSide): { x: number; y: number } {
  const { x, y } = node.position;
  if (port === "in") return { x, y: y + NODE_H / 2 };
  if (port === "out-true") return { x: x + NODE_W, y: y + NODE_H * 0.3 };
  if (port === "out-false") return { x: x + NODE_W, y: y + NODE_H * 0.7 };
  return { x: x + NODE_W, y: y + NODE_H / 2 };
}

function screenToCanvas(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - viewport.panX) / viewport.zoom,
    y: (clientY - rect.top - viewport.panY) / viewport.zoom,
  };
}

export function FlowCanvas({
  graph,
  onChange,
  selectedNodeId,
  onSelectNode,
  nodeExecutionState = {},
  flowId,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportStorageKey = flowId ? `gmc-flow-viewport:${flowId}` : null;

  const readStoredViewport = (): Viewport | null => {
    if (graph.viewport) return normalizeViewport(graph.viewport);
    if (!viewportStorageKey || typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(viewportStorageKey);
      if (!raw) return null;
      return normalizeViewport(JSON.parse(raw) as Viewport);
    } catch {
      return null;
    }
  };

  const [viewport, setViewport] = useState<Viewport>(
    () => readStoredViewport() ?? DEFAULT_VIEWPORT
  );
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const updateViewport = useCallback((updater: Viewport | ((prev: Viewport) => Viewport)) => {
    setViewport((prev) => {
      const base = normalizeViewport(prev);
      const next = typeof updater === "function" ? updater(base) : updater;
      const normalized = normalizeViewport(next);
      if (viewportStorageKey && typeof window !== "undefined") {
        localStorage.setItem(viewportStorageKey, JSON.stringify(normalized));
      }
      return normalized;
    });
  }, [viewportStorageKey]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag | null>(null);
  const connectionDragRef = useRef<ConnectionDrag | null>(null);
  connectionDragRef.current = connectionDrag;
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const historyRef = useRef<{ past: FlowGraph[]; future: FlowGraph[] }>({ past: [], future: [] });
  const skipHistoryRef = useRef(false);
  const dragHistoryPushedRef = useRef(false);

  const commitGraph = useCallback(
    (next: FlowGraph) => {
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        onChange(next);
        return;
      }
      historyRef.current.past.push(graph);
      if (historyRef.current.past.length > MAX_UNDO_HISTORY) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = [];
      onChange(next);
    },
    [graph, onChange]
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(graph);
    skipHistoryRef.current = true;
    onChange(previous);
  }, [graph, onChange]);

  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(graph);
    skipHistoryRef.current = true;
    onChange(next);
  }, [graph, onChange]);

  const pushDragHistory = useCallback(() => {
    if (dragHistoryPushedRef.current) return;
    historyRef.current.past.push(graph);
    if (historyRef.current.past.length > MAX_UNDO_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    dragHistoryPushedRef.current = true;
  }, [graph]);

  const nodeMeta = (type: FlowNodeType) => FLOW_NODE_TYPES.find((n) => n.type === type)!;

  const fitView = useCallback(() => {
    if (!canvasRef.current || graph.nodes.length === 0) {
      updateViewport(DEFAULT_VIEWPORT);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const xs = graph.nodes.map((n) => n.position.x);
    const ys = graph.nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + NODE_W));
    const maxY = Math.max(...ys.map((y) => y + NODE_H));
    const pad = 80;
    const contentW = maxX - minX + pad * 2;
    const contentH = maxY - minY + pad * 2;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / contentW, rect.height / contentH)));
    updateViewport({
      zoom,
      panX: (rect.width - contentW * zoom) / 2 - minX * zoom + pad * zoom,
      panY: (rect.height - contentH * zoom) / 2 - minY * zoom + pad * zoom,
    });
  }, [graph.nodes, updateViewport]);

  const zoomBy = (delta: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    updateViewport((v) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + delta));
      const scale = nextZoom / v.zoom;
      return {
        zoom: nextZoom,
        panX: cx - (cx - v.panX) * scale,
        panY: cy - (cy - v.panY) * scale,
      };
    });
  };

  const addNode = (type: FlowNodeType) => {
    const meta = nodeMeta(type);
    const id = `${type}-${Date.now()}`;
    const node: FlowNode = {
      id,
      type,
      position: {
        x: 160 + graph.nodes.length * 48,
        y: 120 + graph.nodes.length * 36,
      },
      data: { ...meta.defaultData },
    };
    commitGraph({ ...graph, nodes: [...graph.nodes, node] });
    onSelectNode(id);
  };

  const removeNode = useCallback((nodeId: string) => {
    commitGraph({
      nodes: graph.nodes.filter((n) => n.id !== nodeId),
      edges: graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      viewport: graph.viewport,
    });
    if (selectedNodeId === nodeId) onSelectNode(null);
    setSelectedEdgeId(null);
  }, [graph, commitGraph, onSelectNode, selectedNodeId]);

  const removeEdge = (edgeId: string) => {
    commitGraph({ ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) });
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  };

  const selectEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    onSelectNode(null);
  };

  const addEdge = (source: string, target: string, branch?: "true" | "false") => {
    if (source === target) return;
    const exists = graph.edges.some(
      (e) =>
        e.source === source &&
        e.target === target &&
        (e.data?.branch ?? null) === (branch ?? null)
    );
    if (exists) return;
    const edge: FlowEdge = {
      id: `e-${source}-${target}-${branch ?? "default"}`,
      source,
      target,
      ...(branch ? { data: { branch } } : {}),
    };
    commitGraph({ ...graph, edges: [...graph.edges, edge] });
  };

  const finishConnectionAt = useCallback(
    (clientX: number, clientY: number) => {
      const drag = connectionDragRef.current;
      if (!drag) return;
      const hit = document.elementFromPoint(clientX, clientY);
      const inPort = hit?.closest('[data-port="in"]');
      const targetId = inPort?.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (targetId && targetId !== drag.sourceId) {
        addEdge(drag.sourceId, targetId, drag.branch);
      }
      connectionDragRef.current = null;
      setConnectionDrag(null);
    },
    [graph, commitGraph]
  );

  const startConnection = (
    e: React.PointerEvent,
    sourceId: string,
    branch?: "true" | "false"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canvasRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    const pos = screenToCanvas(e.clientX, e.clientY, rect, viewportRef.current);
    const drag = { sourceId, branch, x: pos.x, y: pos.y };
    connectionDragRef.current = drag;
    setConnectionDrag(drag);
    onSelectNode(sourceId);
    setSelectedEdgeId(null);
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && panStart.current && canvasRef.current) {
        const start = panStart.current;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        updateViewport((v) => ({
          ...v,
          panX: start.panX + dx,
          panY: start.panY + dy,
        }));
        return;
      }

      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (connectionDrag) {
        const pos = screenToCanvas(e.clientX, e.clientY, rect, viewportRef.current);
        setConnectionDrag({ ...connectionDrag, x: pos.x, y: pos.y });
        return;
      }

      if (!dragging) return;
      const pos = screenToCanvas(e.clientX, e.clientY, rect, viewportRef.current);
      onChange({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === dragging.nodeId
            ? { ...n, position: { x: Math.max(0, pos.x - dragging.offsetX), y: Math.max(0, pos.y - dragging.offsetY) } }
            : n
        ),
      });
    },
    [connectionDrag, dragging, graph, isPanning, onChange, updateViewport]
  );

  const onMouseUp = () => {
    dragHistoryPushedRef.current = false;
    setDragging(null);
    if (!connectionDragRef.current) {
      setIsPanning(false);
      panStart.current = null;
    }
  };

  useEffect(() => {
    if (!connectionDrag) return;
    const onUp = (e: PointerEvent) => {
      finishConnectionAt(e.clientX, e.clientY);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [connectionDrag, finishConnectionAt]);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: PointerEvent) => {
      const start = panStart.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      updateViewportRef.current((v) => ({
        ...v,
        panX: start.panX + dx,
        panY: start.panY + dy,
      }));
    };
    const onUp = () => {
      setIsPanning(false);
      panStart.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isPanning]);

  const updateViewportRef = useRef(updateViewport);
  updateViewportRef.current = updateViewport;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Shift+scroll, roda horizontal (tilt) ou trackpad = pan; roda vertical = zoom
      const horizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0;
      const wantsPan = (e.shiftKey && !e.ctrlKey && !e.metaKey) || horizontalPan;
      if (wantsPan) {
        updateViewportRef.current((v) => ({
          ...v,
          panX: v.panX - e.deltaX,
          panY: v.panY - e.deltaY,
        }));
        return;
      }

      const pinchZoom = e.ctrlKey || e.metaKey;
      const mouseWheelZoom =
        !pinchZoom &&
        (e.deltaMode === 1 || (e.deltaMode === 0 && Math.abs(e.deltaY) >= 48));
      const shouldZoom = pinchZoom || mouseWheelZoom;

      if (!shouldZoom) {
        updateViewportRef.current((v) => ({
          ...v,
          panX: v.panX - e.deltaX,
          panY: v.panY - e.deltaY,
        }));
        return;
      }

      const delta = pinchZoom
        ? e.deltaY > 0
          ? -0.08
          : 0.08
        : -e.deltaY * 0.002;
      updateViewportRef.current((v) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + delta));
        const scale = nextZoom / v.zoom;
        return {
          zoom: nextZoom,
          panX: mx - (mx - v.panX) * scale,
          panY: my - (my - v.panY) * scale,
        };
      });
    };

    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (selectedEdgeId) {
        commitGraph({ ...graph, edges: graph.edges.filter((edge) => edge.id !== selectedEdgeId) });
        setSelectedEdgeId(null);
        return;
      }
      if (selectedNodeId) {
        removeNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEdgeId, selectedNodeId, graph, commitGraph, removeNode, undo, redo]);

  const hasInputPort = (type: FlowNodeType) => type !== "trigger";
  const hasOutputPort = (type: FlowNodeType) => type !== "output";
  const isCondition = (type: FlowNodeType) => type === "condition";

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-slate-100/80">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nós</span>
        {FLOW_NODE_TYPES.map((meta) => (
          <button
            key={meta.type}
            type="button"
            onClick={() => addNode(meta.type)}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-200 hover:bg-brand-50"
          >
            <Plus size={11} />
            {meta.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            className="rounded-lg border border-line bg-white p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            onClick={undo}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Shift+Z)"
            className="rounded-lg border border-line bg-white p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            onClick={redo}
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            title="Zoom out"
            className="rounded-lg border border-line bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            onClick={() => zoomBy(-0.15)}
          >
            <ZoomOut size={14} />
          </button>
          <span className="min-w-[3rem] text-center text-[10px] text-slate-500">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            title="Zoom in"
            className="rounded-lg border border-line bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            onClick={() => zoomBy(0.15)}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            title="Ajustar à vista"
            className="rounded-lg border border-line bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            onClick={fitView}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle,_#cbd5e1_1px,_transparent_1px)] [background-size:20px_20px]"
        onMouseMove={onMouseMove}
        onPointerUp={(e) => {
          if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
            canvasRef.current.releasePointerCapture(e.pointerId);
          }
          onMouseUp();
        }}
        onMouseUp={onMouseUp}
        onPointerDownCapture={(e) => {
          if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            e.stopPropagation();
            canvasRef.current?.setPointerCapture(e.pointerId);
            setIsPanning(true);
            panStart.current = {
              x: e.clientX,
              y: e.clientY,
              panX: viewportRef.current.panX,
              panY: viewportRef.current.panY,
            };
          }
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onMouseDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            setSelectedEdgeId(null);
            onSelectNode(null);
          }
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            if (e.target === e.currentTarget) {
              setSelectedEdgeId(null);
              onSelectNode(null);
            }
          }}
        >
          {/* Visual edges */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={CANVAS_W}
            height={CANVAS_H}
          >
            {graph.edges.map((edge) => {
              const source = graph.nodes.find((n) => n.id === edge.source);
              const target = graph.nodes.find((n) => n.id === edge.target);
              if (!source || !target) return null;
              const outPort: PortSide =
                source.type === "condition"
                  ? edge.data?.branch === "false"
                    ? "out-false"
                    : "out-true"
                  : "out";
              const sp = portPosition(source, outPort);
              const tp = portPosition(target, "in");
              const path = edgePath(sp.x, sp.y, tp.x, tp.y);
              const selected = selectedEdgeId === edge.id;
              return (
                <g key={`vis-${edge.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={selected ? "#0066b3" : "#64748b"}
                    strokeWidth={(selected ? 3 : 2) / viewport.zoom}
                    markerEnd={selected ? "url(#flow-arrow-selected)" : "url(#flow-arrow)"}
                  />
                  {edge.data?.branch && (
                    <text
                      x={(sp.x + tp.x) / 2}
                      y={(sp.y + tp.y) / 2 - 8}
                      textAnchor="middle"
                      className="fill-amber-700 text-[10px] font-semibold"
                    >
                      {edge.data.branch}
                    </text>
                  )}
                </g>
              );
            })}
            {connectionDrag && (() => {
              const source = graph.nodes.find((n) => n.id === connectionDrag.sourceId);
              if (!source) return null;
              const outPort: PortSide = connectionDrag.branch
                ? connectionDrag.branch === "false"
                  ? "out-false"
                  : "out-true"
                : source.type === "condition"
                  ? "out-true"
                  : "out";
              const sp = portPosition(source, outPort);
              return (
                <path
                  d={edgePath(sp.x, sp.y, connectionDrag.x, connectionDrag.y)}
                  fill="none"
                  stroke="#0066b3"
                  strokeWidth={2 / viewport.zoom}
                  strokeDasharray="6 4"
                />
              );
            })()}
            <defs>
              <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6" fill="#64748b" />
              </marker>
              <marker id="flow-arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6" fill="#0066b3" />
              </marker>
            </defs>
          </svg>

          {/* Nodes */}
          <div
            className="pointer-events-none relative"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              if (e.target === e.currentTarget) {
                setSelectedEdgeId(null);
                onSelectNode(null);
              }
            }}
          >
            {graph.nodes.map((node) => {
              const meta = nodeMeta(node.type);
              const selected = selectedNodeId === node.id;
              const execStatus = nodeExecutionState[node.id];
              return (
                <div
                  key={node.id}
                  className={cn(
                    "pointer-events-auto absolute select-none rounded-xl border-2 bg-white transition-shadow duration-300",
                    meta.tone,
                    selected && "ring-2 ring-brand-400 ring-offset-1",
                    execStatus === "running" &&
                      "z-20 border-brand-400 shadow-lg shadow-brand-200/60 ring-2 ring-brand-300 ring-offset-1",
                    execStatus === "completed" &&
                      "z-10 border-emerald-400 bg-emerald-50/40 shadow-md shadow-emerald-200/50",
                    execStatus === "failed" &&
                      "z-10 border-rose-400 bg-rose-50/40 shadow-md shadow-rose-200/50",
                    execStatus === "skipped" && "opacity-40",
                    !execStatus && "shadow-sm"
                  )}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: NODE_W,
                    minHeight: NODE_H,
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelectedEdgeId(null);
                    onSelectNode(node.id);
                  }}
                  onPointerDown={(ev) => {
                    if ((ev.target as HTMLElement).closest("[data-port]")) return;
                    if ((ev.target as HTMLElement).closest("button")) return;
                    if (!canvasRef.current) return;
                    ev.currentTarget.setPointerCapture(ev.pointerId);
                    pushDragHistory();
                    const rect = canvasRef.current.getBoundingClientRect();
                    const pos = screenToCanvas(ev.clientX, ev.clientY, rect, viewportRef.current);
                    setDragging({
                      nodeId: node.id,
                      offsetX: pos.x - node.position.x,
                      offsetY: pos.y - node.position.y,
                    });
                    onSelectNode(node.id);
                    setSelectedEdgeId(null);
                  }}
                  onPointerUp={(ev) => {
                    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
                      ev.currentTarget.releasePointerCapture(ev.pointerId);
                    }
                  }}
                >
                  <div className="flex cursor-grab items-start gap-1 p-2.5 active:cursor-grabbing">
                    <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-bold uppercase tracking-wide opacity-60">{meta.label}</p>
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {String(node.data.label ?? meta.label)}
                      </p>
                    </div>
                    {execStatus === "running" && (
                      <Loader2 size={16} className="shrink-0 animate-spin text-brand-500" />
                    )}
                    {execStatus === "completed" && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    {execStatus === "failed" && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold">
                        !
                      </span>
                    )}
                    {execStatus === "skipped" && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 text-white">
                        <Minus size={12} strokeWidth={3} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeNode(node.id);
                      }}
                      className="rounded p-0.5 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Edge hit targets above nodes */}
          <svg
            className="absolute left-0 top-0 z-20"
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ pointerEvents: "none" }}
          >
            {graph.edges.map((edge) => {
              const source = graph.nodes.find((n) => n.id === edge.source);
              const target = graph.nodes.find((n) => n.id === edge.target);
              if (!source || !target) return null;
              const outPort: PortSide =
                source.type === "condition"
                  ? edge.data?.branch === "false"
                    ? "out-false"
                    : "out-true"
                  : "out";
              const sp = portPosition(source, outPort);
              const tp = portPosition(target, "in");
              const path = edgePath(sp.x, sp.y, tp.x, tp.y);
              return (
                <path
                  key={`hit-${edge.id}`}
                  data-edge-hit
                  d={path}
                  fill="none"
                  stroke="rgba(0,0,0,0.001)"
                  strokeWidth={EDGE_HIT_WIDTH / viewport.zoom}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    selectEdge(edge.id);
                  }}
                />
              );
            })}
          </svg>

          {/* Ports above edge hits */}
          <div
            className="pointer-events-none absolute left-0 top-0 z-30"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {graph.nodes.map((node) => (
              <div
                key={`ports-${node.id}`}
                data-node-id={node.id}
                className="pointer-events-none absolute"
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                }}
              >
                {hasInputPort(node.type) && (
                  <button
                    type="button"
                    data-port="in"
                    title="Entrada"
                    className={cn(
                      "pointer-events-auto absolute left-0 top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 shadow hover:bg-brand-500",
                      connectionDrag && "bg-brand-500 ring-2 ring-brand-200"
                    )}
                    onPointerDown={(ev) => ev.stopPropagation()}
                  />
                )}
                {hasOutputPort(node.type) &&
                  (isCondition(node.type) ? (
                    <>
                      <button
                        type="button"
                        data-port="out-true"
                        title="Saída verdadeiro"
                        className="pointer-events-auto absolute right-0 top-[30%] z-10 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-emerald-500 shadow hover:ring-2 hover:ring-emerald-200"
                        onPointerDown={(ev) => startConnection(ev, node.id, "true")}
                      />
                      <button
                        type="button"
                        data-port="out-false"
                        title="Saída falso"
                        className="pointer-events-auto absolute right-0 top-[70%] z-10 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-rose-500 shadow hover:ring-2 hover:ring-rose-200"
                        onPointerDown={(ev) => startConnection(ev, node.id, "false")}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      data-port="out"
                      title="Saída"
                      className="pointer-events-auto absolute right-0 top-1/2 z-10 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-brand-500 shadow hover:ring-2 hover:ring-brand-200"
                      onPointerDown={(ev) => startConnection(ev, node.id)}
                    />
                  ))}
              </div>
            ))}
          </div>

          {selectedEdgeId && (() => {
            const edge = graph.edges.find((e) => e.id === selectedEdgeId);
            if (!edge) return null;
            const source = graph.nodes.find((n) => n.id === edge.source);
            const target = graph.nodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            const mid = edgeMidpoint(source, target, edge.data?.branch);
            return (
              <button
                type="button"
                title="Apagar ligação"
                className="pointer-events-auto absolute z-40 flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-md hover:border-rose-300 hover:bg-rose-50"
                style={{ left: mid.x - 16, top: mid.y - 16 }}
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeEdge(selectedEdgeId);
                }}
              >
                <Trash2 size={14} />
              </button>
            );
          })()}
        </div>
        {graph.nodes.length > 0 && (
          <div
            className="pointer-events-none absolute bottom-8 right-3 z-50 overflow-hidden rounded-lg border border-line bg-white/90 p-1 shadow-sm"
            aria-hidden
          >
            <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="h-20 w-32">
              {graph.edges.map((edge) => {
                const source = graph.nodes.find((n) => n.id === edge.source);
                const target = graph.nodes.find((n) => n.id === edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={`mini-${edge.id}`}
                    x1={source.position.x + NODE_W / 2}
                    y1={source.position.y + NODE_H / 2}
                    x2={target.position.x + NODE_W / 2}
                    y2={target.position.y + NODE_H / 2}
                    stroke="#94a3b8"
                    strokeWidth={8}
                  />
                );
              })}
              {graph.nodes.map((node) => (
                <rect
                  key={`mini-${node.id}`}
                  x={node.position.x}
                  y={node.position.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={selectedNodeId === node.id ? "#0066b3" : "#cbd5e1"}
                />
              ))}
            </svg>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-400">
          Ligações: arrastar da saída para a entrada · Meio do rato ou Alt+arrastar pan · Roda horizontal pan · Ctrl+roda zoom
        </p>
      </div>
    </div>
  );
}
