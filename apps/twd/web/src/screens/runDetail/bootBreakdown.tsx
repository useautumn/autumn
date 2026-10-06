import type { WorkerState } from "../../../../src/api/contract.ts";
import { summariseBoot } from "../../../../src/internal/runs/boot/summariseBoot.ts";
import { cn, formatMs, num } from "../../lib/format.ts";
import { shortWorker } from "./runFiles.ts";
import { SheetSection } from "./runTiming.tsx";

const SEGMENT_COLORS = [
	"bg-sky-500",
	"bg-violet-500",
	"bg-amber-500",
	"bg-emerald-500",
	"bg-rose-500",
	"bg-cyan-500",
	"bg-fuchsia-500",
	"bg-lime-500",
	"bg-orange-500",
	"bg-indigo-500",
	"bg-teal-500",
	"bg-pink-500",
];

/** Where worker boot time goes (account → serving): per-step p50/p90/max, plus the slowest workers. */
export const BootBreakdown = ({
	workers,
	onOpenWorker,
}: {
	workers: WorkerState[];
	onOpenWorker: (name: string) => void;
}) => {
	const summary = summariseBoot(workers);
	if (!summary)
		return (
			<SheetSection title="Worker boot">
				<p className="text-xs text-subtle">
					No worker has finished booting yet.
				</p>
			</SheetSection>
		);
	const rows = summary.steps.map((r, i) => ({
		...r,
		color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
	}));
	const { total } = summary;
	const maxP90 = Math.max(...rows.map((r) => r.p90), 1);

	return (
		<SheetSection
			title={`Worker boot · ${num(summary.measured)} measured`}
			right={`p50 ${formatMs(total.p50)} · p90 ${formatMs(total.p90)} · max ${formatMs(total.max)}`}
		>
			<table className="w-full table-fixed text-xs">
				<thead className="text-[11px] text-tertiary-foreground">
					<tr>
						<th className="py-1 text-left font-medium">Step</th>
						<th className="w-12 text-right font-medium">p50</th>
						<th className="w-12 text-right font-medium">p90</th>
						<th className="w-12 text-right font-medium">max</th>
						<th className="w-[24%] pl-4" />
					</tr>
				</thead>
				<tbody className="tabular-nums">
					{rows.map((r) => (
						<tr key={r.step} className="h-[22px]">
							<td className="truncate text-muted-foreground">
								<span
									className={cn(
										"mr-2 inline-block size-[7px] rounded-[2px] align-middle",
										r.color,
									)}
								/>
								{r.step}
							</td>
							<td className="text-right font-semibold text-foreground">
								{formatMs(r.p50)}
							</td>
							<td className="text-right text-muted-foreground">
								{formatMs(r.p90)}
							</td>
							<td className="text-right text-subtle">{formatMs(r.max)}</td>
							<td className="pl-4">
								<div className="relative h-[5px] rounded-full bg-muted">
									<div
										className={cn(
											"absolute inset-y-0 left-0 rounded-full opacity-35",
											r.color,
										)}
										style={{ width: `${(r.p90 / maxP90) * 100}%` }}
									/>
									<div
										className={cn(
											"absolute inset-y-0 left-0 rounded-full",
											r.color,
										)}
										style={{ width: `${(r.p50 / maxP90) * 100}%` }}
									/>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-subtle">
				Slowest:
				{summary.slowest.map((w) => (
					<button
						key={w.worker}
						type="button"
						onClick={() => onOpenWorker(w.worker)}
						className="cursor-pointer rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none hover:bg-interactive-secondary-hover focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						{shortWorker(w.worker)} · {formatMs(w.totalMs)}
					</button>
				))}
			</div>
		</SheetSection>
	);
};
