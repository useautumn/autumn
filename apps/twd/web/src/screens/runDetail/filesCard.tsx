import { Search } from "lucide-react";
import { useState } from "react";
import type {
	Drift,
	RunDetail,
	RunFile,
} from "../../../../src/api/contract.ts";
import {
	splitRepetitionId,
	summariseRepeats,
} from "../../../../src/internal/runs/repeat/repetitions.ts";
import { FileStatusBadge, Pill } from "../../components/status.tsx";
import { Segmented, Tooltip } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";
import { DriftBadge } from "./driftBadge.tsx";
import { RepeatsPanel } from "./repeatsPanel.tsx";
import { EmptyNote, RunCard, ScrollFade } from "./runCard.tsx";
import { isFailure, shortWorker } from "./runFiles.ts";

type Tab =
	| "all"
	| "failed"
	| "running"
	| "queued"
	| "passed"
	| "drift"
	| "repeats";

const ORDER: Record<RunFile["status"], number> = {
	failed: 0,
	crashed: 0,
	timed_out: 0,
	running: 1,
	queued: 2,
	passed: 3,
	skipped: 4,
};
const PAGE = 200;
const GRID =
	"grid grid-cols-[88px_minmax(0,1fr)_64px_52px] items-center gap-x-3";

const baseFile = (id: string) => splitRepetitionId({ id }).file;

const Duration = ({ ms, p90 }: { ms: number | null; p90: number | null }) => {
	if (ms === null) return <span className="text-subtle">—</span>;
	const slow = p90 !== null && ms > p90 * 1.5;
	return (
		<Tooltip
			content={
				p90 === null ? "No dev baseline yet" : `dev p90 ${formatMs(p90)}`
			}
		>
			<span
				className={cn(
					"tabular-nums",
					slow
						? "text-orange-600 dark:text-orange-400"
						: "text-muted-foreground",
				)}
			>
				{formatMs(ms)}
			</span>
		</Tooltip>
	);
};

/** Every file in the run, filterable by status (plus drift and repeats), scrolling inside its card. */
export const FilesCard = ({
	run,
	live,
	p90,
	onOpenFile,
}: {
	run: RunDetail;
	live: boolean;
	p90: Map<string, number | null>;
	onOpenFile: (file: string) => void;
}) => {
	const [picked, setTab] = useState<Tab>("all");
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE);
	const driftByFile = new Map<string, Drift>(run.drift.map((d) => [d.file, d]));
	const repeats = run.repeat > 1 ? summariseRepeats({ files: run.files }) : [];

	const matches: Record<Exclude<Tab, "repeats">, (f: RunFile) => boolean> = {
		all: () => true,
		failed: isFailure,
		running: (f) => f.status === "running",
		queued: (f) => f.status === "queued",
		passed: (f) => f.status === "passed",
		drift: (f) => driftByFile.has(f.file),
	};
	const count = (t: Exclude<Tab, "repeats">) =>
		t === "all" ? run.files.length : run.files.filter(matches[t]).length;
	const tabs: { value: Tab; label: string; n?: number }[] = [
		{ value: "all", label: "All", n: count("all") },
		{ value: "failed", label: "Failed", n: count("failed") },
		...(live
			? [
					{ value: "running" as const, label: "Running", n: count("running") },
					{ value: "queued" as const, label: "Queued", n: count("queued") },
				]
			: [{ value: "passed" as const, label: "Passed", n: count("passed") }]),
		...(run.drift.length > 0
			? [{ value: "drift" as const, label: "Drift", n: run.drift.length }]
			: []),
		...(repeats.length > 0
			? [{ value: "repeats" as const, label: `Repeats ×${run.repeat}` }]
			: []),
	];

	const tab = tabs.some((t) => t.value === picked) ? picked : "all";
	const select = (next: Tab) => {
		setTab(next);
		setLimit(PAGE);
	};
	const rows =
		tab === "repeats"
			? []
			: run.files
					.filter(matches[tab])
					.filter(
						(f) => !query || f.file.toLowerCase().includes(query.toLowerCase()),
					)
					.sort(
						(a, b) =>
							ORDER[a.status] - ORDER[b.status] ||
							(b.durationMs ?? 0) - (a.durationMs ?? 0),
					);

	return (
		<RunCard
			title="Files"
			className="flex-1"
			right={
				<Segmented
					label="File filter"
					value={tab}
					onChange={select}
					className="min-w-0 overflow-x-auto"
					options={tabs.map((t) => ({
						value: t.value,
						label: (
							<span className="text-xs font-normal">
								{t.label}
								{t.n !== undefined && (
									<span className="ml-1.5 text-subtle tabular-nums">
										{num(t.n)}
									</span>
								)}
							</span>
						),
					}))}
				/>
			}
		>
			{tab === "repeats" ? (
				<ScrollFade>
					<RepeatsPanel
						repeats={repeats}
						onOpenFile={(file) => {
							select("all");
							setQuery(`${file}#`);
						}}
					/>
				</ScrollFade>
			) : (
				<div className="flex min-h-0 flex-1 flex-col">
					<div
						className={cn(
							GRID,
							"h-7 shrink-0 border-b text-[11px] font-medium text-tertiary-foreground",
						)}
					>
						<span>Status</span>
						<label className="flex min-w-0 items-center gap-1.5">
							<Search className="size-3 shrink-0 text-subtle" aria-hidden />
							<input
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									setLimit(PAGE);
								}}
								placeholder="File"
								aria-label="Filter files"
								className="h-6 min-w-0 flex-1 bg-transparent text-[11px] font-medium text-foreground outline-none placeholder:text-tertiary-foreground focus:placeholder:text-subtle"
							/>
						</label>
						<span>Duration</span>
						<span>Worker</span>
					</div>
					<ScrollFade>
						<div className="flex flex-col">
							{rows.length === 0 && (
								<EmptyNote>
									{query
										? "No files match. Try another filter."
										: tab === "all"
											? "No files planned yet."
											: `No ${tab} files.`}
								</EmptyNote>
							)}
							{rows.slice(0, limit).map((f) => {
								const drift = driftByFile.get(f.file);
								return (
									<button
										key={f.file}
										type="button"
										onClick={() => onOpenFile(f.file)}
										className={cn(
											GRID,
											"h-[30px] shrink-0 cursor-pointer border-b border-table-row-divider text-left text-xs outline-none hover:bg-muted/60 focus-visible:bg-muted",
										)}
									>
										<FileStatusBadge status={f.status} />
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate font-mono text-xs text-foreground">
												{f.file}
											</span>
											{drift && <DriftBadge drift={drift} />}
											{f.attempt > 1 && (
												<Tooltip
													content={`Attempt ${f.attempt}: retried after a failure`}
												>
													<span className="flex shrink-0">
														<Pill tone="warn">×{f.attempt}</Pill>
													</span>
												</Tooltip>
											)}
										</span>
										<Duration
											ms={f.durationMs}
											p90={p90.get(baseFile(f.file)) ?? null}
										/>
										<span className="truncate font-mono text-[11px] text-subtle">
											{f.worker ? shortWorker(f.worker) : "—"}
										</span>
									</button>
								);
							})}
							{rows.length > limit && (
								<button
									type="button"
									onClick={() => setLimit((n) => n + PAGE)}
									className="cursor-pointer py-2 text-xs text-tertiary-foreground outline-none hover:text-foreground focus-visible:text-foreground"
								>
									Show {num(Math.min(PAGE, rows.length - limit))} more of{" "}
									{num(rows.length - limit)}
								</button>
							)}
						</div>
					</ScrollFade>
				</div>
			)}
		</RunCard>
	);
};
