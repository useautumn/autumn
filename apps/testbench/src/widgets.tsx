import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type BadgeVariant =
	| "green"
	| "red"
	| "blue"
	| "yellow"
	| "secondary"
	| "default";

export function ProgressBar({
	value,
	total,
	className,
	color = "bg-primary",
}: {
	value: number;
	total: number;
	className?: string;
	color?: string;
}) {
	const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full transition-all", color)}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className="w-14 text-right font-mono text-xs text-muted-foreground tabular-nums">
				{value}/{total}
			</span>
		</div>
	);
}

const FILE_STATUS: Record<string, { v: BadgeVariant; label: string }> = {
	passed: { v: "green", label: "pass" },
	failed: { v: "red", label: "fail" },
	running: { v: "blue", label: "running" },
	retrying: { v: "yellow", label: "retry" },
	pending: { v: "secondary", label: "pending" },
};

export function FileStatusBadge({ status }: { status: string }) {
	const s = FILE_STATUS[status] ?? FILE_STATUS.pending;
	return <Badge variant={s.v}>{s.label}</Badge>;
}

const WORKER_STATUS: Record<string, { v: BadgeVariant; label: string }> = {
	ready: { v: "green", label: "ready" },
	booting: { v: "blue", label: "booting" },
	dead: { v: "red", label: "dead" },
};

export function WorkerStatusBadge({ status }: { status: string }) {
	const s = WORKER_STATUS[status] ?? WORKER_STATUS.booting;
	return <Badge variant={s.v}>{s.label}</Badge>;
}

const SPEED_CONFIG = {
	rate: { label: "files/sec", color: "var(--chart-1)" },
};

/** Live files-completed-per-second chart, binning completion timestamps into 2s buckets. */
export function SpeedChart({ completions }: { completions: number[] }) {
	if (completions.length < 2) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				waiting for completions…
			</div>
		);
	}
	const t0 = completions[0];
	const bucketMs = 2000;
	const buckets = new Map<number, number>();
	for (const t of completions) {
		const b = Math.floor((t - t0) / bucketMs);
		buckets.set(b, (buckets.get(b) ?? 0) + 1);
	}
	const maxB = Math.max(...buckets.keys());
	const data: { t: number; rate: number }[] = [];
	for (let b = 0; b <= maxB; b++) {
		data.push({ t: b * 2, rate: (buckets.get(b) ?? 0) / 2 });
	}
	return (
		<ChartContainer className="h-48 w-full" config={SPEED_CONFIG}>
			<LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
				<CartesianGrid stroke="var(--chart-grid-stroke)" vertical={false} />
				<XAxis
					axisLine={false}
					dataKey="t"
					fontSize={11}
					tickFormatter={(v) => `${v}s`}
					tickLine={false}
				/>
				<YAxis axisLine={false} fontSize={11} tickLine={false} width={28} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Line
					dataKey="rate"
					dot={false}
					isAnimationActive={false}
					stroke="var(--color-rate)"
					strokeWidth={2}
					type="monotone"
				/>
			</LineChart>
		</ChartContainer>
	);
}
