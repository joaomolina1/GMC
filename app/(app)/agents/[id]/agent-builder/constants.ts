import {
  Search,
  FileText,
  Eye,
  Library,
  Globe,
  Code,
  FileOutput,
  Sparkles,
  Settings2,
  Wrench,
  Package,
  Plug,
  History,
  type LucideIcon,
} from "lucide-react";
import { TOOL_CREATE_DOCUMENTS } from "@lib/agents/agent-tools";

export type BuilderTab =
  | "instructions"
  | "general"
  | "knowledge"
  | "tools"
  | "skills"
  | "connectors"
  | "versions";

export const BUILDER_TABS: { id: BuilderTab; label: string; icon: LucideIcon }[] = [
  { id: "instructions", label: "Instruções", icon: Sparkles },
  { id: "general", label: "Definições", icon: Settings2 },
  { id: "knowledge", label: "Knowledge", icon: Library },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: Package },
  { id: "connectors", label: "Conectores", icon: Plug },
  { id: "versions", label: "Versões", icon: History },
];

export const TAB_INTRO: Record<BuilderTab, { title: string; desc: string }> = {
  instructions: {
    title: "Instruções",
    desc: "Modelo, esforço e o system prompt que define o comportamento do agente.",
  },
  general: {
    title: "Definições",
    desc: "Nome, descrição, visibilidade e categoria no marketplace.",
  },
  knowledge: {
    title: "Knowledge",
    desc: "Documentos indexados para pesquisa semântica (RAG).",
  },
  tools: {
    title: "Tools",
    desc: "Capacidades técnicas — web search, documentos, visão e plugins.",
  },
  skills: {
    title: "Skills",
    desc: "Pacotes de skills no formato Claude (SKILL.md + ficheiros).",
  },
  connectors: {
    title: "Conectores",
    desc: "Servidores MCP externos ligados via API Anthropic.",
  },
  versions: {
    title: "Versões",
    desc: "Histórico de versões guardadas e publicação.",
  },
};

export const TOOL_META: Record<string, { label: string; desc: string; icon: LucideIcon; tone: string }> = {
  web_search: {
    label: "Web Search",
    desc: "Pesquisa web nativa da API Anthropic (server-side, incluída na conta)",
    icon: Search,
    tone: "bg-sky-50 text-sky-600",
  },
  read_document: {
    label: "Read Document",
    desc: "PDF, Word, Excel, PowerPoint, CSV + OCR em imagens",
    icon: FileText,
    tone: "bg-rose-50 text-rose-600",
  },
  vision: {
    label: "Vision",
    desc: "Análise multimodal de imagens (requer ANTHROPIC_API_KEY)",
    icon: Eye,
    tone: "bg-violet-50 text-violet-600",
  },
  knowledge_search: {
    label: "Knowledge Search",
    desc: "RAG no Knowledge do agente (melhor com VOYAGE_API_KEY)",
    icon: Library,
    tone: "bg-emerald-50 text-emerald-600",
  },
  [TOOL_CREATE_DOCUMENTS]: {
    label: "Criar documentos",
    desc: "PowerPoint, Excel, Word e PDF via skills nativas Anthropic (API)",
    icon: FileOutput,
    tone: "bg-amber-50 text-amber-700",
  },
};

export const CORE_TOOLS = [
  "web_search",
  TOOL_CREATE_DOCUMENTS,
  "read_document",
  "vision",
  "knowledge_search",
];

export const PLUGIN_TOOLS = ["http_request", "fetch_url"];

export const PLUGIN_TOOL_META: Record<
  string,
  { label: string; desc: string; icon: LucideIcon; tone: string }
> = {
  http_request: {
    label: "HTTP Request",
    desc: "Chamadas REST a APIs externas (loop agêntico)",
    icon: Globe,
    tone: "bg-indigo-50 text-indigo-600",
  },
  fetch_url: {
    label: "Fetch URL",
    desc: "Extrai texto de páginas web públicas",
    icon: Globe,
    tone: "bg-sky-50 text-sky-600",
  },
  run_code: {
    label: "Run Code",
    desc: "JavaScript sandboxed para cálculos",
    icon: Code,
    tone: "bg-orange-50 text-orange-600",
  },
};

export const DEFAULT_TOOL_CONFIGS: Record<string, Record<string, unknown>> = {
  http_request: { allowed_hosts: ["*.mediacapital.pt"], timeout_ms: 10000 },
  run_code: { timeout_ms: 5000 },
};

export const DOC_TONE: Record<string, "success" | "warning" | "danger"> = {
  ready: "success",
  error: "danger",
};
