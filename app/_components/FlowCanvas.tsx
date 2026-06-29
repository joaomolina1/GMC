"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { cn } from "@lib/utils";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from "@lib/flows/types";

interface FlowCanvasProps {
  graph: FlowGraph;
  onChange: (graph: FlowGraph) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

const NODE_W = 176;
const NODE_H = 80;
const CANVAS_W = 2800;
const CANVAS_H = 1600;
const PORT = 10;

type PortSide = "in" | "out-true" | "out-false" | "out";

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

function portPosition(
  node: FlowNode,
  port: PortSide
): { x: number; y: number } {
  const { x, y } = node.position;
  if (port === "in") return { x, y: y + NODE_H / 2 };
  if (port === "out-true") return { x: x + NODE_W, y: y + NODE_H * 0.3 };
  if (port === "out-false") return { x: x + NODE_W, y: y + NODE_H * 0.7 };
  return { x: x + NODE_W, y: y + NODE_H / 2 };
}

export function FlowCanvas({
  graph,
  onChange,
  selectedNodeId,
  onSelectNode,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag | null>(null);
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const nodeMeta = (type: FlowNodeType) =>
    FLOW_NODE_TYPES.find((n) => n.type === type)!;

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
    onChange({ ...graph, nodes: [...graph.nodes, node] });
    onSelectNode(id);
  };

  const removeNode = (nodeId: string) => {
    onChange({
      nodes: graph.nodes.filter((n) => n.id !== nodeId),
      edges: graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
    if (selectedNodeId === nodeId) onSelectNode(null);
  };

  const addEdge = (
    source: string,
    target: string,
    branch?: "true" | "false"
  ) => {
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
    onChange({ ...graph, edges: [...graph.edges, edge] });
  };

  const startConnection = (
    e: React.MouseEvent,
    sourceId: string,
    branch?: "true" | "false"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setConnectionDrag({
      sourceId,
      branch,
      x: e.clientX - rect.left + canvasRef.current.scrollLeft,
      y: e.clientY - rect.top + canvasRef.current.scrollTop,
    });
    onSelectNode(sourceId);
  };

  const completeConnection = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    if (!connectionDrag) return;
    if (connectionDrag.sourceId !== targetId) {
      addEdge(connectionDrag.sourceId, targetId, connectionDrag.branch);
    }
    setConnectionDrag(null);
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (connectionDrag && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setConnectionDrag({
          ...connectionDrag,
          x: e.clientX - rect.left + canvasRef.current.scrollLeft,
          y: e.clientY - rect.top + canvasRef.current.scrollTop,
        });
        return;
      }

      if (!dragging || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + canvasRef.current.scrollLeft - dragging.offsetX;
      const y = e.clientY - rect.top + canvasRef.current.scrollTop - dragging.offsetY;
      onChange({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === dragging.nodeId
            ? { ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } }
            : n
        ),
      });
    },
    [connectionDrag, dragging, graph, onChange]
  );

  const onMouseUp = () => {
    setDragging(null);
    setConnectionDrag(null);
  };

  const hasInputPort = (type: FlowNodeType) => type !== "trigger";
  const hasOutputPort = (type: FlowNodeType) => type !== "output";
  const isCondition = (type: FlowNodeType) => type === "condition";

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-slate-100/80">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Nós
        </span>
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
        <span className="ml-auto text-[10px] text-slate-400">
          Arraste das bolinhas para ligar nós
        </span>
      </div>

      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,_#cbd5e1_1px,_transparent_1px)] [background-size:20px_20px]"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
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

            return (
              <g key={edge.id}>
                <path
                  d={edgePath(sp.x, sp.y, tp.x, tp.y)}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={2}
                  markerEnd="url(#flow-arrow)"
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
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          })()}

          <defs>
            <marker
              id="flow-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6" fill="#64748b" />
            </marker>
          </defs>
        </svg>

        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {graph.nodes.map((node) => {
            const meta = nodeMeta(node.type);
            const selected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute select-none rounded-xl border-2 bg-white shadow-sm transition-shadow",
                  meta.tone,
                  selected && "ring-2 ring-brand-400 ring-offset-1 shadow-md"
                )}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                }}
                onClick={() => onSelectNode(node.id)}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest("[data-port]")) return;
                  if ((e.target as HTMLElement).closest("button")) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setDragging({
                    nodeId: node.id,
                    offsetX: e.clientX - rect.left,
                    offsetY: e.clientY - rect.top,
                  });
                  onSelectNode(node.id);
                }}
              >
                {hasInputPort(node.type) && (
                  <button
                    type="button"
                    data-port="in"
                    title="Entrada — largue aqui para ligar"
                    className={cn(
                      "absolute left-0 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 shadow hover:scale-125 hover:bg-brand-500",
                      connectionDrag && "scale-125 bg-brand-500"
                    )}
                    onMouseUp={(e) => completeConnection(e, node.id)}
                  />
                )}

                {hasOutputPort(node.type) &&
                  (isCondition(node.type) ? (
                    <>
                      <button
                        type="button"
                        data-port="out-true"
                        title="Saída verdadeiro"
                        className="absolute right-0 top-[30%] z-10 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-emerald-500 shadow hover:scale-125"
                        onMouseDown={(e) => startConnection(e, node.id, "true")}
                      />
                      <button
                        type="button"
                        data-port="out-false"
                        title="Saída falso"
                        className="absolute right-0 top-[70%] z-10 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-rose-500 shadow hover:scale-125"
                        onMouseDown={(e) => startConnection(e, node.id, "false")}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      data-port="out"
                      title="Saída — arraste para ligar"
                      className="absolute right-0 top-1/2 z-10 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-brand-500 shadow hover:scale-125"
                      onMouseDown={(e) => startConnection(e, node.id)}
                    />
                  ))}

                <div className="flex cursor-grab items-start gap-1 p-2.5 active:cursor-grabbing">
                  <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-60">
                      {meta.label}
                    </p>
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {String(node.data.label ?? meta.label)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    className="rounded p-0.5 text-slate-400 hover:bg-white/80 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
