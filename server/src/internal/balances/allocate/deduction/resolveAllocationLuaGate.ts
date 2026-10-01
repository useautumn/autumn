import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	isAllocationScaleCurrent,
	type UsageWindowLimit,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { allocationCycleOf, sharedRowsOf } from "../utils/allocationRows.js";

/** Counters never cap by limit; the allocation gate reads their usage instead. */
const UNBOUNDED_COUNTER_LIMIT = 1e15;

export type AllocationLuaLimit = UsageWindowLimit & {
	allocation_role: "entity" | "claimed";
	/** The gate whose counter this is: its allocated internal feature id. */
	allocation_key: string;
};

export type AllocationLuaGate = {
	key: string;
	shared_ent_ids: Record<string, true>;
	requested: number | null;
	requested_total: number;
	/** The stored scale; Lua re-solves it from the pot when it belongs to another cycle. */
	scale: number;
	scale_is_current: boolean;
};

/** One gate per allocated feature the selection draws, keyed by internal feature id, with their counters; null when none. */
export const resolveAllocationLuaGates = ({
	fullSubject,
	customerEntitlements,
	now,
}: {
	fullSubject: FullSubject;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
}): {
	gates: Record<string, AllocationLuaGate>;
	limits: AllocationLuaLimit[];
} | null => {
	const allocations = fullSubject.customer.balance_allocations;
	if (!allocations) return null;

	const gates: Record<string, AllocationLuaGate> = {};
	const limits: AllocationLuaLimit[] = [];

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
			pinnedId: allocation.parent_customer_entitlement_id,
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
			allocation_key: internalFeatureId,
		});

		gates[internalFeatureId] = {
			key: internalFeatureId,
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
			scale: allocation.scale,
			scale_is_current: isAllocationScaleCurrent({
				allocation,
				cycleEnd: cycle.windowEndAt,
				parentId: cycle.parentId,
			}),
		};
		if (internalEntityId) limits.push(limitOf("entity"));
		limits.push(limitOf("claimed"));
	}
	return limits.length > 0 ? { gates, limits } : null;
};
