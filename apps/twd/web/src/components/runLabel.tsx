import type { RunSummary } from "../../../src/api/contract.ts";
import { cn, sha7 } from "../lib/format.ts";
import { Tooltip } from "./ui.tsx";

/** Branch runs read as the branch (sha secondary); pinned runs read as the commit "on <branch>". */
export const RunLabel = ({
	run,
	className,
	primaryClassName = "font-medium text-foreground",
	showSha = true,
}: {
	run: Pick<RunSummary, "branch" | "sha" | "pinnedSha">;
	className?: string;
	primaryClassName?: string;
	/** Off where the sha is already shown nearby (run header). */
	showSha?: boolean;
}) => {
	if (run.pinnedSha)
		return (
			<span
				className={cn("flex min-w-0 items-baseline gap-1.5", className)}
				title={`${run.sha} on ${run.branch}`}
			>
				<span className={cn("shrink-0 font-mono", primaryClassName)}>
					{sha7(run.sha)}
				</span>
				<span className="min-w-0 truncate text-xs font-normal text-subtle">
					on {run.branch}
				</span>
			</span>
		);
	const branch = (
		<Tooltip content={run.branch}>
			<span
				className={cn(
					"block max-w-80 shrink-0 truncate",
					primaryClassName,
					!showSha && className,
				)}
			>
				{run.branch}
			</span>
		</Tooltip>
	);
	if (!showSha) return branch;
	// The sha wraps onto a clipped second line when the branch needs the room.
	return (
		<span
			className={cn(
				"flex h-[1lh] min-w-0 flex-wrap items-baseline gap-x-2 overflow-hidden",
				className,
			)}
		>
			{branch}
			<span className="shrink-0 text-tiny-id font-normal text-subtle">
				{sha7(run.sha)}
			</span>
		</span>
	);
};
