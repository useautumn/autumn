import {
	allocationGranted,
	MAX_ALLOCATED_ENTITIES,
	packAllocationGap,
	solveAllocationScale,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	allocationExceedsAvailableError,
	tooManyAllocatedEntitiesError,
} from "../allocateBalancesErrors.js";

export type AllocationEntry = { internalEntityId: string; amount: number };

export type AllocationPlan = {
	amounts: Record<string, number>;
	scale: number;
	entityUsage: Record<string, number>;
	claimed: number;
	seededEntityIds: string[];
};

const unusedOf = ({
	amounts,
	entityUsage,
}: {
	amounts: Record<string, number>;
	entityUsage: Record<string, number>;
}) =>
	Object.entries(amounts).reduce(
		(sum, [id, amount]) =>
			sum.plus(Decimal.max(0, new Decimal(amount).minus(entityUsage[id] ?? 0))),
		new Decimal(0),
	);

export const computeAllocationPlan = ({
	featureId,
	isFirstCall,
	sharedGranted,
	sharedRemaining,
	currentAmounts,
	currentUsage,
	entries,
}: {
	featureId: string;
	isFirstCall: boolean;
	sharedGranted: number;
	sharedRemaining: number;
	currentAmounts: Record<string, number>;
	currentUsage: Record<string, number>;
	entries: AllocationEntry[];
}): AllocationPlan => {
	const amounts = { ...currentAmounts };
	for (const { internalEntityId, amount } of entries) {
		if (amount === 0) delete amounts[internalEntityId];
		else amounts[internalEntityId] = amount;
	}
	const addsEntity = entries.some(
		(entry) =>
			entry.amount > 0 && currentAmounts[entry.internalEntityId] === undefined,
	);
	if (addsEntity && Object.keys(amounts).length > MAX_ALLOCATED_ENTITIES)
		throw tooManyAllocatedEntitiesError({ featureId });

	let entityUsage = currentUsage;
	let seededEntityIds: string[] = [];
	if (isFirstCall) {
		const requested = Object.values(amounts).reduce(
			(sum, amount) => sum.plus(amount),
			new Decimal(0),
		);
		if (requested.gt(sharedGranted))
			throw allocationExceedsAvailableError({
				shortfall: requested.minus(sharedGranted).toNumber(),
			});
		entityUsage = packAllocationGap({
			gap: new Decimal(sharedGranted).minus(sharedRemaining).toNumber(),
			entries: entries
				.filter((entry) => entry.amount > 0)
				.map((entry) => ({
					entityId: entry.internalEntityId,
					amount: entry.amount,
				})),
		});
		seededEntityIds = Object.keys(entityUsage);
	} else {
		const before = unusedOf({ amounts: currentAmounts, entityUsage });
		const after = unusedOf({ amounts, entityUsage });
		if (after.gt(before) && after.gt(sharedRemaining))
			throw allocationExceedsAvailableError({
				shortfall: after.minus(sharedRemaining).toNumber(),
			});
	}

	const usageEntries = Object.entries(amounts).map(([id, requested]) => ({
		requested,
		usage: entityUsage[id] ?? 0,
	}));
	return {
		amounts,
		scale: solveAllocationScale({ sharedRemaining, entries: usageEntries }),
		entityUsage,
		claimed: usageEntries
			.reduce(
				(sum, entry) => sum.plus(Decimal.min(entry.usage, entry.requested)),
				new Decimal(0),
			)
			.toNumber(),
		seededEntityIds,
	};
};

export const allocationPlanToEntityNumbers = ({
	plan,
	internalEntityId,
}: {
	plan: AllocationPlan;
	internalEntityId: string;
}) => {
	const amount = plan.amounts[internalEntityId] ?? 0;
	const usage = plan.entityUsage[internalEntityId] ?? 0;
	const granted = allocationGranted({
		requested: amount,
		usage,
		scale: plan.scale,
	});
	return {
		amount,
		granted,
		usage,
		remaining: Decimal.max(0, new Decimal(granted).minus(usage)).toNumber(),
	};
};
