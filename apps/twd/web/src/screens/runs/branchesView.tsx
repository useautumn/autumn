import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { RunSummary } from "../../../../src/api/contract.ts";
import { Pill } from "../../components/status.tsx";
import { Skeleton, Tooltip } from "../../components/ui.tsx";
import { cn, num, sha7, usd } from "../../lib/format.ts";
import { useBaselineRates } from "./baselineStrip.tsx";
import {
	age,
	RESULT_BG,
	type RunResult,
	runDuration,
	runResult,
	scopeLabel,
} from "./runFacts.ts";
import { Sparkline } from "./sparkline.tsx";

const BASELINE_BRANCH = "dev";

const RESULT_LABEL: Record<RunResult, { text: string; className: string }> = {
	passed: { text: "✓ Passed", className: "text-green-600 dark:text-green-400" },
	failed: { text: "✕ Failed", className: "text-red-600 dark:text-red-400" },
	cancelled: { text: "⊘ Cancelled", className: "text-tertiary-foreground" },
};

const baselineNote = (run: RunSummary) =>
	!run.baseline
		? "not a baseline"
		: run.purpose === "baseline"
			? "baseline (scheduled)"
			: "baseline (was dev HEAD)";

const SquareTooltip = ({ run, now }: { run: RunSummary; now: number }) => {
	const result = RESULT_LABEL[runResult(run)];
	return (
		<span className="flex flex-col gap-0.5 tabular-nums">
			<span>
				<span className={cn("font-semibold", result.className)}>
					{result.text}
				</span>{" "}
				· {scopeLabel(run)} · {num(run.fileCount ?? 0)} files
			</span>
			<span className="text-tertiary-foreground">
				<span className="font-mono">{sha7(run.sha)}</span> · {baselineNote(run)}{" "}
				· {runDuration(run, now)} · {usd(run.cost.usd)}
			</span>
			{run.failed > 0 && (
				<span className="text-red-600 dark:text-red-400">
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
	<div className="flex w-[176px] shrink-0 items-center gap-[3px]">
		{[...runs].reverse().map((run) => (
			<Tooltip key={run.id} content={<SquareTooltip run={run} now={now} />}>
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
		<span className="flex shrink-0 items-center gap-2">
			<Sparkline
				values={rates}
				width={120}
				height={20}
				className="@max-[700px]:w-16"
			/>
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
		<div className="flex h-10 min-w-0 items-center gap-3 border-b border-border/60 @max-[700px]:gap-2.5">
			<button
				type="button"
				onClick={() => onOpenHistory(branch)}
				title={branch}
				className="w-[210px] shrink-0 cursor-pointer truncate text-left text-[12.5px] font-semibold text-foreground outline-none hover:underline focus-visible:underline @max-[700px]:w-[140px]"
			>
				{branch}
			</button>
			<RunSquares runs={runs} now={now} />
			{branch === BASELINE_BRANCH && <BaselineTrend />}
			<span className="flex-1" />
			{!!latest?.newFailures && (
				<Pill tone="bad" className="shrink-0 tabular-nums">
					{num(latest.newFailures)} new failure
					{latest.newFailures === 1 ? "" : "s"}
				</Pill>
			)}
			{latest && (
				<span className="shrink-0 text-[11.5px] text-subtle tabular-nums">
					<span className="font-mono">{sha7(latest.sha)}</span> ·{" "}
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
