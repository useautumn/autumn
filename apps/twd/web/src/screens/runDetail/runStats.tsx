import type { ReactNode } from "react";
import type { RunDetail } from "../../../../src/api/contract.ts";
import { RunProgress } from "../../components/status.tsx";
import { Tooltip } from "../../components/ui.tsx";
import { cn, num } from "../../lib/format.ts";
import { RunEtaButton } from "./runEta.tsx";
import { TERMINAL } from "./runFiles.ts";

const Stat = ({
	n,
	tone,
	children,
}: {
	n: number;
	tone: string;
	children: ReactNode;
}) => (
	<span className="flex items-baseline gap-1.5">
		<span className={cn("text-[22px] leading-7 font-semibold", tone)}>
			{num(n)}
		</span>
		<span className="text-xs text-tertiary-foreground">{children}</span>
	</span>
);

const FailedLabel = ({ files }: { files: RunDetail["files"] }) => {
	const kinds = [
		["failed", files.filter((f) => f.status === "failed").length],
		["crashed", files.filter((f) => f.status === "crashed").length],
		["timed out", files.filter((f) => f.status === "timed_out").length],
	] as const;
	return (
		<Tooltip
			side="bottom"
			align="start"
			className="border-transparent bg-foreground px-2.5 py-2 text-background shadow-[0_6px_20px_rgb(0_0_0/0.18)] before:hidden dark:bg-foreground"
			content={
				<span className="grid grid-cols-[auto_auto] gap-x-2.5 gap-y-1 text-xs leading-4 tabular-nums">
					{kinds.map(([label, n]) => (
						<span key={label} className="contents">
							<span className="font-semibold">{num(n)}</span>
							<span className="font-normal text-background/75">{label}</span>
						</span>
					))}
				</span>
			}
		>
			<button
				type="button"
				data-testid="failed-breakdown"
				className="cursor-default rounded-sm underline decoration-dotted decoration-from-font underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				failed
			</button>
		</Tooltip>
	);
};

/** Big counts, the timing chip, and the progress bar under them. */
export const RunStats = ({
	run,
	now,
	total,
	running,
	wallMs,
	timingOpen,
	onOpenTiming,
}: {
	run: RunDetail;
	now: number;
	total: number;
	running: number;
	wallMs: number;
	timingOpen: boolean;
	onOpenTiming: () => void;
}) => {
	const live = !TERMINAL.has(run.status);
	const finished = run.files.filter(
		(f) => f.status !== "running" && f.status !== "queued",
	).length;
	const skipped = run.files.filter((f) => f.status === "skipped").length;
	const queued = Math.max(0, total - finished - running);
	return (
		<div className="flex shrink-0 flex-col gap-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
				<div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
					<Stat n={run.passed} tone="text-green-600 dark:text-green-500">
						passed
					</Stat>
					<Stat
						n={run.failed}
						tone={run.failed ? "text-red-600 dark:text-red-400" : "text-subtle"}
					>
						{run.failed > 0 ? <FailedLabel files={run.files} /> : "failed"}
					</Stat>
					{live && (
						<Stat n={running} tone="text-blue-600 dark:text-blue-400">
							running
						</Stat>
					)}
					{live && (
						<Stat n={queued} tone="text-muted-foreground">
							queued
						</Stat>
					)}
					{skipped > 0 && (
						<Stat n={skipped} tone="text-subtle">
							skipped
						</Stat>
					)}
					<span className="text-xs text-subtle">of {num(total)} files</span>
				</div>
				<RunEtaButton
					run={run}
					now={now}
					wallMs={wallMs}
					open={timingOpen}
					onOpen={onOpenTiming}
				/>
			</div>
			<RunProgress
				className="h-2"
				passed={run.passed}
				failed={run.failed}
				running={running}
				total={total}
			/>
		</div>
	);
};
