/**
 * Per-run cost estimate for the `bun tw` swarm, from the `@vercel/sandbox` usage
 * getters × the Pro rate card (`VERCEL_SANDBOX_PRICING`). The SDK exposes usage
 * metrics but NOT dollars, so we translate. Read each sandbox's metrics RIGHT
 * BEFORE teardown deletes it (they're final by then), accumulate, and render one
 * summary line. It's an estimate — sanity-check against the Vercel dashboard.
 */

import type { Sandbox } from "@vercel/sandbox";
import { VERCEL_SANDBOX_PRICING } from "../constants.ts";

const MS_PER_HOUR = 3_600_000;
const BYTES_PER_GB = 1_000_000_000;
const MB_PER_GB = 1024;

/** Raw usage for one sandbox (any field may be absent on an older SDK / dead sandbox). */
export type SandboxUsage = {
	activeCpuMs: number;
	durationMs: number;
	egressBytes: number;
	ingressBytes: number;
	memoryMb: number;
};

export type CostBreakdown = {
	sandboxCount: number;
	cpuUsd: number;
	memUsd: number;
	netUsd: number;
	creationsUsd: number;
	totalUsd: number;
	/** Aggregate raw metrics, for the detail line. */
	activeCpuHours: number;
	transferGb: number;
};

/** Read a sandbox's usage getters defensively (any may be undefined → 0). */
export const readSandboxUsage = (sandbox: Sandbox): SandboxUsage => {
	const s = sandbox as unknown as Record<string, number | undefined>;
	const num = (v: number | undefined): number =>
		typeof v === "number" && Number.isFinite(v) ? v : 0;
	return {
		activeCpuMs: num(s.totalActiveCpuDurationMs),
		durationMs: num(s.totalDurationMs),
		egressBytes: num(s.totalEgressBytes),
		ingressBytes: num(s.totalIngressBytes),
		memoryMb: num(s.memory),
	};
};

/**
 * Aggregate per-sandbox usage into a dollar estimate.
 *
 * NOTE on Active CPU: we treat `totalActiveCpuDurationMs` as the billable
 * active-CPU duration as-is (NOT multiplied by vCPU count) — Vercel bills "Active
 * CPU" by measured active CPU time. If the dashboard disagrees this is the knob
 * to revisit.
 */
export const computeCost = (usages: SandboxUsage[]): CostBreakdown => {
	let activeCpuMs = 0;
	let memGbMs = 0;
	let transferBytes = 0;
	for (const u of usages) {
		activeCpuMs += u.activeCpuMs;
		memGbMs += (u.memoryMb / MB_PER_GB) * u.durationMs;
		transferBytes += u.egressBytes + u.ingressBytes;
	}

	const activeCpuHours = activeCpuMs / MS_PER_HOUR;
	const memGbHours = memGbMs / MS_PER_HOUR;
	const transferGb = transferBytes / BYTES_PER_GB;

	const cpuUsd = activeCpuHours * VERCEL_SANDBOX_PRICING.activeCpuPerHour;
	const memUsd = memGbHours * VERCEL_SANDBOX_PRICING.memoryPerGbHour;
	const netUsd = transferGb * VERCEL_SANDBOX_PRICING.dataTransferPerGb;
	const creationsUsd =
		(usages.length / 1_000_000) * VERCEL_SANDBOX_PRICING.creationsPerMillion;

	return {
		sandboxCount: usages.length,
		cpuUsd,
		memUsd,
		netUsd,
		creationsUsd,
		totalUsd: cpuUsd + memUsd + netUsd + creationsUsd,
		activeCpuHours,
		transferGb,
	};
};

const usd = (n: number): string => `$${n.toFixed(2)}`;

/** One-line cost summary, e.g. `~$0.74 (cpu $0.41 · mem $0.28 · net $0.05) · 50 sandboxes`. */
export const formatCost = (cost: CostBreakdown): string =>
	`~${usd(cost.totalUsd)} (cpu ${usd(cost.cpuUsd)} · mem ${usd(cost.memUsd)} · net ${usd(cost.netUsd)}) · ${cost.sandboxCount} sandbox${cost.sandboxCount === 1 ? "" : "es"}`;

/** Human wall-clock, e.g. `9m42s` or `48s`. */
export const formatWall = (ms: number): string => {
	const totalSec = Math.round(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return min > 0 ? `${min}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
};
