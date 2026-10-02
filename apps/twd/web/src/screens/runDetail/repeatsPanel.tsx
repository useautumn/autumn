import type { RepeatStat } from "../../../../src/api/contract.ts";
import { Panel, SectionTag } from "../../components/ui.tsx";
import { cn, num } from "../../lib/format.ts";

/** Per file X/N first-attempt passes of a repeat run; clicking a file filters the table to its repetitions. */
export const RepeatsPanel = ({
	repeat,
	repeats,
	onOpenFile,
}: {
	repeat: number;
	repeats: RepeatStat[];
	onOpenFile: (file: string) => void;
}) => (
	<section>
		<SectionTag>
			Repeats <span className="text-subtle tabular-nums">×{num(repeat)}</span>
		</SectionTag>
		<Panel className="flex flex-col divide-y">
			{repeats.map((r) => (
				<button
					key={r.file}
					type="button"
					onClick={() => onOpenFile(r.file)}
					className="flex cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-muted"
				>
					<span className="min-w-0 flex-1 truncate text-tiny-id text-foreground">
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
							"text-sm font-medium tabular-nums",
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
		</Panel>
		<p className="mt-1.5 text-xs text-subtle">
			First-attempt passes. A pass on retry still counts as a flake.
		</p>
	</section>
);
