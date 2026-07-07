import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { TerminalOutput } from "../Terminal";
import type { Snapshot, WorkerRow } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { WorkerStatusBadge } from "../widgets";

function WorkerList({
	workers,
	active,
	onPick,
}: {
	workers: WorkerRow[];
	active?: string;
	onPick: (worker: string) => void;
}) {
	return (
		<div className="h-full min-h-0 overflow-auto rounded-lg border bg-card">
			{workers.map((w) => (
				<button
					className={cn(
						"flex w-full items-center justify-between gap-2 border-b px-2.5 py-1.5 text-left text-xs last:border-b-0 hover:bg-interactive-secondary-hover",
						active === w.name && "bg-interactive-secondary-hover",
					)}
					key={w.name}
					onClick={() => onPick(w.name)}
					title={`${w.name} · ${w.status}${w.reason ? ` — ${w.reason}` : ""}`}
					type="button"
				>
					<span className="truncate font-mono text-tertiary-foreground">
						{w.name}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="text-muted-foreground tabular-nums">
							{w.fileCount}
						</span>
						<WorkerStatusBadge status={w.status} />
					</span>
				</button>
			))}
		</div>
	);
}

export function PerWorker({
	snap,
	socket,
	onOpenFile,
}: {
	snap: Snapshot;
	socket: SwarmSocket;
	onOpenFile: (file: string) => void;
}) {
	const activeWorker =
		socket.sub?.kind === "worker" ? socket.sub.key : undefined;
	const row = snap.workers.find((w) => w.name === activeWorker);
	const showOutput = socket.sub?.kind === "worker";
	return (
		<ResizablePanelGroup className="h-full" orientation="horizontal">
			<ResizablePanel defaultSize={26} minSize={18}>
				<div className="h-full min-h-0 pr-3">
					<WorkerList
						active={activeWorker}
						onPick={socket.subscribeWorker}
						workers={snap.workers}
					/>
				</div>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={74}>
				<div className="flex h-full min-h-0 flex-col gap-3 pl-3">
					{row ? (
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<span className="font-mono text-sm">{row.name}</span>
							<WorkerStatusBadge status={row.status} />
							<span className="text-muted-foreground text-xs">
								{row.fileCount} files
							</span>
							{row.reason ? (
								<span className="truncate text-red-500 text-xs" title={row.reason}>
									{row.reason}
								</span>
							) : null}
						</div>
					) : (
						<div className="shrink-0 text-muted-foreground text-sm">
							select a worker to view its server output
						</div>
					)}
					{row && row.files.length > 0 ? (
						<div className="flex max-h-24 shrink-0 flex-wrap gap-1.5 overflow-auto">
							{row.files.map((f) => (
								<button
									className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs hover:bg-interactive-secondary-hover"
									key={f.file}
									onClick={() => onOpenFile(f.file)}
									type="button"
								>
									{f.name}
								</button>
							))}
						</div>
					) : null}
					{/* WTERM read-only surface for this worker's server output. */}
					<div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
						{showOutput ? (
							<TerminalOutput text={socket.output} />
						) : (
							<div className="flex h-full items-center justify-center text-muted-foreground text-xs">
								(no output yet)
							</div>
						)}
					</div>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
