import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { InfoRow } from "@/components/v2/InfoRow";
import type { Snapshot } from "../types";
import { FileStatusBadge, ProgressBar, SpeedChart } from "../widgets";

const fmtWall = (ms: number): string => {
	const s = Math.round(ms / 1000);
	const m = Math.floor(s / 60);
	return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};

function PhaseProgress({ snap }: { snap: Snapshot }) {
	if (snap.phase === "warm") {
		return (
			<div className="text-muted-foreground text-sm">
				building / warming the snapshot…
			</div>
		);
	}
	if (snap.phase === "fanout") {
		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">stripe</span>
					<ProgressBar
						total={snap.fanout.stripeTotal}
						value={snap.fanout.stripeDone}
					/>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">workers</span>
					<ProgressBar
						color="bg-sandbox"
						total={snap.fanout.workersTotal}
						value={snap.fanout.workersReady}
					/>
				</div>
			</div>
		);
	}
	if (snap.phase === "teardown") {
		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">sandboxes</span>
					<ProgressBar
						color="bg-yellow-400"
						total={snap.teardown.sandboxesTotal}
						value={snap.teardown.sandboxesDone}
					/>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">accounts</span>
					<ProgressBar
						color="bg-yellow-400"
						total={snap.teardown.accountsTotal}
						value={snap.teardown.accountsDone}
					/>
				</div>
			</div>
		);
	}
	// run / done
	return (
		<div className="flex flex-col gap-3">
			<ProgressBar
				color="bg-green-500"
				total={snap.run.total}
				value={snap.run.done}
			/>
			<div className="flex flex-wrap gap-2">
				<Badge variant="green">✓ {snap.run.passed}</Badge>
				<Badge variant="red">✗ {snap.run.failed}</Badge>
				<Badge variant="blue">{snap.run.running} running</Badge>
				<Badge variant="yellow">{snap.run.retrying} retrying</Badge>
			</div>
		</div>
	);
}

export function Overall({
	snap,
	onOpenFile,
}: {
	snap: Snapshot;
	onOpenFile: (file: string) => void;
}) {
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-3">
				<Card className="gap-2 lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Badge variant="blue">{snap.phase}</Badge>
							<span className="font-normal text-muted-foreground text-sm">
								{snap.target} · {snap.workerCount} workers
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<PhaseProgress snap={snap} />
					</CardContent>
				</Card>

				<Card className="gap-2">
					<CardHeader>
						<CardTitle>{snap.summary ? "Result" : "Live"}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-1.5">
						{snap.summary ? (
							<>
								<InfoRow label="passed" value={snap.summary.passed} />
								<InfoRow label="failed" value={snap.summary.failed} />
								<InfoRow label="crashed" value={snap.summary.crashed} />
								<InfoRow
									label="wall"
									mono
									value={fmtWall(snap.summary.wallMs)}
								/>
								{snap.summary.costLine ? (
									<InfoRow label="cost" mono value={snap.summary.costLine} />
								) : null}
							</>
						) : (
							<>
								<InfoRow
									label="tests"
									value={`${snap.run.done}/${snap.run.total}`}
								/>
								<InfoRow label="passed" value={snap.run.passed} />
								<InfoRow label="failed" value={snap.run.failed} />
								<InfoRow label="running" value={snap.run.running} />
							</>
						)}
					</CardContent>
				</Card>
			</div>

			<Card className="shrink-0 gap-2">
				<CardHeader>
					<CardTitle>Speed — files completed / sec</CardTitle>
				</CardHeader>
				<CardContent>
					<SpeedChart completions={snap.completions} />
				</CardContent>
			</Card>

			{/* The file table owns the remaining height and scrolls INTERNALLY — the
			    header stays sticky, the page never grows past one screen. */}
			<Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
				<div className="min-h-0 flex-1 overflow-auto">
					<Table className="p-0">
						<TableHeader className="sticky top-0 z-20 bg-card">
							<TableRow className="border-b">
								<TableHead className="px-3">File</TableHead>
								<TableHead className="w-24 px-3">Status</TableHead>
								<TableHead className="w-20 px-3">✓ / ✗</TableHead>
								<TableHead className="w-56 px-3">Worker</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{snap.files.map((f) => (
								<TableRow
									className="cursor-pointer border-b hover:bg-interactive-secondary-hover"
									key={f.file}
									onClick={() => onOpenFile(f.file)}
								>
									<TableCell className="px-3 font-medium font-mono text-foreground text-xs">
										{f.name}
									</TableCell>
									<TableCell className="px-3">
										<FileStatusBadge status={f.status} />
									</TableCell>
									<TableCell className="px-3 font-mono text-xs tabular-nums">
										<span className="text-green-500">{f.passed}</span>
										{" / "}
										<span className="text-red-500">{f.failed}</span>
									</TableCell>
									<TableCell className="px-3 font-mono text-muted-foreground text-xs">
										{f.worker ?? "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</Card>
		</div>
	);
}
