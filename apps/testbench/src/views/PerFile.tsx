import { useState } from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { TerminalOutput } from "../Terminal";
import type { FileRow, Snapshot } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { FileStatusBadge, Pill } from "../widgets";

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
		<div className="flex h-full min-h-0 flex-col gap-2">
			<input
				className="input-base input-shadow-default input-state-focus h-input w-full shrink-0 rounded-lg border text-sm"
				onChange={(e) => setQ(e.target.value)}
				placeholder="filter files…"
				value={q}
			/>
			<div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
				{filtered.map((f) => (
					<button
						className={cn(
							"flex w-full items-center justify-between gap-2 border-b px-2.5 py-1.5 text-left text-xs last:border-b-0 hover:bg-interactive-secondary-hover",
							active === f.file && "bg-interactive-secondary-hover",
						)}
						key={f.file}
						onClick={() => onPick(f.file)}
						type="button"
					>
						<span className="truncate font-mono text-tertiary-foreground">
							{f.name}
						</span>
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
	const activeFile = socket.sub?.kind === "file" ? socket.sub.key : undefined;
	const row = snap.files.find((f) => f.file === activeFile);
	const showOutput = socket.sub?.kind === "file";
	return (
		<ResizablePanelGroup className="h-full" orientation="horizontal">
			<ResizablePanel defaultSize={28} minSize={18}>
				<div className="h-full min-h-0 pr-3">
					<FileList
						active={activeFile}
						files={snap.files}
						onPick={socket.subscribeFile}
					/>
				</div>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={72}>
				<div className="flex h-full min-h-0 flex-col gap-3 pl-3">
					{row ? (
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<span className="font-mono text-sm">{row.name}</span>
							<FileStatusBadge status={row.status} />
							<Pill tone="green">✓ {row.passed}</Pill>
							<Pill tone="red">✗ {row.failed}</Pill>
							{row.worker ? (
								<span className="text-muted-foreground text-xs">
									on {row.worker}
								</span>
							) : null}
						</div>
					) : (
						<div className="shrink-0 text-muted-foreground text-sm">
							select a file to view its test output
						</div>
					)}
					{row && row.failedTests.length > 0 ? (
						<div className="max-h-32 shrink-0 overflow-auto rounded-lg border border-red-500/30 bg-red-500/5 p-3">
							<div className="mb-1 font-medium text-red-400 text-xs">
								{row.failedTests.length} failing
							</div>
							<ul className="flex flex-col gap-1">
								{row.failedTests.map((t) => (
									<li
										className="font-mono text-xs"
										key={`${t.name}-${t.location ?? ""}`}
									>
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
					{/* WTERM read-only surface — fills the remaining height, scrolls
					    internally, renders ANSI colors instead of raw escapes. */}
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
