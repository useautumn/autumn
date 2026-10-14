import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

export const BalanceAllocationSchema = z.object({
	feature_id: z.string(),
	interval: z.enum(EntInterval),
	scale: z.number().min(0).max(1),
	scale_cycle_end: z.number().nullish(),
	parent_customer_entitlement_id: z.string().nullish(),
	amounts: z.record(z.string(), z.number().nonnegative()),
});

export const BalanceAllocationsSchema = z.record(
	z.string(),
	BalanceAllocationSchema,
);

export type BalanceAllocation = z.infer<typeof BalanceAllocationSchema>;
export type BalanceAllocations = z.infer<typeof BalanceAllocationsSchema>;

export const ALLOCATION_USAGE_WINDOW_FILTER_KEY = "__allocation__";

type StoredScale = Pick<
	BalanceAllocation,
	"scale" | "scale_cycle_end" | "parent_customer_entitlement_id"
>;

export const isAllocationScaleCurrent = ({
	allocation,
	cycleEnd,
	parentId,
}: {
	allocation: StoredScale;
	cycleEnd: number;
	parentId: string;
}) =>
	allocation.scale_cycle_end === cycleEnd &&
	allocation.parent_customer_entitlement_id === parentId;

export const effectiveAllocationScale = ({
	allocation,
	cycleEnd,
	parentId,
	sharedRemaining,
	claimed,
	requestedTotal,
}: {
	allocation: StoredScale;
	cycleEnd: number;
	parentId: string;
	sharedRemaining: number;
	claimed: number;
	requestedTotal: number;
}) => {
	if (isAllocationScaleCurrent({ allocation, cycleEnd, parentId }))
		return allocation.scale;
	if (requestedTotal <= 0) return 1;
	return Math.min(
		1,
		(Math.max(0, sharedRemaining) + Math.max(0, claimed)) / requestedTotal,
	);
};
