import { Badge } from "@/components/ui/badge";

export const HookStatePanel = ({
  isLoading,
  error,
  lastUpdatedAt,
}: {
  isLoading: boolean;
  error: unknown;
  lastUpdatedAt: string | null;
}) => {
  return (
    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-zinc-500">Loading</p>
        <Badge variant={isLoading ? "wip" : "ready"}>
          {isLoading ? "true" : "false"}
        </Badge>
      </div>
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-zinc-500">Error</p>
        <Badge variant={error ? "wip" : "ready"}>
          {error ? "present" : "none"}
        </Badge>
      </div>
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-zinc-500">Last Updated</p>
        <p className="text-zinc-900 dark:text-zinc-100">
          {lastUpdatedAt || "n/a"}
        </p>
      </div>
    </div>
  );
};
