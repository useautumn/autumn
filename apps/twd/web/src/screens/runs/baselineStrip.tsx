import { useRunStats, useRuns } from "../../api/hooks.ts";
import { Tooltip } from "../../components/ui.tsx";
import { num, sha7, timeAgo, usd } from "../../lib/format.ts";
import { passRate, startOfToday } from "./runFacts.ts";
import { Sparkline } from "./sparkline.tsx";

const BASELINE_HISTORY = 30;

/** Finished, non-cancelled baseline runs, oldest first, with their pass rate. */
export const useBaselineRates = () => {
	const query = useRuns({
		status: "finished",
		baseline: true,
		limit: BASELINE_HISTORY,
	});
	const runs = (query.data?.runs ?? [])
		.filter((run) => run.status !== "cancelled" && run.fileCount)
		.reverse();
	return {
		runs,
		rates: runs.map((run) => passRate(run) ?? 0),
		latest: runs.at(-1),
	};
};

const Dot = () => <span className="text-subtle/70">·</span>;

/** "dev baseline 99.7% ⌇ · Failing 11 · Today 14 runs · $41.20" beside the page title. */
export const BaselineStrip = ({ now }: { now: number }) => {
	const { rates, latest } = useBaselineRates();
	const today = useRunStats(startOfToday(now)).data;
	const rate = latest && passRate(latest);
	return (
		<div className="flex min-w-0 items-center gap-2.5 text-xs font-normal text-tertiary-foreground tabular-nums max-md:hidden">
			<Tooltip
				content={
					latest ? (
						<span>
							Latest baseline {sha7(latest.sha)} · {num(latest.passed)} /{" "}
							{num(latest.fileCount ?? 0)} files passed ·{" "}
							{timeAgo(latest.finishedAt, now)}
							<span className="block text-subtle">
								Last {rates.length} baselines
							</span>
						</span>
					) : (
						"No finished baseline yet"
					)
				}
			>
				<span className="flex items-center gap-1.5">
					dev baseline
					<span className="text-[13px] font-semibold text-foreground">
						{rate === null || rate === undefined ? "—" : `${rate.toFixed(1)}%`}
					</span>
					<Sparkline values={rates.slice(-25)} width={110} height={20} />
				</span>
			</Tooltip>
			<Dot />
			<span className="flex items-center gap-1.5">
				Failing
				<span
					className={
						latest?.failed
							? "text-[13px] font-semibold text-red-600 dark:text-red-400"
							: "text-[13px] font-semibold text-foreground"
					}
				>
					{latest ? num(latest.failed) : "—"}
				</span>
			</span>
			<Dot />
			<span className="flex items-center gap-1.5">
				Today
				<span className="text-[13px] font-semibold text-foreground">
					{today
						? `${num(today.runs)} run${today.runs === 1 ? "" : "s"} · ${usd(today.usd)}`
						: "—"}
				</span>
			</span>
		</div>
	);
};
