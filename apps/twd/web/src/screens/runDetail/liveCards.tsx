import { useRef } from "react";
import type {
	Drift,
	RunDetail,
	RunFile,
} from "../../../../src/api/contract.ts";
import { FileStatusIcon, Pill } from "../../components/status.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";
import { DriftBadge, NEW_FAILURE_PILL } from "./driftBadge.tsx";
import { EmptyNote, RunCard, ScrollFade } from "./runCard.tsx";
import { baseName, isFailure, runningSince, shortWorker } from "./runFiles.ts";

const KIND_PILL: Partial<
	Record<RunFile["status"], { tone: "bad" | "amber"; className: string }>
> = {
	crashed: { tone: "bad", className: NEW_FAILURE_PILL },
	timed_out: {
		tone: "amber",
		className:
			"border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40",
	},
};

const FailureRow = ({
	file,
	drift,
	onOpen,
}: {
	file: RunFile;
	drift: Drift | undefined;
	onOpen: () => void;
}) => {
	const kind = KIND_PILL[file.status];
	return (
		<button
			type="button"
			onClick={onOpen}
			title={file.file}
			className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-table-row-divider py-[7px] text-left outline-none hover:bg-muted/60 focus-visible:bg-muted"
		>
			<span className="flex w-full min-w-0 items-center gap-2">
				<FileStatusIcon status={file.status} />
				<span className="truncate font-mono text-xs font-medium text-foreground">
					{baseName(file.file)}
				</span>
				{kind && (
					<Pill tone={kind.tone} className={kind.className}>
						{file.status.replace("_", " ")}
					</Pill>
				)}
				{drift && <DriftBadge drift={drift} />}
				<span className="ml-auto flex shrink-0 items-baseline gap-2 pl-2">
					<span className="text-xs text-tertiary-foreground tabular-nums">
						{formatMs(file.durationMs)}
					</span>
					<span className="w-9 text-right font-mono text-[11px] text-subtle">
						{file.worker ? shortWorker(file.worker) : ""}
					</span>
				</span>
			</span>
			{file.failureSummary && (
				<span className="truncate pl-5 font-mono text-[11px] text-tertiary-foreground">
					{file.failureSummary.split("\n")[0]}
				</span>
			)}
		</button>
	);
};

/** Failed, crashed and timed-out files with their first error line; new failures first. */
export const FailuresCard = ({
	run,
	live,
	onOpenFile,
}: {
	run: RunDetail;
	live: boolean;
	onOpenFile: (file: string) => void;
}) => {
	const driftByFile = new Map(run.drift.map((d) => [d.file, d]));
	const failures = run.files
		.filter(isFailure)
		.sort(
			(a, b) =>
				Number(driftByFile.get(b.file)?.kind === "new_failure") -
					Number(driftByFile.get(a.file)?.kind === "new_failure") ||
				(b.durationMs ?? 0) - (a.durationMs ?? 0),
		);
	return (
		<RunCard
			title="Failed · crashed · timed out"
			className={cn("max-h-[46%]", failures.length > 0 && "min-h-32")}
			right={
				<span
					className={cn(
						"text-xs font-semibold tabular-nums",
						failures.length ? "text-red-600 dark:text-red-400" : "text-subtle",
					)}
				>
					{num(failures.length)}
				</span>
			}
		>
			{failures.length === 0 ? (
				<EmptyNote>
					{run.status === "queued" || run.status === "warming"
						? "No files have run yet."
						: live
							? "No failures so far."
							: "No failures."}
				</EmptyNote>
			) : (
				<ScrollFade>
					<div className="flex flex-col">
						{failures.map((f) => (
							<FailureRow
								key={f.file}
								file={f}
								drift={driftByFile.get(f.file)}
								onOpen={() => onOpenFile(f.file)}
							/>
						))}
					</div>
				</ScrollFade>
			)}
		</RunCard>
	);
};

/** Files on a worker right now, longest-running first. */
export const RunningCard = ({
	run,
	live,
	now,
	queued,
	onOpenFile,
}: {
	run: RunDetail;
	live: boolean;
	now: number;
	queued: number;
	onOpenFile: (file: string) => void;
}) => {
	const firstSeen = useRef(new Map<string, number>());
	const since = runningSince(run);
	const running = run.files
		.filter((f) => f.status === "running")
		.map((f) => {
			if (!firstSeen.current.has(f.file)) firstSeen.current.set(f.file, now);
			const at = since.get(f.file) ?? firstSeen.current.get(f.file) ?? now;
			return { file: f, elapsedMs: Math.max(0, now - at) };
		})
		.sort((a, b) => b.elapsedMs - a.elapsedMs);
	return (
		<RunCard
			title="Running now"
			className="flex-1"
			right={
				live && (
					<span className="text-xs text-subtle tabular-nums">
						{num(running.length)} · {num(queued)} queued
					</span>
				)
			}
		>
			{running.length === 0 ? (
				<EmptyNote>
					{!live
						? "Run finished · nothing running."
						: run.status === "running"
							? "No files running right now."
							: "Nothing running yet."}
				</EmptyNote>
			) : (
				<ScrollFade>
					<div className="flex flex-col">
						{running.map(({ file: f, elapsedMs }) => (
							<button
								key={f.file}
								type="button"
								onClick={() => onOpenFile(f.file)}
								title={f.file}
								className="flex h-[27px] w-full shrink-0 cursor-pointer items-center gap-2 border-b border-table-row-divider text-left outline-none hover:bg-muted/60 focus-visible:bg-muted"
							>
								<span className="w-9 shrink-0 font-mono text-[11px] text-subtle">
									{f.worker ? shortWorker(f.worker) : "—"}
								</span>
								<span className="size-[7px] shrink-0 rounded-[2px] bg-blue-500" />
								<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
									{baseName(f.file)}
								</span>
								<span className="shrink-0 text-xs text-tertiary-foreground tabular-nums">
									{formatMs(Math.round(elapsedMs / 1000) * 1000)}
								</span>
							</button>
						))}
					</div>
				</ScrollFade>
			)}
		</RunCard>
	);
};
