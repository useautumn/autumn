import { type ReactNode, useEffect, useState } from "react";
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

/** Compact per-worker status grid (provisioning → booting → ready → dead/failed). */
export function WorkerDots({
	workers,
}: {
	workers: { name: string; status: string; reason?: string }[];
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{workers.map((w) => (
				<span
					className={cn(
						"size-2.5 rounded-[3px]",
						w.status === "ready" && "bg-green-500",
						w.status === "booting" && "animate-pulse bg-sandbox",
						w.status === "provisioning" && "bg-muted-foreground/25",
						(w.status === "dead" || w.status === "failed") && "bg-destructive",
					)}
					key={w.name}
					title={`${w.name} · ${w.status}${w.reason ? ` — ${w.reason}` : ""}`}
				/>
			))}
		</div>
	);
}

/**
 * Subtle status/tally chip — the app's StatusPill convention: a 10%-tinted
 * background with same-hue text (no bright pastel fill, no hard border), so it
 * sits quietly on the dark surface instead of standing out.
 */
export type PillTone = "green" | "red" | "blue" | "yellow" | "muted";

const PILL_TONE: Record<PillTone, string> = {
	green: "bg-green-500/10 text-green-500",
	red: "bg-red-500/10 text-red-500",
	blue: "bg-sandbox/10 text-sandbox",
	yellow: "bg-amber-500/10 text-amber-500",
	muted: "bg-muted text-tertiary-foreground",
};

export function Pill({
	tone = "muted",
	className,
	children,
}: {
	tone?: PillTone;
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-xs",
				PILL_TONE[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}

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

const FILE_STATUS: Record<string, { tone: PillTone; label: string }> = {
	passed: { tone: "green", label: "pass" },
	failed: { tone: "red", label: "fail" },
	running: { tone: "blue", label: "running" },
	retrying: { tone: "yellow", label: "retry" },
	pending: { tone: "muted", label: "pending" },
	skipped: { tone: "muted", label: "skipped" },
};

/** Triage order for file tables: active work first, then failures to look at. */
const STATUS_RANK: Record<string, number> = {
	running: 0,
	retrying: 1,
	failed: 2,
	pending: 3,
	skipped: 4,
	passed: 5,
};

/** Stable sort: running → retrying → failed → queued → skipped → passed. */
export const sortFilesForTriage = <T extends { status: string; name: string }>(
	files: T[],
): T[] =>
	[...files].sort(
		(a, b) =>
			(STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
			a.name.localeCompare(b.name),
	);

export function FileStatusBadge({ status }: { status: string }) {
	const s = FILE_STATUS[status] ?? FILE_STATUS.pending;
	return <Pill tone={s.tone}>{s.label}</Pill>;
}

const WORKER_STATUS: Record<string, { tone: PillTone; label: string }> = {
	ready: { tone: "green", label: "ready" },
	running: { tone: "blue", label: "running" },
	booting: { tone: "blue", label: "booting" },
	provisioning: { tone: "muted", label: "provisioning" },
	dead: { tone: "red", label: "dead" },
	failed: { tone: "red", label: "failed" },
};

export function WorkerStatusBadge({ status }: { status: string }) {
	const s = WORKER_STATUS[status] ?? WORKER_STATUS.booting;
	return <Pill tone={s.tone}>{s.label}</Pill>;
}

// Literal colors — theme chart vars proved unreliable in this standalone app.
const LINE_COLOR = "#27a7ff";
const GRID_COLOR = "#80808030";

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
	const maxRate = Math.max(0.5, ...data.map((d) => d.rate));
	// Fixed viewBox + preserveAspectRatio=none: renders at any CSS size with no
	// runtime measurement (the failure mode of ResponsiveContainer-style charts).
	const points = data
		.map((d, index) => {
			const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
			const y = 100 - (d.rate / maxRate) * 92;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");
	return (
		<div className="flex h-48 w-full items-stretch gap-1 text-muted-foreground">
			<div className="flex shrink-0 flex-col justify-between pb-4 text-right font-mono text-[10px] tabular-nums">
				<span>{maxRate.toFixed(1)}/s</span>
				<span>0</span>
			</div>
			<div className="flex min-w-0 flex-1 flex-col border-border border-l pl-1.5">
				<svg
					aria-label="files completed per second"
					className="min-h-0 w-full flex-1"
					preserveAspectRatio="none"
					role="img"
					viewBox="0 0 100 100"
				>
					{[25, 50, 75, 100].map((y) => (
						<line
							key={y}
							stroke={GRID_COLOR}
							vectorEffect="non-scaling-stroke"
							x1="0"
							x2="100"
							y1={y}
							y2={y}
						/>
					))}
					<polyline
						fill="none"
						points={points}
						stroke={LINE_COLOR}
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<div className="flex h-4 items-end justify-between font-mono text-[10px] tabular-nums">
					<span>0s</span>
					<span>{maxB * 2}s</span>
				</div>
			</div>
		</div>
	);
}
