import { buttonVariants } from "@autumn/ui/components/ui/button";
import { PlayIcon } from "@phosphor-icons/react";
import { Plus, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useBranchPages, useRunPages, useRuns } from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { ErrorCallout } from "../components/status.tsx";
import { PageHeader, SearchInput, Segmented } from "../components/ui.tsx";
import { useNow } from "../lib/useNow.ts";
import { RunCard, ScrollFade } from "./runDetail/runCard.tsx";
import { BaselineStrip } from "./runs/baselineStrip.tsx";
import { BranchesView } from "./runs/branchesView.tsx";
import { LiveNowCard } from "./runs/liveNowCard.tsx";
import { RunsFeed } from "./runs/runsFeed.tsx";

const VIEWS = ["branches", "runs"] as const;
type View = (typeof VIEWS)[number];
const VIEW_KEY = "twd-runs-view";

const FILTERS = ["all", "passed", "failed", "cancelled", "baselines"] as const;
type Filter = (typeof FILTERS)[number];

const LIVE_POLL_MS = 5_000;
const FEED_PAGE = 50;
const BRANCHES_PAGE = 30;

const storedView = (): View =>
	localStorage.getItem(VIEW_KEY) === "runs" ? "runs" : "branches";

export const RunsScreen = () => {
	const [params, setParams] = useSearchParams();
	const branch = params.get("branch") ?? "";
	const onBranch = params.get("on") ?? "";
	const view: View =
		VIEWS.find((v) => v === params.get("view")) ?? storedView();
	const filter: Filter =
		FILTERS.find((f) => f === params.get("status")) ?? "all";
	const now = useNow();
	useLiveTopics("runs");

	const live = useRuns(
		{ status: "live", branch: branch || undefined, limit: 50 },
		{ pollMs: LIVE_POLL_MS },
	);
	const branches = useBranchPages({
		branch: branch || undefined,
		limit: BRANCHES_PAGE,
	});
	const feed = useRunPages({
		status: "finished",
		outcome: filter === "all" || filter === "baselines" ? "all" : filter,
		baseline: filter === "baselines" || undefined,
		branch: branch || undefined,
		exactBranch: onBranch || undefined,
		limit: FEED_PAGE,
	});

	const update = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [key, value] of Object.entries(changes)) {
			if (value) next.set(key, value);
			else next.delete(key);
		}
		setParams(next, { replace: true });
	};
	const setView = (next: View) => {
		localStorage.setItem(VIEW_KEY, next);
		update({ view: next, on: next === "branches" ? null : onBranch });
	};
	const openHistory = (name: string) => update({ view: "runs", on: name });

	return (
		<>
			<PageHeader
				icon={<PlayIcon size={16} weight="fill" />}
				title={
					<span className="flex min-w-0 items-center gap-4">
						Runs
						<BaselineStrip now={now} />
					</span>
				}
			>
				<SearchInput
					value={branch}
					onChange={(v) => update({ branch: v })}
					placeholder="Filter by branch"
					className="w-[200px] max-sm:w-full"
				/>
				<Link to="/runs/new" className={buttonVariants({ variant: "primary" })}>
					<span className="relative z-10 inline-flex items-center gap-2">
						<Plus className="size-3.5" /> New run
					</span>
				</Link>
			</PageHeader>
			<ErrorCallout
				error={live.error ?? branches.error ?? feed.error}
				className="mb-3"
			/>
			<div className="flex min-h-0 flex-1 gap-3.5 max-sm:flex-col">
				<LiveNowCard
					runs={live.data?.runs}
					isLoading={live.isLoading}
					filtered={!!branch}
				/>
				<RunCard
					className="min-w-0 flex-1 max-sm:h-[36rem]"
					title={
						<span className="flex items-center gap-2">
							Finished
							{view === "runs" && onBranch && (
								<button
									type="button"
									onClick={() => update({ on: null })}
									aria-label={`Clear branch ${onBranch}`}
									className="inline-flex h-5 max-w-60 cursor-pointer items-center gap-1 rounded-md border bg-background px-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
								>
									<span className="truncate">{onBranch}</span>
									<X className="size-3 shrink-0 text-subtle" />
								</button>
							)}
						</span>
					}
					right={
						<div className="flex items-center gap-2">
							{view === "runs" && (
								<Segmented
									value={filter}
									onChange={(f) => update({ status: f === "all" ? null : f })}
									options={FILTERS.map((f) => ({
										value: f,
										label: <span className="capitalize">{f}</span>,
									}))}
								/>
							)}
							<Segmented
								value={view}
								onChange={setView}
								options={[
									{ value: "branches", label: "Branches" },
									{ value: "runs", label: "Runs" },
								]}
							/>
						</div>
					}
				>
					<ScrollFade key={view} className="@container">
						{view === "branches" ? (
							<BranchesView
								branches={branches.pages.flatMap((p) => p.branches)}
								isLoading={branches.isLoading}
								now={now}
								hasMore={branches.hasMore}
								isFetchingMore={branches.isFetchingMore}
								loadMore={branches.loadMore}
								onOpenHistory={openHistory}
								emptyText={
									branch
										? "No branch with finished runs matches the filter."
										: "No finished runs yet."
								}
							/>
						) : (
							<RunsFeed
								runs={feed.pages.flatMap((p) => p.runs)}
								isLoading={feed.isLoading}
								now={now}
								hasMore={feed.hasMore}
								isFetchingMore={feed.isFetchingMore}
								loadMore={feed.loadMore}
								emptyText="No finished runs match. Clear the branch or status filter to see more."
							/>
						)}
					</ScrollFade>
				</RunCard>
			</div>
		</>
	);
};
