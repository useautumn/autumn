"use client";

import { useMemo, useState } from "react";
import { cn, toPrettyJson } from "@/lib/utils";

type DataViewerProps = {
  title: string;
  value: unknown;
  defaultExpandedDepth?: number;
  maxHeight?: number;
};

const highlightJson = (json: string | undefined): React.ReactNode[] => {
  if (!json) return [];

  const parts: React.ReactNode[] = [];
  let i = 0;

  const regex =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(json);

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={i++} className="text-zinc-500">
          {json.slice(lastIndex, match.index)}
        </span>,
      );
    }

    if (match[1]) {
      // Key
      parts.push(
        <span key={i++} className="text-zinc-600 dark:text-zinc-400">
          {match[1]}
        </span>,
      );
      parts.push(
        <span key={i++} className="text-zinc-500">
          :
        </span>,
      );
    } else if (match[2]) {
      // String value
      parts.push(
        <span key={i++} className="text-emerald-600 dark:text-emerald-400">
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // Number
      parts.push(
        <span key={i++} className="text-blue-600 dark:text-blue-400">
          {match[3]}
        </span>,
      );
    } else if (match[4]) {
      // Boolean
      parts.push(
        <span key={i++} className="text-amber-600 dark:text-amber-400">
          {match[4]}
        </span>,
      );
    } else if (match[5]) {
      // Null
      parts.push(
        <span key={i++} className="text-zinc-500">
          {match[5]}
        </span>,
      );
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(json);
  }

  if (lastIndex < json.length) {
    parts.push(
      <span key={i++} className="text-zinc-500">
        {json.slice(lastIndex)}
      </span>,
    );
  }

  return parts;
};

const renderPrimitive = ({ value }: { value: unknown }) => {
  if (value === null) return <span className="text-zinc-500">null</span>;
  if (value === undefined)
    return <span className="text-zinc-500">undefined</span>;
  if (typeof value === "string")
    return <span className="text-zinc-800 dark:text-zinc-200">"{value}"</span>;
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <span className="text-zinc-900 dark:text-zinc-100">{String(value)}</span>
    );
  }

  return (
    <span className="text-zinc-700 dark:text-zinc-300">{String(value)}</span>
  );
};

const JsonNode = ({
  name,
  value,
  depth,
  defaultExpandedDepth,
}: {
  name: string;
  value: unknown;
  depth: number;
  defaultExpandedDepth: number;
}) => {
  if (value === null || typeof value !== "object") {
    return (
      <div className="py-0.5">
        <span className="text-zinc-500">{name}: </span>
        {renderPrimitive({ value })}
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <details className="group py-0.5" open={depth < defaultExpandedDepth}>
      <summary className="cursor-pointer select-none list-none text-zinc-700 marker:content-none dark:text-zinc-300">
        <span className="text-zinc-500">{name}</span>
        <span className="ml-1 text-zinc-400">
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </summary>
      <div className="ml-4 border-l border-zinc-200 pl-3 dark:border-zinc-800">
        {entries.length === 0 ? (
          <div className="py-0.5 text-zinc-500">empty</div>
        ) : (
          entries.map(([key, nextValue]) => (
            <JsonNode
              key={`${name}.${key}`}
              name={key}
              value={nextValue}
              depth={depth + 1}
              defaultExpandedDepth={defaultExpandedDepth}
            />
          ))
        )}
      </div>
    </details>
  );
};

export const DataViewer = ({
  title,
  value,
  defaultExpandedDepth = 2,
  maxHeight = 420,
}: DataViewerProps) => {
  const [viewMode, setViewMode] = useState<"tree" | "raw">("raw");
  const [copied, setCopied] = useState(false);
  const prettyJson = useMemo(() => toPrettyJson({ value }), [value]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(prettyJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          {title}
        </p>
        <div className="flex items-center gap-0.5">
          <div className="flex rounded border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium",
                viewMode === "tree"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
              )}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium",
                viewMode === "raw"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
              )}
            >
              Raw
            </button>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "border-zinc-200 text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100",
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "overflow-auto bg-white p-3 font-mono text-xs leading-5 dark:bg-zinc-950",
        )}
        style={{ maxHeight }}
      >
        {viewMode === "tree" ? (
          <JsonNode
            name="root"
            value={value}
            depth={0}
            defaultExpandedDepth={defaultExpandedDepth}
          />
        ) : (
          <pre className="whitespace-pre-wrap">{highlightJson(prettyJson)}</pre>
        )}
      </div>
    </div>
  );
};
