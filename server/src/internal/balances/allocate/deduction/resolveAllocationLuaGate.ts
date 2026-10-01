import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	effectiveAllocationScale,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	type UsageWindowLimit,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { allocationCycleOf, sharedRowsOf } from "../utils/allocationRows.js";

/** Counters never cap by limit; the allocation gate reads their usage instead. */
const UNBOUNDED_COUNTER_LIMIT = 1e15;

export type AllocationLuaLimit = UsageWindowLimit & {
	allocation_role: "entity" | "claimed";
};

export type AllocationLuaGate = {
	shared_ent_ids: Record<string, true>;
	requested: number | null;
	requested_total: number;
	scale: number;
};

/** The allocation gate and its counters for the Lua deduction, or null when the selection draws no allocated credits. */
export const resolveAllocationLuaGate = ({
	fullSubject,
	customerEntitlements,
	now,
}: {
	fullSubject: FullSubject;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
}): { gate: AllocationLuaGate; limits: AllocationLuaLimit[] } | null => {
	const allocations = fullSubject.customer.balance_allocations;
	if (!allocations) return null;

	for (const [internalFeatureId, allocation] of Object.entries(allocations)) {
		const sharedRows = sharedRowsOf({
			customerEntitlements,
			featureId: allocation.feature_id,
			interval: allocation.interval,
		});
		const cycle = allocationCycleOf({
			sharedRows,
			interval: allocation.interval,
			now,
		});
		if (!cycle) continue;

		const internalEntityId = fullSubject.entity?.internal_id ?? null;
		const limitOf = (
			role: AllocationLuaLimit["allocation_role"],
		): AllocationLuaLimit => ({
			feature_id: allocation.feature_id,
			internal_feature_id: internalFeatureId,
			internal_customer_id: fullSubject.customer.internal_id,
			key: `allocation:${internalFeatureId}:${role === "entity" ? internalEntityId : "claimed"}`,
			dimension_type: "balance",
			dimension_feature_id: null,
			scope_type: role === "entity" ? "entity" : "customer",
			entity_id: null,
			internal_entity_id: role === "entity" ? internalEntityId : null,
			filter_key: ALLOCATION_USAGE_WINDOW_FILTER_KEY,
			filter_properties: null,
			interval: allocation.interval,
			window_start_at: cycle.windowStartAt,
			window_end_at: cycle.windowEndAt,
			limit: UNBOUNDED_COUNTER_LIMIT,
			anchor_customer_entitlement_id: cycle.parentId,
			anchor_mode: "billing_cycle",
			new_window_id: generateId("uw"),
			allocation_role: role,
		});

		return {
			gate: {
				shared_ent_ids: Object.fromEntries(
					sharedRows.map((row) => [row.id, true as const]),
				),
				requested: internalEntityId
					? (allocation.amounts[internalEntityId] ?? null)
					: null,
				requested_total: Object.values(allocation.amounts).reduce(
					(sum, amount) => sum + amount,
					0,
				),
				scale: effectiveAllocationScale({
					allocation,
					cycleEnd: cycle.windowEndAt,
				}),
			},
			limits: internalEntityId
				? [limitOf("entity"), limitOf("claimed")]
				: [limitOf("claimed")],
		};
	}
	return null;
};
