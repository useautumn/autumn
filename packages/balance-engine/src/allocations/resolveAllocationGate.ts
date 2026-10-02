import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	type BalanceAllocation,
	effectiveAllocationScale,
	getUsageWindowBounds,
	type UsageWindowLimit,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DeductionSelection } from "../deduction/types/deductionRequest.js";
import type { DeductionRow } from "../deduction/types/deductionRow.js";
import { liveUsageWindowOf } from "../deduction/utils/limits/usageWindows.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../models/subject/workerFullSubject.js";
import { pickAllocationParent } from "./allocationMath.js";

/** Everything the draw needs to hold an entity to its share of the customer's shared credits. */
export type AllocationGate = {
	sharedRowIds: Set<string>;
	scale: number;
	/** The subject entity's requested share; null for customer-level tracks and entities without one. */
	ownRequested: number | null;
	requestedTotal: number;
	/** What the shared rows held before this deduction. */
	sharedRemaining: number;
	/** Shared credits the subject entity used this cycle; null for customer-level tracks. */
	entityCounter: UsageWindowLimit | null;
	/** Σ min(usage, requested) across allocated entities this cycle. */
	claimedCounter: UsageWindowLimit;
};

const isCustomerLevel = (
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct,
) =>
	customerEntitlement.internal_entity_id == null &&
	(customerEntitlement.customer_product?.internal_entity_id ?? null) === null;

const isSharedRow = ({
	customerEntitlement,
	allocation,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	allocation: BalanceAllocation;
}) =>
	isCustomerLevel(customerEntitlement) &&
	customerEntitlement.entitlement.feature.id === allocation.feature_id &&
	customerEntitlement.entitlement.interval === allocation.interval;

const allocationCounter = ({
	fullSubject,
	allocation,
	internalFeatureId,
	internalEntityId,
	bounds,
	anchorId,
}: {
	fullSubject: WorkerFullSubject;
	allocation: BalanceAllocation;
	internalFeatureId: string;
	internalEntityId: string | null;
	bounds: { windowStartAt: number; windowEndAt: number };
	anchorId: string;
}): UsageWindowLimit => ({
	feature_id: allocation.feature_id,
	internal_feature_id: internalFeatureId,
	internal_customer_id: fullSubject.customer.internal_id,
	key: `allocation:${internalFeatureId}:${internalEntityId ?? "claimed"}`,
	dimension_type: "balance",
	dimension_feature_id: null,
	scope_type: internalEntityId ? "entity" : "customer",
	entity_id: null,
	internal_entity_id: internalEntityId,
	filter_key: ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	filter_properties: null,
	interval: allocation.interval,
	window_start_at: bounds.windowStartAt,
	window_end_at: bounds.windowEndAt,
	limit: 0,
	anchor_customer_entitlement_id: anchorId,
	anchor_mode: "billing_cycle",
});

/** One gate per allocated feature the selection draws, keyed by each of its shared row ids; empty when nothing selected is allocated. */
export const resolveAllocationGates = ({
	fullSubject,
	selection,
	customerEntitlements,
	rows,
}: {
	fullSubject: WorkerFullSubject;
	selection: DeductionSelection;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
	rows: DeductionRow[];
}): Map<string, AllocationGate> => {
	const gates = new Map<string, AllocationGate>();
	const allocations = fullSubject.customer.balance_allocations;
	if (!allocations) return gates;

	for (const [internalFeatureId, allocation] of Object.entries(allocations)) {
		const shared = customerEntitlements.filter((customerEntitlement) =>
			isSharedRow({ customerEntitlement, allocation }),
		);
		const parent = pickAllocationParent({
			sharedRows: shared.map((row) => ({
				...row,
				is_pooled_balance: Boolean(row.pooled_balance),
			})),
			pinnedId: allocation.parent_customer_entitlement_id,
		});
		if (!parent?.next_reset_at) continue;

		const bounds = getUsageWindowBounds({
			interval: allocation.interval,
			now: selection.now,
			anchor: parent.next_reset_at,
		});
		const internalEntityId = fullSubject.entity?.internal_id ?? null;
		const sharedRowIds = new Set(shared.map((row) => row.id));
		const sharedRemaining = rows
			.filter((row) => sharedRowIds.has(row.id) && row.entityKey === null)
			.reduce(
				(sum, row) => sum.plus(Decimal.max(0, row.balance)),
				new Decimal(0),
			);
		const requestedTotal = Object.values(allocation.amounts).reduce(
			(sum, amount) => sum.plus(amount),
			new Decimal(0),
		);
		const counterOf = (entityId: string | null) =>
			allocationCounter({
				fullSubject,
				allocation,
				internalFeatureId,
				internalEntityId: entityId,
				bounds,
				anchorId: parent.id,
			});

		const claimedCounter = counterOf(null);
		const claimed =
			liveUsageWindowOf({
				usageWindows: fullSubject.usage_windows,
				now: selection.now,
				limit: claimedCounter,
			})?.usage ?? 0;
		const gate: AllocationGate = {
			sharedRowIds,
			scale: effectiveAllocationScale({
				allocation,
				cycleEnd: bounds.windowEndAt,
				parentId: parent.id,
				sharedRemaining: sharedRemaining.toNumber(),
				claimed: new Decimal(claimed).toNumber(),
				requestedTotal: requestedTotal.toNumber(),
			}),
			ownRequested: internalEntityId
				? (allocation.amounts[internalEntityId] ?? null)
				: null,
			requestedTotal: requestedTotal.toNumber(),
			sharedRemaining: sharedRemaining.toNumber(),
			entityCounter: internalEntityId ? counterOf(internalEntityId) : null,
			claimedCounter,
		};
		for (const id of sharedRowIds) gates.set(id, gate);
	}
	return gates;
};
