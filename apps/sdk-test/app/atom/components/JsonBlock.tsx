import { toPrettyJson } from "@/lib/utils";

export const JsonBlock = ({ title, value }: { title: string; value: unknown }) => (
  <div className="min-w-0">
    <p className="mb-1 text-[11px] text-tertiary-foreground">{title}</p>
    <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-2 font-mono text-[11px] leading-relaxed text-foreground">
      {toPrettyJson({ value })}
    </pre>
  </div>
);
