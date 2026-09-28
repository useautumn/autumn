import { Flame, Play, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Branch, Capacity } from "../../../src/api/contract.ts";
import {
	useBranches,
	useCapacity,
	useCatalog,
	useCreateRun,
	useWarmBranch,
} from "../api/hooks.ts";
import { PageHeader } from "../components/appShell.tsx";
import { ErrorCallout, StatusDot } from "../components/status.tsx";
import {
	Button,
	Card,
	Field,
	SectionTitle,
	Skeleton,
} from "../components/ui.tsx";
import { cn, formatMs, num } from "../lib/format.ts";
import { BranchPicker, WarmBadge } from "./newRun/branchPicker.tsx";
import { estimateWallMs } from "./newRun/estimate.ts";
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
			tone: "bad" as const,
			text: "No clean Stripe accounts free right now. Wait for nukes or release a reservation.",
		};
	if (files > capacity.maxFilesNow)
		return {
			tone: "warn" as const,
			text: `${num(capacity.maxFilesNow)} accounts free — the run fans out to ${num(capacity.maxFilesNow)} workers and queues the rest.`,
		};
	return {
		tone: "ok" as const,
		text: `${num(capacity.maxFilesNow)} accounts free. Enough for one worker per file.`,
	};
};

const Stat = ({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) => (
	<div>
		<p className="text-[11px] text-muted">{label}</p>
		<p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
		{hint && <p className="text-[11px] text-faint">{hint}</p>}
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

	const branch: Branch | null =
		branches.data?.find((b) => b.name === branchName) ?? null;
	const fileCount = sel.effective.length;
	const p90ByPath = new Map(
		catalog.data?.files.map((f) => [f.path, f.baselineP90Ms]),
	);
	const workers = capacity.data
		? Math.min(fileCount, capacity.data.maxFilesNow)
		: fileCount;
	const estimate = estimateWallMs({
		p90s: sel.effective.map((f) => p90ByPath.get(f) ?? null),
		workers,
	});
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
				title="New run"
				description="Pick a branch and the tests to fan out on Modal."
			/>
			<div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="min-w-0 space-y-5">
					<section>
						<SectionTitle>Branch</SectionTitle>
						{branches.data ? (
							<BranchPicker
								branches={branches.data}
								value={branch}
								onChange={(b) => setBranchName(b?.name ?? null)}
							/>
						) : (
							<Skeleton className="h-9 w-full" />
						)}
						<ErrorCallout error={branches.error} className="mt-2" />
						{branch && branch.warm !== "ready" && (
							<div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-xs">
								<span className="flex items-center gap-2 text-muted">
									<WarmBadge warm={branch.warm} />
									{branch.warm === "building"
										? "Image is building; the run waits for it (usually under a minute)."
										: branch.warm === "failed"
											? "Last warm build failed. Retry, or the run will build it first."
											: "No warm image yet. The run builds one first, or warm it now."}
								</span>
								{branch.warm !== "building" && (
									<Button
										disabled={warm.isPending}
										onClick={() => warm.mutate(branch.name)}
									>
										<Flame /> Warm now
									</Button>
								)}
							</div>
						)}
						<ErrorCallout error={warm.error} className="mt-2" />
					</section>

					<section>
						<SectionTitle
							right={
								fileCount > 0 && (
									<Button variant="ghost" onClick={sel.clear}>
										<X /> Clear selection
									</Button>
								)
							}
						>
							Tests
						</SectionTitle>
						<Card className="overflow-hidden">
							{catalog.data ? (
								<TestSelector catalog={catalog.data} sel={sel} />
							) : (
								<div className="space-y-2 p-3">
									{[0, 1, 2, 3, 4, 5].map((i) => (
										<Skeleton key={i} className="h-7 w-full" />
									))}
								</div>
							)}
						</Card>
						<ErrorCallout error={catalog.error} className="mt-2" />
					</section>
				</div>

				<aside className="lg:sticky lg:top-18 lg:mt-8">
					<Card className="p-4">
						<div className="grid grid-cols-3 gap-3">
							<Stat label="Files" value={num(fileCount)} />
							<Stat
								label="Workers"
								value={fileCount ? `~${num(workers)}` : "0"}
							/>
							<Stat
								label="Est."
								value={estimate ? `~${formatMs(estimate)}` : "—"}
							/>
						</div>
						<p className="mt-3 text-[11px] text-pretty text-faint">
							From dev baseline p90, longest-first, plus ~2 min fan-out.
							{unseen > 0 &&
								` ${unseen} file${unseen === 1 ? " has" : "s have"} no baseline yet (counted as 1 min).`}
						</p>

						<div className="mt-4 border-t border-line pt-4">
							<Field
								label="Path filter"
								hint="(optional grep)"
								value={sel.selection.grep}
								onChange={(e) => sel.setGrep(e.target.value)}
								placeholder="e.g. multi-currency"
								inputClassName="font-mono text-xs"
							/>
						</div>

						{sel.selection.groups.length + sel.selection.files.length > 0 && (
							<div className="mt-4 flex flex-wrap gap-1">
								{sel.selection.groups.map((g) => (
									<button
										key={g}
										type="button"
										onClick={() => sel.toggleGroup(g, false)}
										className="inline-flex h-5.5 cursor-pointer items-center gap-1 rounded bg-raised px-1.5 font-mono text-[11px] text-fg hover:bg-hover"
										aria-label={`Remove ${g}`}
									>
										{g}
										<X className="size-3 text-faint" />
									</button>
								))}
								{sel.selection.files.length > 0 && (
									<span className="inline-flex h-5.5 items-center rounded bg-raised px-1.5 text-[11px] text-muted">
										+{num(sel.selection.files.length)} file
										{sel.selection.files.length === 1 ? "" : "s"}
									</span>
								)}
							</div>
						)}

						{check && (
							<div className="mt-4 flex items-start gap-2 text-xs text-pretty">
								<span className="mt-1.5">
									<StatusDot tone={check.tone} />
								</span>
								<span
									className={cn(
										check.tone === "bad" ? "text-bad" : "text-muted",
									)}
								>
									{check.text}
								</span>
							</div>
						)}

						<Button
							variant="primary"
							size="md"
							className="mt-4 w-full justify-center"
							disabled={!canStart}
							onClick={start}
						>
							<Play /> {createRun.isPending ? "Starting…" : "Start run"}
						</Button>
						{!branch && (
							<p className="mt-2 text-center text-[11px] text-faint">
								Choose a branch to start.
							</p>
						)}
						{branch && fileCount === 0 && (
							<p className="mt-2 text-center text-[11px] text-faint">
								Select at least one group or file.
							</p>
						)}
						<ErrorCallout error={createRun.error} className="mt-3" />
					</Card>
				</aside>
			</div>
		</>
	);
};
