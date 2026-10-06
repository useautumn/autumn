import type { RepeatStat } from "../../../../src/api/contract.ts";
import { cn, num } from "../../lib/format.ts";

/** Per file X/N first-attempt passes of a repeat run; clicking a file filters the table to its repetitions. */
export const RepeatsPanel = ({
	repeats,
	onOpenFile,
}: {
	repeats: RepeatStat[];
	onOpenFile: (file: string) => void;
}) => (
	<div className="flex flex-col">
		<p className="pb-1.5 text-[11px] text-subtle">
			First-attempt passes. A pass on retry still counts as a flake.
		</p>
		{repeats.map((r) => (
			<button
				key={r.file}
				type="button"
				onClick={() => onOpenFile(r.file)}
				className="flex h-[30px] shrink-0 cursor-pointer items-center gap-3 border-b border-table-row-divider text-left outline-none hover:bg-muted/60 focus-visible:bg-muted"
			>
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
					{r.file}
				</span>
				{r.passedOnRetry > 0 && (
					<span className="text-xs text-orange-600 tabular-nums dark:text-orange-400">
						+{num(r.passedOnRetry)} on retry
					</span>
				)}
				{r.done < r.total && (
					<span className="text-xs text-subtle tabular-nums">
						{num(r.done)}/{num(r.total)} done
					</span>
				)}
				<span
					className={cn(
						"text-xs font-medium tabular-nums",
						r.firstAttemptPassed === r.total
							? "text-green-600 dark:text-green-500"
							: r.done > r.firstAttemptPassed
								? "text-red-600 dark:text-red-400"
								: "text-foreground",
					)}
				>
					passed {num(r.firstAttemptPassed)}/{num(r.total)}
				</span>
			</button>
		))}
	</div>
);
