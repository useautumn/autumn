import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

/** One feature's split of shared credits across entities; `amounts` holds requested credits by internal entity id. */
export const BalanceAllocationSchema = z.object({
	feature_id: z.string(),
	interval: z.enum(EntInterval),
	/** ≤ 1; below 1 only while the pot can't cover every unused promise. Derived, recomputed on pot changes. */
	scale: z.number(),
	/** End of the cycle the scale was solved for; a scale from an earlier cycle reads as 1. */
	scale_cycle_end: z.number().nullish(),
	amounts: z.record(z.string(), z.number()),
});

/** Keyed by internal feature id. */
export const BalanceAllocationsSchema = z.record(
	z.string(),
	BalanceAllocationSchema,
);

export type BalanceAllocation = z.infer<typeof BalanceAllocationSchema>;
export type BalanceAllocations = z.infer<typeof BalanceAllocationsSchema>;

/** Counter rows for allocations live in usage_windows under this filter key, apart from any usage limit. */
export const ALLOCATION_USAGE_WINDOW_FILTER_KEY = "__allocation__";

/** The stored scale while its cycle is current; a reset restores every share until the next re-fit. */
export const effectiveAllocationScale = ({
	allocation,
	cycleEnd,
}: {
	allocation: Pick<BalanceAllocation, "scale" | "scale_cycle_end">;
	cycleEnd: number;
}) =>
	allocation.scale_cycle_end && allocation.scale_cycle_end !== cycleEnd
		? 1
		: allocation.scale;
