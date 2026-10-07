import { Link } from "react-router-dom";
import type { RunSummary } from "../../../../src/api/contract.ts";
import { Skeleton, Tooltip } from "../../components/ui.tsx";
import { cn, handle, isAgentVia, num, sha7, usd } from "../../lib/format.ts";
import { LoadMoreSentinel } from "./branchesView.tsx";
import {
	age,
	dayLabel,
	RESULT_BG,
	runDuration,
	runResult,
	scopeLabel,
} from "./runFacts.ts";
import { TintPill } from "./tintPill.tsx";

const Avatar = ({ actor }: { actor: RunSummary["createdBy"] }) => (
	<Tooltip content={`${actor.email} · ${actor.via}`}>
		<span
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold uppercase",
				isAgentVia(actor.via)
					? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
					: "bg-muted text-muted-foreground",
			)}
		>
			{handle(actor.email).slice(0, 1)}
		</span>
	</Tooltip>
);

const FeedRow = ({ run, now }: { run: RunSummary; now: number }) => (
	<Link
		to={`/runs/${run.id}`}
		className="flex h-8 min-w-0 items-center gap-2 border-b border-border/60 text-xs outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
	>
		<span
			role="img"
			aria-label={runResult(run)}
			className={cn("size-2 shrink-0 rounded-full", RESULT_BG[runResult(run)])}
		/>
		<span
			title={run.branch}
			className="w-[200px] min-w-[72px] shrink truncate text-[12.5px] font-medium text-foreground @max-[760px]:w-[140px] @max-[560px]:w-auto @max-[560px]:flex-1"
		>
			{run.branch}
		</span>
		<span className="w-[60px] shrink-0 font-mono text-[11px] text-subtle @max-[560px]:hidden">
			{sha7(run.sha)}
		</span>
		{run.baseline && (
			<TintPill tone="info" className="@max-[560px]:hidden">
				baseline
			</TintPill>
		)}
		<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary-foreground @max-[560px]:hidden">
			{scopeLabel(run)}
		</span>
		<span className="hidden flex-1 @max-[560px]:block" />
		{!!run.newFailures && (
			<TintPill tone="bad">
				{num(run.newFailures)} new
				<span className="@max-[560px]:hidden">
					failure{run.newFailures === 1 ? "" : "s"}
				</span>
			</TintPill>
		)}
		<span className="min-w-[84px] shrink-0 text-right font-medium whitespace-nowrap text-muted-foreground tabular-nums @max-[700px]:w-auto">
			{num(run.passed)}
			{run.failed > 0 && (
				<span className="text-red-600 dark:text-red-400">
					{" "}
					· {num(run.failed)}
				</span>
			)}
			<span className="font-normal text-subtle">
				/{num(run.fileCount ?? 0)}
			</span>
		</span>
		<span className="w-[56px] shrink-0 whitespace-nowrap text-tertiary-foreground tabular-nums @max-[760px]:hidden">
			{runDuration(run, now)}
		</span>
		<span className="w-[52px] shrink-0 font-medium text-foreground tabular-nums @max-[480px]:hidden">
			{usd(run.cost.usd)}
		</span>
		<span className="shrink-0 @max-[700px]:hidden">
			<Avatar actor={run.createdBy} />
		</span>
		<span className="w-[30px] shrink-0 text-right text-[11.5px] text-subtle tabular-nums">
			{age(run.createdAt, now)}
		</span>
	</Link>
);

const groupByDay = (runs: RunSummary[], now: number) => {
	const days: { label: string; runs: RunSummary[] }[] = [];
	for (const run of runs) {
		const label = dayLabel(run.createdAt, now);
		const last = days.at(-1);
		if (last?.label === label) last.runs.push(run);
		else days.push({ label, runs: [run] });
	}
	return days;
};

export const RunsFeed = ({
	runs,
	isLoading,
	now,
	hasMore,
	isFetchingMore,
	loadMore,
	emptyText,
}: {
	runs: RunSummary[];
	isLoading: boolean;
	now: number;
	hasMore: boolean;
	isFetchingMore: boolean;
	loadMore: () => void;
	emptyText: string;
}) => {
	if (isLoading)
		return (
			<div className="flex flex-col gap-2">
				{[0, 1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-7 w-full" />
				))}
			</div>
		);
	if (runs.length === 0)
		return <p className="py-1 text-xs text-subtle">{emptyText}</p>;
	return (
		<>
			{groupByDay(runs, now).map((day) => (
				<section key={day.label}>
					<h3 className="flex items-center gap-1.5 pt-3 pb-1 text-[11px] first:pt-0">
						<span className="font-semibold tracking-[0.04em] text-muted-foreground uppercase">
							{day.label}
						</span>
						<span className="text-subtle tabular-nums">
							{num(day.runs.length)}
						</span>
					</h3>
					{day.runs.map((run) => (
						<FeedRow key={run.id} run={run} now={now} />
					))}
				</section>
			))}
			{hasMore && (
				<LoadMoreSentinel onVisible={loadMore} loading={isFetchingMore} />
			)}
		</>
	);
};
