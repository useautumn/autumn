import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
} from "@autumn/ui/components/ui/sheet";
import { X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { RunDetail } from "../../../../src/api/contract.ts";
import type { RunTiming } from "../../../../src/internal/runs/timing/summariseRunTiming.ts";
import type { LogLine } from "../../api/liveCache.ts";
import { AnsiText } from "../../components/ansi.tsx";
import { formatMs } from "../../lib/format.ts";
import { BootBreakdown } from "./bootBreakdown.tsx";
import {
	CompletionChart,
	DurationHistogram,
	LongTail,
	mmss,
	PhaseBar,
	SheetSection,
} from "./runTiming.tsx";

const LiveLog = ({
	lines,
	onOpen,
}: {
	lines: LogLine[];
	onOpen: (file: string) => void;
}) => (
	<div className="h-48 overflow-auto rounded-lg border bg-interactive-secondary px-2.5 py-2 font-mono text-[11px] leading-[1.7]">
		{lines.length === 0 ? (
			<p className="text-subtle">Waiting for output…</p>
		) : (
			lines
				.slice(-120)
				.reverse()
				.map((l, i) => (
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only log tail
						key={i}
						type="button"
						onClick={() => l.file && onOpen(l.file)}
						className="block w-full cursor-pointer truncate text-left hover:bg-muted"
					>
						{l.worker && <span className="text-subtle">{l.worker} </span>}
						<AnsiText text={l.text} />
					</button>
				))
		)}
	</div>
);

type SheetBodyProps = {
	run: RunDetail;
	timing: RunTiming;
	live: boolean;
	log: LogLine[];
	onOpenFile: (file: string) => void;
	onOpenWorker: (worker: string) => void;
};

const SheetBody = memo(
	({ run, timing, live, log, onOpenFile, onOpenWorker }: SheetBodyProps) => {
		const { marks } = timing;
		const marksLine = [
			marks.lastWorkerReady !== null &&
				`all workers up ${mmss(marks.lastWorkerReady)}`,
			marks.halfFilesDone !== null && `50% at ${mmss(marks.halfFilesDone)}`,
			marks.ninetyFilesDone !== null && `90% at ${mmss(marks.ninetyFilesDone)}`,
		].filter(Boolean);
		const hasFiles = timing.completion.length > 0;
		return (
			<>
				<div className="flex items-center gap-3">
					<SheetTitle className="text-[15px]">Timing & boot</SheetTitle>
					<span className="ml-auto text-xs text-tertiary-foreground tabular-nums">
						{formatMs(timing.wallMs)} wall
						{marks.ninetyFilesDone !== null &&
							` · 90% at ${mmss(marks.ninetyFilesDone)}`}
					</span>
					<SheetClose
						data-testid="timing-close"
						className="-mr-1 flex size-6 cursor-pointer items-center justify-center rounded-md text-subtle outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						<X className="size-3.5" />
						<span className="sr-only">Close</span>
					</SheetClose>
				</div>

				<SheetSection title="Phases">
					<PhaseBar timing={timing} status={run.status} />
				</SheetSection>

				{hasFiles && (
					<div className="flex flex-col gap-1">
						<div className="grid grid-cols-2 gap-3.5">
							<SheetSection title="Files done over time">
								<CompletionChart
									timing={timing}
									fileCount={run.fileCount ?? run.files.length}
								/>
							</SheetSection>
							<SheetSection title="File durations">
								<DurationHistogram timing={timing} />
							</SheetSection>
						</div>
						{marksLine.length > 0 && (
							<p className="text-[11px] text-subtle tabular-nums">
								{marksLine.join(" · ")}
							</p>
						)}
					</div>
				)}

				<BootBreakdown workers={run.workers} onOpenWorker={onOpenWorker} />

				{timing.slowest.length > 0 && (
					<SheetSection title="Long tail · slowest files set the wall time">
						<LongTail timing={timing} onOpenFile={onOpenFile} />
					</SheetSection>
				)}

				{live && (
					<SheetSection title="Live output">
						<LiveLog lines={log} onOpen={onOpenFile} />
					</SheetSection>
				)}
				{live && (
					<p className="text-[11px] text-subtle">
						ETA: dev baselines scaled by this run's pace, packed onto its
						workers, plus retries and teardown. ± is the gap to p90.
					</p>
				)}
			</>
		);
	},
);

const whenIdle = (run: () => void) => {
	if (typeof window.requestIdleCallback !== "function") {
		const id = window.setTimeout(run, 200);
		return () => window.clearTimeout(id);
	}
	const id = window.requestIdleCallback(run, { timeout: 1_000 });
	return () => window.cancelIdleCallback(id);
};

/** Timing & boot, opened from the ETA chip: a left sheet over the main content only. */
export const TimingSheet = ({
	open,
	onOpenChange,
	...body
}: SheetBodyProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	// Mounted once the page is idle and kept mounted, so opening only reveals it.
	const [primed, setPrimed] = useState(false);
	useEffect(() => whenIdle(() => setPrimed(true)), []);
	// While closed the body keeps its last props, so live ticks don't re-render the charts.
	const shown = useRef(body);
	if (open) shown.current = body;
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				hideCloseButton
				keepMounted={primed}
				// Laid out but invisible while closed, so the charts keep their size instead of remounting.
				render={(props) => <div {...props} hidden={false} />}
				overlayClassName="absolute"
				className="not-data-ending-style:data-closed:invisible absolute top-2 bottom-2 left-3 w-[calc(100%-1.5rem)] gap-4 overflow-y-auto rounded-2xl border border-border/40 bg-card p-4 shadow-(--overlay-dialog-shadow) sm:max-w-md"
			>
				<SheetBody {...shown.current} />
			</SheetContent>
		</Sheet>
	);
};
