import { Decimal } from "decimal.js";
import type { BalanceAllocations } from "../../../../../models/cusModels/balanceAllocations/balanceAllocationModels.js";
import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	effectiveAllocationScale,
} from "../../../../../models/cusModels/balanceAllocations/balanceAllocationModels.js";
import type { CustomerEntitlementWithPricesView } from "../../../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import type { Feature } from "../../../../../models/featureModels/featureModels.js";
import {
	allocationGranted,
	pickAllocationParent,
} from "../../../../../utils/balanceAllocationUtils/allocationMath.js";
import { isSameUsageWindow } from "../../../../../utils/usageWindowUtils/classifyUsageWindow/isSameUsageWindow.js";
import { getUsageWindowBounds } from "../../../../../utils/usageWindowUtils/getUsageWindowBounds.js";
import type { ApiBalanceBreakdownV1 } from "../../apiBalanceV1.js";

type AllocationCounterView = {
	feature_id: string;
	internal_feature_id?: string | null;
	internal_entity_id?: string | null;
	filter_key?: string | null;
	window_start_at: number;
	window_end_at: number;
	usage: number;
};

/** A customer balance shows the whole shared pool, or only what customer-level usage may spend. */
export type AllocationView = "pool" | "spendable";

/** What rendering allocations reads of a subject; absent fields mean nothing is allocated. */
export type AllocationSubjectView = {
	customer?: { balance_allocations?: BalanceAllocations | null } | null;
	entity?: { internal_id: string } | null;
	usage_windows?: AllocationCounterView[] | null;
};

const isEntityOwned = (
	customerEntitlement: CustomerEntitlementWithPricesView,
) =>
	Boolean(
		customerEntitlement.internal_entity_id ||
			customerEntitlement.customer_product?.internal_entity_id,
	);

const counterUsage = ({
	subject,
	feature,
	internalEntityId,
	bounds,
}: {
	subject: AllocationSubjectView;
	feature: Pick<Feature, "id" | "internal_id">;
	internalEntityId: string | null;
	bounds: { windowStartAt: number; windowEndAt: number };
}) => {
	const counter = (subject.usage_windows ?? []).find(
		(window) =>
			(window.internal_feature_id
				? window.internal_feature_id === feature.internal_id
				: window.feature_id === feature.id) &&
			(window.internal_entity_id ?? null) === internalEntityId &&
			window.filter_key === ALLOCATION_USAGE_WINDOW_FILTER_KEY &&
			isSameUsageWindow({
				usageWindow: window,
				window: {
					window_start_at: bounds.windowStartAt,
					window_end_at: bounds.windowEndAt,
				},
			}),
	);
	return counter ? Number(counter.usage) : 0;
};

/** Shares `total` over rows in draw order, each up to its capacity; the last row takes any excess. */
const fillInOrder = ({
	total,
	capacities,
}: {
	total: number;
	capacities: number[];
}) => {
	let left = new Decimal(total);
	return capacities.map((capacity, index) => {
		const isLast = index === capacities.length - 1;
		const share = isLast ? left : Decimal.min(left, Decimal.max(0, capacity));
		left = left.minus(share);
		return share.toNumber();
	});
};

/** Removes `held` from a shared row's grants (included first) and remaining. */
const withoutHeld = ({
	item,
	held,
}: {
	item: ApiBalanceBreakdownV1;
	held: number;
}): ApiBalanceBreakdownV1 => {
	const includedCut = Decimal.min(held, Decimal.max(0, item.included_grant));
	return {
		...item,
		included_grant: new Decimal(item.included_grant)
			.minus(includedCut)
			.toNumber(),
		prepaid_grant: new Decimal(item.prepaid_grant)
			.minus(new Decimal(held).minus(includedCut))
			.toNumber(),
		remaining: new Decimal(item.remaining).minus(held).toNumber(),
	};
};

/** Marks every row's source and scopes the shared rows to what the subject may spend; a customer's "pool" view keeps them whole. */
export const applyAllocationsToBreakdown = ({
	subject,
	feature,
	customerEntitlements,
	breakdownItems,
	view = "pool",
	now = Date.now(),
}: {
	subject: AllocationSubjectView;
	feature: Pick<Feature, "id" | "internal_id">;
	customerEntitlements: CustomerEntitlementWithPricesView[];
	breakdownItems: ApiBalanceBreakdownV1[];
	view?: AllocationView;
	now?: number;
}): {
	breakdownItems: ApiBalanceBreakdownV1[];
	totals: { allocated: number; unallocated: number } | null;
	/** What check may draw beyond the displayed remaining; 0 once the rows show only spendable credits. */
	checkRemainingOffset: number | null;
} => {
	const sourced = breakdownItems.map((item, index) => ({
		...item,
		source: isEntityOwned(customerEntitlements[index])
			? ("entity" as const)
			: ("customer" as const),
	}));

	const allocation =
		subject.customer?.balance_allocations?.[feature.internal_id];
	if (!allocation)
		return {
			breakdownItems: sourced,
			totals: null,
			checkRemainingOffset: null,
		};
	const withSource: ApiBalanceBreakdownV1[] = sourced.map((item) => ({
		...item,
		allocation: null,
	}));

	const sharedIndexes = customerEntitlements.flatMap(
		(customerEntitlement, index) =>
			!isEntityOwned(customerEntitlement) &&
			customerEntitlement.entitlement.interval === allocation.interval
				? [index]
				: [],
	);
	const parent = pickAllocationParent({
		sharedRows: sharedIndexes.map((index) => customerEntitlements[index]),
		pinnedId: allocation.parent_customer_entitlement_id,
	});
	if (!parent?.next_reset_at)
		return {
			breakdownItems: withSource,
			totals: null,
			checkRemainingOffset: null,
		};
	const bounds = getUsageWindowBounds({
		interval: allocation.interval,
		now,
		anchor: parent.next_reset_at,
	});

	const requestedTotal = Object.values(allocation.amounts).reduce(
		(sum, amount) => sum.plus(amount),
		new Decimal(0),
	);
	const sharedRemaining = sharedIndexes.reduce(
		(sum, index) => sum.plus(Decimal.max(0, withSource[index].remaining)),
		new Decimal(0),
	);
	const claimed = counterUsage({
		subject,
		feature,
		internalEntityId: null,
		bounds,
	});
	// Matches the engines: a cut stops binding once the pot covers every unused promise.
	const scale = requestedTotal.minus(claimed).lte(sharedRemaining)
		? 1
		: effectiveAllocationScale({
				allocation,
				cycleEnd: bounds.windowEndAt,
				parentId: parent.id,
				sharedRemaining: sharedRemaining.toNumber(),
				claimed,
				requestedTotal: requestedTotal.toNumber(),
			});
	const covered = sharedRemaining.plus(claimed);
	const unallocated =
		scale < 1 ? new Decimal(0) : Decimal.max(0, covered.minus(requestedTotal));

	const unallocatedShares = fillInOrder({
		total: unallocated.toNumber(),
		capacities: sharedIndexes.map((index) =>
			Math.max(0, withSource[index].remaining),
		),
	});
	// Customer-level draws and unallocated entities may only spend unallocated credits.
	const unallocatedOnly = () => {
		const rows = [...withSource];
		sharedIndexes.forEach((index, position) => {
			rows[index] = withoutHeld({
				item: rows[index],
				held: new Decimal(Math.max(0, rows[index].remaining))
					.minus(unallocatedShares[position])
					.toNumber(),
			});
		});
		return rows;
	};

	const internalEntityId = subject.entity?.internal_id ?? null;
	if (!internalEntityId) {
		const totals = {
			allocated: Decimal.min(requestedTotal, covered).toNumber(),
			unallocated: unallocated.toNumber(),
		};
		if (view === "spendable")
			return {
				breakdownItems: unallocatedOnly(),
				totals,
				checkRemainingOffset: 0,
			};
		return {
			breakdownItems: withSource,
			totals,
			checkRemainingOffset: unallocated.minus(sharedRemaining).toNumber(),
		};
	}

	const requested = allocation.amounts[internalEntityId];
	if (requested === undefined)
		return {
			breakdownItems: unallocatedOnly(),
			totals: { allocated: 0, unallocated: unallocated.toNumber() },
			checkRemainingOffset: 0,
		};

	const usage = counterUsage({
		subject,
		feature,
		internalEntityId,
		bounds,
	});
	const granted = allocationGranted({
		requested,
		usage,
		scale,
	});
	const capacities = sharedIndexes.map((index) =>
		new Decimal(withSource[index].included_grant)
			.plus(withSource[index].prepaid_grant)
			.toNumber(),
	);
	const shares = fillInOrder({ total: granted, capacities });
	const usages = fillInOrder({ total: usage, capacities: shares });

	const scoped = [...withSource];
	sharedIndexes.forEach((index, position) => {
		scoped[index] = {
			...scoped[index],
			included_grant: new Decimal(shares[position])
				.plus(unallocatedShares[position])
				.toNumber(),
			prepaid_grant: 0,
			usage: usages[position],
			remaining: Decimal.max(
				0,
				new Decimal(shares[position]).minus(usages[position]),
			)
				.plus(unallocatedShares[position])
				.toNumber(),
			overage: 0,
			allocation: { amount: requested },
		};
	});
	return {
		breakdownItems: scoped,
		totals: { allocated: granted, unallocated: unallocated.toNumber() },
		checkRemainingOffset: 0,
	};
};
