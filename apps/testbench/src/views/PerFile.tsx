import { ListFilter, SkipForward } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { TerminalOutput } from "../Terminal";
import type { FileRow, Snapshot } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { FileStatusBadge, Pill, sortFilesForTriage } from "../widgets";

const ALL_STATUSES: FileRow["status"][] = [
	"running",
	"retrying",
	"failed",
	"pending",
	"skipped",
	"passed",
];

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
	const [statuses, setStatuses] = useState<Set<string>>(new Set());
	const filtered = sortFilesForTriage(
		files.filter(
			(f) =>
				(statuses.size === 0 || statuses.has(f.status)) &&
				(!q || f.name.toLowerCase().includes(q.toLowerCase())),
		),
	);
	const toggleStatus = (status: string) =>
		setStatuses((prev) => {
			const next = new Set(prev);
			if (next.has(status)) {
				next.delete(status);
			} else {
				next.add(status);
			}
			return next;
		});
	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			<div className="flex shrink-0 items-center gap-2">
				<input
					className="input-base input-shadow-default input-state-focus h-input w-full rounded-lg border text-sm"
					onChange={(e) => setQ(e.target.value)}
					placeholder="filter files…"
					value={q}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							className={cn(
								"h-input shrink-0",
								statuses.size > 0 && "text-sandbox",
							)}
							size="icon"
							title="filter by status"
							variant="outline"
						>
							<ListFilter className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{ALL_STATUSES.map((status) => (
							<DropdownMenuCheckboxItem
								checked={statuses.has(status)}
								key={status}
								onCheckedChange={() => toggleStatus(status)}
								onSelect={(e) => e.preventDefault()}
							>
								<FileStatusBadge status={status} />
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
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
				{filtered.length === 0 ? (
					<div className="p-3 text-muted-foreground text-xs">
						no files match the filter
					</div>
				) : null}
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
	const [skipRequested, setSkipRequested] = useState<Set<string>>(new Set());
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
							{row.durationMs ? (
								<Pill tone="muted">{(row.durationMs / 1000).toFixed(1)}s</Pill>
							) : null}
							{row.worker ? (
								<span className="text-muted-foreground text-xs">
									on {row.worker}
								</span>
							) : null}
							{row.status === "pending" ? (
								<Button
									className="ml-auto"
									disabled={skipRequested.has(row.file)}
									onClick={() => {
										socket.skipFile(row.file);
										setSkipRequested((prev) => new Set(prev).add(row.file));
									}}
									size="sm"
									variant="outline"
								>
									<SkipForward className="mr-1.5 size-3.5" />
									{skipRequested.has(row.file) ? "skip requested" : "skip"}
								</Button>
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
