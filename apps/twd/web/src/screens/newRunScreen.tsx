import { PlusCircleIcon } from "@phosphor-icons/react";
import { Flame, Play, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Branch, Capacity } from "../../../src/api/contract.ts";
import {
	useBranches,
	useCapacity,
	useCatalog,
	useCostRates,
	useCreateRun,
	useWarmBranch,
} from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { workerUsdPerSecond } from "../components/cost.tsx";
import { ErrorCallout, StatusDot } from "../components/status.tsx";
import {
	Button,
	Field,
	PageHeader,
	Panel,
	SectionTag,
	Skeleton,
} from "../components/ui.tsx";
import { cn, formatMs, num, usd } from "../lib/format.ts";
import { BranchPicker, WarmBadge } from "./newRun/branchPicker.tsx";
import { estimateWallMs, estimateWorkerSeconds } from "./newRun/estimate.ts";
import { TestSelector } from "./newRun/testSelector.tsx";
import { useRunSelection } from "./newRun/useRunSelection.ts";

const capacityCheck = ({
	capacity,
	files,
}: {
	capacity: Capacity;
	files: number;
}) => {
	if (capacity.gate === "draining")
		return {
			tone: "bad" as const,
			text: "Keys are re-initialising. New runs are paused until the gate opens.",
		};
	if (capacity.maxFilesNow === 0)
		return {
			tone: "warn" as const,
			text: `No accounts free right now. The run joins the queue${capacity.queuedRuns ? ` behind ${num(capacity.queuedRuns)}` : ""} and starts as accounts free up.`,
		};
	if (files > capacity.maxFilesNow)
		return {
			tone: "warn" as const,
			text: `${num(capacity.maxFilesNow)} accounts free. The run starts with ${num(capacity.maxFilesNow)} workers and grows as accounts free up.`,
		};
	return {
		tone: "ok" as const,
		text: `${num(capacity.maxFilesNow)} accounts free. Enough for one worker per file.`,
	};
};

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-center justify-between text-sm">
		<span className="text-tertiary-foreground">{label}</span>
		<span className="font-medium text-foreground tabular-nums">{value}</span>
	</div>
);

export const NewRunScreen = () => {
	const navigate = useNavigate();
	const catalog = useCatalog();
	const branches = useBranches();
	const capacity = useCapacity();
	const createRun = useCreateRun();
	const warm = useWarmBranch();
	const sel = useRunSelection({ catalog: catalog.data });
	const [branchName, setBranchName] = useState<string | null>(null);
	useLiveTopics("warm");

	const branch: Branch | null =
		branches.data?.find((b) => b.name === branchName) ?? null;
	const fileCount = sel.effective.length;
	const p90ByPath = new Map(
		catalog.data?.files.map((f) => [f.path, f.baselineP90Ms]),
	);
	const workers = capacity.data
		? Math.min(fileCount, capacity.data.poolCap)
		: fileCount;
	const p90s = sel.effective.map((f) => p90ByPath.get(f) ?? null);
	const estimate = estimateWallMs({ p90s, workers });
	const rates = useCostRates();
	const costEstimate =
		rates && fileCount
			? estimateWorkerSeconds({ p90s, workers }) * workerUsdPerSecond(rates)
			: null;
	const unseen = sel.effective.filter((f) => p90ByPath.get(f) === null).length;
	const check =
		capacity.data && fileCount > 0
			? capacityCheck({ capacity: capacity.data, files: fileCount })
			: null;
	const canStart =
		!!branch && fileCount > 0 && check?.tone !== "bad" && !createRun.isPending;

	const start = () => {
		if (!branch) return;
		const { groups, files, grep } = sel.selection;
		createRun.mutate(
			{
				branch: branch.name,
				sha: branch.sha,
				selection: {
					groups: groups.length ? groups : undefined,
					files: files.length ? files : undefined,
					grep: grep.trim() || undefined,
				},
			},
			{ onSuccess: (run) => navigate(`/runs/${run.id}`) },
		);
	};

	return (
		<>
			<PageHeader
				icon={<PlusCircleIcon size={16} weight="fill" />}
				title="New run"
			/>
			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="flex min-w-0 flex-col gap-5">
					<section>
						<SectionTag>Branch</SectionTag>
						{branches.data ? (
							<BranchPicker
								branches={branches.data}
								value={branch}
								onChange={(b) => setBranchName(b?.name ?? null)}
							/>
						) : (
							<Skeleton className="h-input w-full" />
						)}
						<ErrorCallout error={branches.error} className="mt-2" />
						{branch && branch.warm !== "ready" && (
							<div className="mt-2 flex items-center justify-between gap-3 rounded-lg border bg-interactive-secondary px-3 py-1.5 text-xs">
								<span className="flex items-center gap-2 text-tertiary-foreground">
									<WarmBadge warm={branch.warm} />
									{branch.warm === "building"
										? "Image is building; the run waits for it (usually under a minute)."
										: branch.warm === "failed"
											? "Last warm build failed. Retry, or the run will build it first."
											: "No warm image yet. The run builds one first, or warm it now."}
								</span>
								{branch.warm !== "building" && (
									<Button
										variant="secondary"
										size="sm"
										isLoading={warm.isPending}
										onClick={() => warm.mutate(branch.name)}
									>
										<Flame className="size-3" /> Warm now
									</Button>
								)}
							</div>
						)}
						<ErrorCallout error={warm.error} className="mt-2" />
					</section>

					<section>
						<div className="flex items-center justify-between">
							<SectionTag>Tests</SectionTag>
							{fileCount > 0 && (
								<button
									type="button"
									onClick={sel.clear}
									className="mb-2 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-tertiary-foreground hover:bg-muted hover:text-foreground"
								>
									<X className="size-3" /> Clear selection
								</button>
							)}
						</div>
						<Panel className="overflow-hidden">
							{catalog.data ? (
								<TestSelector catalog={catalog.data} sel={sel} />
							) : (
								<div className="flex flex-col gap-2 p-3">
									{[0, 1, 2, 3, 4, 5].map((i) => (
										<Skeleton key={i} className="h-6 w-full" />
									))}
								</div>
							)}
						</Panel>
						<ErrorCallout error={catalog.error} className="mt-2" />
					</section>
				</div>

				<aside className="lg:sticky lg:top-0">
					<SectionTag>Summary</SectionTag>
					<Panel className="flex flex-col gap-3 p-3">
						<div className="flex flex-col gap-1.5">
							<SummaryRow label="Files" value={num(fileCount)} />
							<SummaryRow
								label="Workers"
								value={fileCount ? `~${num(workers)}` : "0"}
							/>
							<SummaryRow
								label="Estimate"
								value={estimate ? `~${formatMs(estimate)}` : "—"}
							/>
							<SummaryRow
								label="Cost"
								value={
									costEstimate === null ? "—" : `${usd(costEstimate)} est.`
								}
							/>
						</div>
						<p className="text-xs text-pretty text-subtle">
							From dev baseline p90, longest-first, plus ~2 min fan-out. Cost
							adds ~90s boot per worker at Modal rates.
							{unseen > 0 &&
								` ${unseen} file${unseen === 1 ? " has" : "s have"} no baseline yet (counted as 1 min).`}
						</p>

						<Field
							label="Path filter"
							hint="(optional grep)"
							value={sel.selection.grep}
							onChange={(e) => sel.setGrep(e.target.value)}
							placeholder="e.g. multi-currency"
							inputClassName="font-mono text-xs"
						/>

						{sel.selection.groups.length + sel.selection.files.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{sel.selection.groups.map((g) => (
									<button
										key={g}
										type="button"
										onClick={() => sel.toggleGroup(g, false)}
										className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-md bg-muted px-1.5 text-tiny-id text-foreground hover:bg-interactive-secondary-hover"
										aria-label={`Remove ${g}`}
									>
										{g}
										<X className="size-3 text-subtle" />
									</button>
								))}
								{sel.selection.files.length > 0 && (
									<span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11px] text-tertiary-foreground">
										+{num(sel.selection.files.length)} file
										{sel.selection.files.length === 1 ? "" : "s"}
									</span>
								)}
							</div>
						)}

						{check && (
							<div className="flex items-start gap-2 text-xs text-pretty">
								<span className="mt-1.5">
									<StatusDot tone={check.tone} />
								</span>
								<span
									className={cn(
										check.tone === "bad"
											? "text-red-600 dark:text-red-400"
											: "text-tertiary-foreground",
									)}
								>
									{check.text}
								</span>
							</div>
						)}

						<Button
							variant="primary"
							className="w-full"
							disabled={!canStart}
							isLoading={createRun.isPending}
							onClick={start}
						>
							<Play className="size-3.5" /> Start run
						</Button>
						{!branch && (
							<p className="-mt-1 text-center text-xs text-subtle">
								Choose a branch to start.
							</p>
						)}
						{branch && fileCount === 0 && (
							<p className="-mt-1 text-center text-xs text-subtle">
								Select at least one group or file.
							</p>
						)}
						<ErrorCallout error={createRun.error} />
					</Panel>
				</aside>
			</div>
		</>
	);
};
