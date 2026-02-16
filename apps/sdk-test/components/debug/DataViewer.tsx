"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn, toPrettyJson } from "@/lib/utils";

type DataViewerProps = {
  title: string;
  value: unknown;
  defaultExpandedDepth?: number;
  maxHeight?: number;
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
  const prettyJson = useMemo(() => toPrettyJson({ value }), [value]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(prettyJson);
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          {title}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="h-7 px-2 text-[11px]"
        >
          Copy JSON
        </Button>
      </div>
      <div
        className={cn(
          "overflow-auto bg-white p-3 font-mono text-xs leading-5 dark:bg-zinc-950",
        )}
        style={{ maxHeight }}
      >
        <JsonNode
          name="root"
          value={value}
          depth={0}
          defaultExpandedDepth={defaultExpandedDepth}
        />
      </div>
    </div>
  );
};
