import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { SwarmSocket } from "../useSwarmSocket";
import type { FileRow, Snapshot } from "../types";
import { FileStatusBadge, OutputPane } from "../widgets";

function FileList({
	files,
	active,
	onPick,
}: {
	files: FileRow[];
	active?: string;
	onPick: (file: string) => void;
}) {
	const [q, setQ] = useState("");
	const filtered = q
		? files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
		: files;
	return (
		<div className="flex h-full flex-col gap-2">
			<input
				className="w-full rounded-md border bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
				onChange={(e) => setQ(e.target.value)}
				placeholder="filter files…"
				value={q}
			/>
			<div className="flex-1 overflow-auto rounded-lg border bg-card">
				{filtered.map((f) => (
					<button
						className={cn(
							"flex w-full items-center justify-between gap-2 border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted",
							active === f.file && "bg-muted",
						)}
						key={f.file}
						onClick={() => onPick(f.file)}
						type="button"
					>
						<span className="truncate font-mono">{f.name}</span>
						<FileStatusBadge status={f.status} />
					</button>
				))}
			</div>
		</div>
	);
}

export function PerFile({
	snap,
	socket,
}: {
	snap: Snapshot;
	socket: SwarmSocket;
}) {
	const activeFile =
		socket.sub?.kind === "file" ? socket.sub.key : undefined;
	const row = snap.files.find((f) => f.file === activeFile);
	return (
		<ResizablePanelGroup className="min-h-[70vh]" orientation="horizontal">
			<ResizablePanel defaultSize={28} minSize={18}>
				<div className="h-full pr-3">
					<FileList
						active={activeFile}
						files={snap.files}
						onPick={socket.subscribeFile}
					/>
				</div>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={72}>
				<div className="flex h-full flex-col gap-3 pl-3">
					{row ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-sm">{row.name}</span>
							<FileStatusBadge status={row.status} />
							<Badge variant="green">✓ {row.passed}</Badge>
							<Badge variant="red">✗ {row.failed}</Badge>
							{row.worker ? (
								<span className="text-muted-foreground text-xs">
									on {row.worker}
								</span>
							) : null}
						</div>
					) : (
						<div className="text-muted-foreground text-sm">
							select a file to view its test output
						</div>
					)}
					{row && row.failedTests.length > 0 ? (
						<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
							<div className="mb-1 font-medium text-red-400 text-xs">
								{row.failedTests.length} failing
							</div>
							<ul className="flex flex-col gap-1">
								{row.failedTests.map((t) => (
									<li className="font-mono text-xs" key={`${t.name}-${t.location ?? ""}`}>
										<span className="text-red-400">✗</span> {t.name}
										{t.message ? (
											<span className="text-muted-foreground">
												{" — "}
												{t.message}
											</span>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<div className="min-h-0 flex-1">
						<OutputPane text={socket.sub?.kind === "file" ? socket.output : ""} />
					</div>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
