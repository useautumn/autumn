import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { SwarmSocket } from "../useSwarmSocket";
import type { Snapshot, WorkerRow } from "../types";
import { OutputPane, WorkerStatusBadge } from "../widgets";

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
		<div className="h-full overflow-auto rounded-lg border bg-card">
			{workers.map((w) => (
				<button
					className={cn(
						"flex w-full items-center justify-between gap-2 border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted",
						active === w.name && "bg-muted",
					)}
					key={w.name}
					onClick={() => onPick(w.name)}
					type="button"
				>
					<span className="truncate font-mono">{w.name}</span>
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
	return (
		<ResizablePanelGroup className="min-h-[70vh]" orientation="horizontal">
			<ResizablePanel defaultSize={26} minSize={18}>
				<div className="h-full pr-3">
					<WorkerList
						active={activeWorker}
						onPick={socket.subscribeWorker}
						workers={snap.workers}
					/>
				</div>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={74}>
				<div className="flex h-full flex-col gap-3 pl-3">
					{row ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-sm">{row.name}</span>
							<WorkerStatusBadge status={row.status} />
							<span className="text-muted-foreground text-xs">
								{row.fileCount} files
							</span>
						</div>
					) : (
						<div className="text-muted-foreground text-sm">
							select a worker to view its server output
						</div>
					)}
					{row && row.files.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{row.files.map((f) => (
								<button
									className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs hover:bg-muted"
									key={f.file}
									onClick={() => onOpenFile(f.file)}
									type="button"
								>
									{f.name}
								</button>
							))}
						</div>
					) : null}
					<div className="min-h-0 flex-1">
						<OutputPane
							text={socket.sub?.kind === "worker" ? socket.output : ""}
						/>
					</div>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
