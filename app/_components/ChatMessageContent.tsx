"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@lib/utils";

interface ChatMessageContentProps {
  content: string;
  role: "user" | "assistant";
  className?: string;
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "tool"; label: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      i++;
      continue;
    }

    const toolMatch = line.match(/^[🔧🔍]\s*\*A (?:usar skill|pesquisar)[^*]*\*/);
    if (toolMatch) {
      blocks.push({ type: "tool", label: line.replace(/\*/g, "").trim() });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].match(/^[🔧🔍]\s*\*/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

function renderInline(text: string, role: "user" | "assistant") {
  const parts: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[0.85em]",
            role === "user" ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-800"
          )}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "underline underline-offset-2",
              role === "user" ? "text-white/90" : "text-brand-600 hover:text-brand-700"
            )}
          >
            {linkMatch[1]}
          </a>
        );
      }
    } else if (token.startsWith("http")) {
      parts.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "break-all underline underline-offset-2",
            role === "user" ? "text-white/90" : "text-brand-600 hover:text-brand-700"
          )}
        >
          {token}
        </a>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length > 0 ? parts : text;
}

export function ChatMessageContent({ content, role, className }: ChatMessageContentProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  if (!content.trim()) return null;

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <pre
              key={idx}
              className="overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100"
            >
              {block.language && (
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {block.language}
                </div>
              )}
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === "tool") {
          return (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
            >
              {block.label}
            </div>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={idx}
              className={cn(
                "space-y-1 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
                role === "user" ? "text-white" : "text-slate-800"
              )}
            >
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item, role)}</li>
              ))}
            </Tag>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInline(block.text, role)}
          </p>
        );
      })}
    </div>
  );
}
