import type { WorkerState } from "../../../../src/api/contract.ts";
import { summariseBoot } from "../../../../src/internal/runs/boot/summariseBoot.ts";
import { Panel, SectionTag } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";

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

/** Where worker boot time goes: per-step p50/p90/max across workers, plus the slowest workers. */
export const BootBreakdown = ({
	workers,
	onOpenWorker,
}: {
	workers: WorkerState[];
	onOpenWorker: (name: string) => void;
}) => {
	const summary = summariseBoot(workers);
	if (!summary) return null;
	const rows = summary.steps.map((r, i) => ({
		...r,
		color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
	}));
	const totals = summary.total;
	const medianSum = rows.reduce((sum, r) => sum + r.p50, 0) || 1;
	const maxP90 = Math.max(...rows.map((r) => r.p90), 1);

	return (
		<section>
			<SectionTag>
				Boot{" "}
				<span className="text-subtle tabular-nums">
					{num(summary.measured)} measured
				</span>
			</SectionTag>
			<Panel className="flex flex-col gap-3 p-3">
				<div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-tertiary-foreground">
					<span>
						Account → serving p50{" "}
						<span className="text-foreground tabular-nums">
							{formatMs(totals.p50)}
						</span>
					</span>
					<span>
						p90{" "}
						<span className="text-foreground tabular-nums">
							{formatMs(totals.p90)}
						</span>
					</span>
					<span>
						max{" "}
						<span className="text-foreground tabular-nums">
							{formatMs(totals.max)}
						</span>
					</span>
				</div>

				<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
					{rows.map((r) => (
						<div
							key={r.step}
							title={`${r.step} · p50 ${formatMs(r.p50)}`}
							className={cn("h-full", r.color)}
							style={{ width: `${(r.p50 / medianSum) * 100}%` }}
						/>
					))}
				</div>

				<table className="w-full text-xs">
					<thead className="text-subtle">
						<tr>
							<th className="py-1 text-left font-normal">Step</th>
							<th className="w-16 text-right font-normal">p50</th>
							<th className="w-16 text-right font-normal">p90</th>
							<th className="w-16 text-right font-normal">max</th>
							<th className="w-2/5 pl-4" />
						</tr>
					</thead>
					<tbody className="tabular-nums">
						{rows.map((r) => (
							<tr key={r.step} className="h-6">
								<td className="flex h-6 items-center gap-2 text-foreground">
									<span className={cn("size-2 shrink-0 rounded-sm", r.color)} />
									{r.step}
								</td>
								<td className="text-right">{formatMs(r.p50)}</td>
								<td className="text-right">{formatMs(r.p90)}</td>
								<td className="text-right text-subtle">{formatMs(r.max)}</td>
								<td className="pl-4">
									<div className="relative h-1.5 rounded-full bg-muted">
										<div
											className={cn(
												"absolute inset-y-0 left-0 rounded-full opacity-40",
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

				<div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
					Slowest:
					{summary.slowest.map((w) => (
						<button
							key={w.worker}
							type="button"
							onClick={() => onOpenWorker(w.worker)}
							className="cursor-pointer rounded-md bg-muted px-1.5 py-0.5 text-tiny-id text-foreground hover:bg-interactive-secondary-hover"
						>
							{w.worker.split("-").at(-1)} · {formatMs(w.totalMs)}
						</button>
					))}
				</div>
			</Panel>
		</section>
	);
};
