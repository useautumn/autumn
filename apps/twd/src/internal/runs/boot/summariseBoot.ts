import type { WorkerState } from "../../../api/contract.ts";

const quantile = (sorted: number[], q: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

const stats = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return {
		p50: quantile(sorted, 0.5),
		p90: quantile(sorted, 0.9),
		max: sorted.at(-1) ?? 0,
	};
};

export type BootSummary = {
	measured: number;
	total: { p50: number; p90: number; max: number };
	steps: { step: string; p50: number; p90: number; max: number }[];
	slowest: { worker: string; totalMs: number }[];
};

/** Per-step boot percentiles across the workers that reported a timeline, in boot order. */
export const summariseBoot = (workers: WorkerState[]): BootSummary | null => {
	const booted = workers.filter((w) => w.boot);
	if (booted.length === 0) return null;
	const byStep = new Map<string, number[]>();
	for (const w of booted)
		for (const { step, ms } of w.boot?.steps ?? [])
			byStep.set(step, [...(byStep.get(step) ?? []), ms]);
	return {
		measured: booted.length,
		total: stats(booted.flatMap((w) => w.boot?.totalMs ?? [])),
		steps: [...byStep].map(([step, values]) => ({ step, ...stats(values) })),
		slowest: booted
			.map((w) => ({ worker: w.name, totalMs: w.boot?.totalMs ?? 0 }))
			.sort((a, b) => b.totalMs - a.totalMs)
			.slice(0, 5),
	};
};
