import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/** mm:ss-style live elapsed timer, re-rendering once a second from `since` (epoch ms). */
export function Elapsed({ since }: { since: number }) {
	const [, tick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => tick((n) => n + 1), 1000);
		return () => clearInterval(id);
	}, []);
	const s = Math.max(0, Math.round((Date.now() - since) / 1000));
	const m = Math.floor(s / 60);
	return (
		<span className="font-mono tabular-nums">
			{m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`}
		</span>
	);
}

/** A sweeping bar for work with no countable total (warm build / snapshot). */
export function IndeterminateBar({ color = "bg-sandbox" }: { color?: string }) {
	return (
		<div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
			<span className={cn("tb-indeterminate", color)} />
		</div>
	);
}

/** Warm-up stages — labels MUST stay in step with WARM_STAGE_PATTERNS (store.ts). */
const WARM_STAGES = [
	"base image",
	"checkout",
	"install",
	"migrate",
	"seed",
	"snapshot",
];

/** Horizontal stepper marking warm-up stages done / active / pending. */
export function WarmStepper({ stage }: { stage: number }) {
	return (
		<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
			{WARM_STAGES.map((label, i) => {
				const done = i < stage;
				const active = i === stage;
				return (
					<span className="flex items-center gap-1.5" key={label}>
						<span
							className={cn(
								"flex size-4 items-center justify-center rounded-full border text-[9px] tabular-nums",
								done && "border-green-500 bg-green-500/15 text-green-500",
								active &&
									"animate-pulse border-sandbox bg-sandbox/15 text-sandbox",
								!(done || active) && "border-border text-subtle",
							)}
						>
							{done ? "✓" : i + 1}
						</span>
						<span
							className={cn(
								"text-xs",
								active && "text-foreground",
								done && "text-muted-foreground",
								!(done || active) && "text-subtle",
							)}
						>
							{label}
						</span>
						{i < WARM_STAGES.length - 1 ? (
							<span className="text-subtle text-xs">·</span>
						) : null}
					</span>
				);
			})}
		</div>
	);
}

/** Compact per-worker status grid (booting → ready → dead) for the fan-out phase. */
export function WorkerDots({
	workers,
}: {
	workers: { name: string; status: string }[];
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{workers.map((w) => (
				<span
					className={cn(
						"size-2.5 rounded-[3px]",
						w.status === "ready" && "bg-green-500",
						w.status === "booting" && "animate-pulse bg-sandbox",
						w.status === "dead" && "bg-destructive",
					)}
					key={w.name}
					title={`${w.name} · ${w.status}`}
				/>
			))}
		</div>
	);
}

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
