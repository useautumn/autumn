import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { RunSummary } from "../../../../src/api/contract.ts";
import { Skeleton, Tooltip } from "../../components/ui.tsx";
import { cn, num, sha7, usd } from "../../lib/format.ts";
import { useBaselineRates } from "./baselineStrip.tsx";
import {
	age,
	isFullSuite,
	RESULT_BG,
	type RunResult,
	runDuration,
	runResult,
	scopeLabel,
} from "./runFacts.ts";
import { Sparkline } from "./sparkline.tsx";
import { TintPill } from "./tintPill.tsx";

const BASELINE_BRANCH = "dev";

const RESULT_LABEL: Record<RunResult, { text: string; className: string }> = {
	passed: { text: "✓ Passed", className: "text-green-300" },
	failed: { text: "✕ Failed", className: "text-red-300" },
	cancelled: { text: "⊘ Cancelled", className: "text-neutral-300" },
};

/** The Paper frame's tooltip: near-black in both themes, so it reads as a hint over the grid. */
const DARK_TOOLTIP =
	"border-transparent bg-[#121212] px-2.5 py-2 text-xs leading-[1.45] font-normal text-neutral-300 shadow-[0_6px_20px_rgba(0,0,0,0.18)] dark:bg-[#121212] before:data-[side=top]:border-t-[#121212] before:data-[side=bottom]:border-b-[#121212]";

const baselineNote = (run: RunSummary) =>
	!run.baseline
		? "not a baseline"
		: run.purpose === "baseline"
			? "baseline (scheduled)"
			: "baseline (was dev HEAD)";

const SquareTooltip = ({ run, now }: { run: RunSummary; now: number }) => {
	const result = RESULT_LABEL[runResult(run)];
	return (
		<span className="flex flex-col gap-[3px] tabular-nums">
			<span>
				<span className={cn("font-semibold", result.className)}>
					{result.text}
				</span>{" "}
				· {isFullSuite(run) ? "full suite" : scopeLabel(run)} ·{" "}
				{num(run.fileCount ?? 0)} files
			</span>
			<span>
				<span className="font-mono text-neutral-400">{sha7(run.sha)}</span> ·{" "}
				{baselineNote(run)} · {runDuration(run, now)} · {usd(run.cost.usd)}
			</span>
			{run.failed > 0 && (
				<span className="text-red-300">
					{num(run.failed)} failed
					{run.newFailures !== null &&
						` · ${num(run.newFailures)} new vs previous baseline`}
				</span>
			)}
		</span>
	);
};

/** Equal 10px squares, oldest → newest; colour is the only signal. */
const RunSquares = ({ runs, now }: { runs: RunSummary[]; now: number }) => (
	<div className="flex w-[300px] shrink-0 items-center gap-[3px] @max-[880px]:w-[153px]">
		{[...runs].reverse().map((run) => (
			<Tooltip
				key={run.id}
				className={cn(DARK_TOOLTIP, "max-w-[460px]")}
				content={<SquareTooltip run={run} now={now} />}
			>
				<Link
					to={`/runs/${run.id}`}
					aria-label={`${runResult(run)} run ${sha7(run.sha)}`}
					className={cn(
						"size-2.5 shrink-0 rounded-[2px] outline-none hover:ring-1 hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/60",
						RESULT_BG[runResult(run)],
					)}
				/>
			</Tooltip>
		))}
	</div>
);

const BaselineTrend = () => {
	const { rates, latest } = useBaselineRates();
	const rate = rates.at(-1);
	if (!latest || rate === undefined) return null;
	return (
		<span className="flex shrink-0 items-center gap-2 @max-[600px]:hidden">
			<Sparkline values={rates.slice(-30)} width={120} height={20} />
			<span className="text-xs font-semibold text-green-600 tabular-nums dark:text-green-400">
				{rate.toFixed(1)}%
			</span>
		</span>
	);
};

const BranchRow = ({
	branch,
	runs,
	now,
	onOpenHistory,
}: {
	branch: string;
	runs: RunSummary[];
	now: number;
	onOpenHistory: (branch: string) => void;
}) => {
	const latest = runs[0];
	return (
		<div className="flex h-10 min-w-0 items-center gap-3 border-b border-border/60">
			<button
				type="button"
				onClick={() => onOpenHistory(branch)}
				title={branch}
				className="w-[210px] min-w-0 shrink cursor-pointer truncate text-left text-[12.5px] font-semibold text-foreground outline-none hover:underline focus-visible:underline"
			>
				{branch}
			</button>
			<RunSquares runs={runs} now={now} />
			{branch === BASELINE_BRANCH && <BaselineTrend />}
			<span className="flex-1" />
			{!!latest?.newFailures && (
				<TintPill tone="bad">
					{num(latest.newFailures)} new failure
					{latest.newFailures === 1 ? "" : "s"}
				</TintPill>
			)}
			{latest && (
				<span className="shrink-0 text-[11.5px] text-subtle tabular-nums">
					<span className="@max-[520px]:hidden">{sha7(latest.sha)} · </span>
					{age(latest.finishedAt ?? latest.createdAt, now)}
				</span>
			)}
			<button
				type="button"
				onClick={() => onOpenHistory(branch)}
				aria-label={`Runs on ${branch}`}
				className="shrink-0 cursor-pointer rounded text-subtle outline-none hover:text-foreground focus-visible:text-foreground"
			>
				<ChevronRight className="size-3.5" />
			</button>
		</div>
	);
};

export const ResultLegend = () => (
	<div className="flex items-center gap-2.5 text-[11px] text-tertiary-foreground">
		{(Object.keys(RESULT_BG) as RunResult[]).map((result) => (
			<span key={result} className="flex items-center gap-1">
				<span className={cn("size-2 rounded-[2px]", RESULT_BG[result])} />
				{result}
			</span>
		))}
	</div>
);

/** Calls `onVisible` when scrolled into view (inside any scrolling card). */
export const LoadMoreSentinel = ({
	onVisible,
	loading,
}: {
	onVisible: () => void;
	loading: boolean;
}) => {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => entries.some((e) => e.isIntersecting) && onVisible(),
			{ rootMargin: "200px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [onVisible]);
	return (
		<div ref={ref} className="py-2 text-center text-xs text-subtle">
			{loading ? "Loading more…" : ""}
		</div>
	);
};

export const BranchesView = ({
	branches,
	isLoading,
	now,
	hasMore,
	isFetchingMore,
	loadMore,
	onOpenHistory,
	emptyText,
}: {
	branches: { branch: string; runs: RunSummary[] }[];
	isLoading: boolean;
	now: number;
	hasMore: boolean;
	isFetchingMore: boolean;
	loadMore: () => void;
	onOpenHistory: (branch: string) => void;
	emptyText: string;
}) => {
	if (isLoading)
		return (
			<div className="flex flex-col gap-2">
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-8 w-full" />
				))}
			</div>
		);
	if (branches.length === 0)
		return <p className="py-1 text-xs text-subtle">{emptyText}</p>;
	return (
		<>
			<div className="flex items-center justify-between pb-1">
				<ResultLegend />
				<span className="text-[11px] text-subtle">newest →</span>
			</div>
			{branches.map(({ branch, runs }) => (
				<BranchRow
					key={branch}
					branch={branch}
					runs={runs}
					now={now}
					onOpenHistory={onOpenHistory}
				/>
			))}
			{hasMore && (
				<LoadMoreSentinel onVisible={loadMore} loading={isFetchingMore} />
			)}
		</>
	);
};
