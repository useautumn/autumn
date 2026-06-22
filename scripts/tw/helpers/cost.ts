/**
 * Per-run cost ESTIMATE for the `bun tw` swarm.
 *
 * The `@vercel/sandbox` SDK does NOT expose usage metrics for a running sandbox
 * (`totalActiveCpuDurationMs` / `totalDurationMs` / egress / ingress are all
 * `undefined` — verified; they're only on finalized sandboxes via `Sandbox.list`,
 * which needs a static API token we don't have). So we can't read actual usage.
 *
 * Instead we estimate from what we DO know — worker count, vCPUs, provisioned
 * memory (2048 MB/vCPU), and each worker's lifetime — against the Pro rate card.
 * CPU is billed as the full vCPU-hours (an UPPER BOUND: the suite is I/O-bound, so
 * real active-CPU is lower); memory is exact (it's provisioned for the lifetime);
 * network is omitted (unmeasurable, small). Hence "≈ … est".
 */

import { VERCEL_SANDBOX_PRICING } from "../constants.ts";

const MS_PER_HOUR = 3_600_000;
const MB_PER_VCPU = 2048; // Vercel allocates 2048 MB per vCPU
const MB_PER_GB = 1024;

export type CostEstimate = {
	workers: number;
	vcpus: number;
	lifetimeHours: number;
	cpuUsd: number;
	memUsd: number;
	creationsUsd: number;
	totalUsd: number;
};

/**
 * Estimate the cost of `workers` sandboxes, each with `vcpus` vCPUs, alive for
 * `lifetimeMs`. CPU is an upper bound (100% active); memory is exact.
 */
export const estimateCost = ({
	workers,
	vcpus,
	lifetimeMs,
}: {
	workers: number;
	vcpus: number;
	lifetimeMs: number;
}): CostEstimate => {
	const hours = lifetimeMs / MS_PER_HOUR;
	const memGb = (vcpus * MB_PER_VCPU) / MB_PER_GB;
	const cpuUsd =
		workers * vcpus * hours * VERCEL_SANDBOX_PRICING.activeCpuPerHour;
	const memUsd =
		workers * memGb * hours * VERCEL_SANDBOX_PRICING.memoryPerGbHour;
	const creationsUsd =
		(workers / 1_000_000) * VERCEL_SANDBOX_PRICING.creationsPerMillion;
	return {
		workers,
		vcpus,
		lifetimeHours: hours,
		cpuUsd,
		memUsd,
		creationsUsd,
		totalUsd: cpuUsd + memUsd + creationsUsd,
	};
};

const usd = (n: number): string => `$${n.toFixed(2)}`;

/** e.g. `~$1.71 est (cpu ≤$1.28 · mem $0.43) · 51 sandboxes × 2 vCPU · ~6min each`. */
export const formatCost = (c: CostEstimate): string =>
	`~${usd(c.totalUsd)} est (cpu ≤${usd(c.cpuUsd)} · mem ${usd(c.memUsd)}) · ` +
	`${c.workers} sandboxes × ${c.vcpus} vCPU · ~${Math.round(c.lifetimeHours * 60)}min each`;

/** Human wall-clock, e.g. `9m42s` or `48s`. */
export const formatWall = (ms: number): string => {
	const totalSec = Math.round(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return min > 0 ? `${min}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
};
