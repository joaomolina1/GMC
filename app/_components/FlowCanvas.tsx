"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, Trash2, Link2 } from "lucide-react";
import { cn } from "@lib/utils";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from "@lib/flows/types";

interface FlowCanvasProps {
  graph: FlowGraph;
  onChange: (graph: FlowGraph) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

const NODE_W = 160;
const NODE_H = 72;

function edgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number
): string {
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}

export function FlowCanvas({
  graph,
  onChange,
  selectedNodeId,
  onSelectNode,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
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
      position: { x: 120 + graph.nodes.length * 40, y: 80 + graph.nodes.length * 30 },
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

  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const exists = graph.edges.some((e) => e.source === source && e.target === target);
    if (exists) return;
    const sourceNode = graph.nodes.find((n) => n.id === source);
    const edge: FlowEdge = {
      id: `e-${source}-${target}`,
      source,
      target,
      ...(sourceNode?.type === "condition"
        ? {
            data: {
              branch: graph.edges.filter((e) => e.source === source).length === 0
                ? "true"
                : "false",
            },
          }
        : {}),
    };
    onChange({ ...graph, edges: [...graph.edges, edge] });
  };

  const handleNodeClick = (nodeId: string) => {
    if (connectFrom) {
      addEdge(connectFrom, nodeId);
      setConnectFrom(null);
      return;
    }
    onSelectNode(nodeId);
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragging.offsetX;
      const y = e.clientY - rect.top - dragging.offsetY;
      onChange({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === dragging.nodeId
            ? { ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } }
            : n
        ),
      });
    },
    [dragging, graph, onChange]
  );

  const onMouseUp = () => setDragging(null);

  return (
    <div className="flex h-full min-h-[480px] flex-col rounded-2xl border border-line bg-slate-50/50">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Adicionar nó
        </span>
        {FLOW_NODE_TYPES.map((meta) => (
          <button
            key={meta.type}
            type="button"
            onClick={() => addNode(meta.type)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50"
          >
            <Plus size={12} />
            {meta.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setConnectFrom(connectFrom ? null : selectedNodeId)}
          disabled={!selectedNodeId && !connectFrom}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
            connectFrom
              ? "bg-brand-500 text-white"
              : "border border-line bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          <Link2 size={12} />
          {connectFrom ? "Clique no destino..." : "Ligar nós"}
        </button>
      </div>

      <div
        ref={canvasRef}
        className="relative flex-1 overflow-auto"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full min-h-[480px] min-w-[800px]">
          {graph.edges.map((edge) => {
            const source = graph.nodes.find((n) => n.id === edge.source);
            const target = graph.nodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            const sx = source.position.x + NODE_W;
            const sy = source.position.y + NODE_H / 2;
            const tx = target.position.x;
            const ty = target.position.y + NODE_H / 2;
            return (
              <g key={edge.id}>
                <path
                  d={edgePath(sx, sy, tx, ty)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                />
                {edge.data?.branch && (
                  <text
                    x={(sx + tx) / 2}
                    y={(sy + ty) / 2 - 6}
                    textAnchor="middle"
                    className="fill-amber-600 text-[10px] font-medium"
                  >
                    {edge.data.branch}
                  </text>
                )}
              </g>
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        <div className="relative min-h-[480px] min-w-[800px]">
          {graph.nodes.map((node) => {
            const meta = nodeMeta(node.type);
            const selected = selectedNodeId === node.id;
            return (
              <div
                key={node.id}
                className={cn(
                  "absolute cursor-pointer rounded-xl border-2 bg-white p-3 shadow-sm transition-shadow",
                  meta.tone,
                  selected && "ring-2 ring-brand-400 ring-offset-2"
                )}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                }}
                onClick={() => handleNodeClick(node.id)}
                onMouseDown={(e) => {
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
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {meta.label}
                    </p>
                    <p className="truncate text-sm font-medium">
                      {String(node.data.label ?? meta.label)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    className="rounded p-0.5 opacity-50 hover:bg-white/60 hover:opacity-100"
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
