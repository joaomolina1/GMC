"use client";

import { Download, FileText } from "lucide-react";
import { formatBytes } from "@lib/utils";

export interface GeneratedFileView {
  filename: string;
  mime: string;
  size?: number;
  storage_path: string;
  download_url: string;
}

export function GeneratedFilesList({ files }: { files: GeneratedFileView[] }) {
  if (!files.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {files.map((file) => (
        <a
          key={file.storage_path}
          href={file.download_url}
          download={file.filename}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-900 transition-colors hover:bg-emerald-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
            <FileText size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{file.filename}</span>
            {file.size != null && (
              <span className="text-xs text-emerald-700/80">{formatBytes(file.size)}</span>
            )}
          </span>
          <Download size={16} className="shrink-0 text-emerald-700" />
        </a>
      ))}
    </div>
  );
}
