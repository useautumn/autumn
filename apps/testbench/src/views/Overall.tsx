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
			<div className="text-sm text-muted-foreground">
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
			<ProgressBar color="bg-green-500" total={snap.run.total} value={snap.run.done} />
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
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Badge variant="blue">{snap.phase}</Badge>
							<span className="text-muted-foreground text-sm font-normal">
								{snap.target} · {snap.workerCount} workers
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<PhaseProgress snap={snap} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{snap.summary ? "Result" : "Live"}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-1.5">
						{snap.summary ? (
							<>
								<InfoRow label="passed" value={snap.summary.passed} />
								<InfoRow label="failed" value={snap.summary.failed} />
								<InfoRow label="crashed" value={snap.summary.crashed} />
								<InfoRow label="wall" value={fmtWall(snap.summary.wallMs)} mono />
								{snap.summary.costLine ? (
									<InfoRow label="cost" mono value={snap.summary.costLine} />
								) : null}
							</>
						) : (
							<>
								<InfoRow label="tests" value={`${snap.run.done}/${snap.run.total}`} />
								<InfoRow label="passed" value={snap.run.passed} />
								<InfoRow label="failed" value={snap.run.failed} />
								<InfoRow label="running" value={snap.run.running} />
							</>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Speed — files completed / sec</CardTitle>
				</CardHeader>
				<CardContent>
					<SpeedChart completions={snap.completions} />
				</CardContent>
			</Card>

			<Card className="py-0">
				<div className="max-h-[420px] overflow-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>File</TableHead>
								<TableHead className="w-24">Status</TableHead>
								<TableHead className="w-20">✓ / ✗</TableHead>
								<TableHead className="w-56">Worker</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{snap.files.map((f) => (
								<TableRow
									className="cursor-pointer"
									key={f.file}
									onClick={() => onOpenFile(f.file)}
								>
									<TableCell className="font-mono text-xs">{f.name}</TableCell>
									<TableCell>
										<FileStatusBadge status={f.status} />
									</TableCell>
									<TableCell className="font-mono text-xs tabular-nums">
										<span className="text-green-500">{f.passed}</span>
										{" / "}
										<span className="text-red-500">{f.failed}</span>
									</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground">
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
