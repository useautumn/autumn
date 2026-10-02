import { MAX_ALLOCATED_ENTITIES, RecaseError } from "@autumn/shared";

export const duplicateAllocationEntityError = ({
	entityId,
}: {
	entityId: string;
}): RecaseError =>
	new RecaseError({
		message: `Entity ${entityId} appears more than once in allocations`,
		code: "duplicate_allocation_entity",
		statusCode: 400,
	});

export const noSharedBalanceForIntervalError = ({
	featureId,
	interval,
}: {
	featureId: string;
	interval: string;
}): RecaseError =>
	new RecaseError({
		message: `Customer has no shared ${featureId} balance that resets every ${interval}`,
		code: "no_shared_balance_for_interval",
		statusCode: 400,
	});

export const allocationsNotSupportedForUnlimitedError = ({
	featureId,
}: {
	featureId: string;
}): RecaseError =>
	new RecaseError({
		message: `Shared ${featureId} balance is unlimited, so it can't be allocated`,
		code: "allocations_not_supported_for_unlimited",
		statusCode: 400,
	});

export const allocationIntervalMismatchError = ({
	featureId,
	interval,
}: {
	featureId: string;
	interval: string;
}): RecaseError =>
	new RecaseError({
		message: `Customer already allocates ${featureId} on the ${interval} interval`,
		code: "allocation_interval_mismatch",
		statusCode: 400,
	});

export const allocationExceedsAvailableError = ({
	shortfall,
}: {
	shortfall: number;
}): RecaseError =>
	new RecaseError({
		message: `Allocations exceed available shared credits by ${shortfall}`,
		code: "allocation_exceeds_available",
		statusCode: 400,
	});

export const tooManyAllocatedEntitiesError = ({
	featureId,
}: {
	featureId: string;
}): RecaseError =>
	new RecaseError({
		message: `A ${featureId} allocation can hold at most ${MAX_ALLOCATED_ENTITIES} entities`,
		code: "too_many_allocated_entities",
		statusCode: 400,
	});
