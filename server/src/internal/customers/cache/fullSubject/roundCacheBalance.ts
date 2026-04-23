import type { SubjectBalance } from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * Round a number to avoid floating-point precision issues from Lua 5.1 double arithmetic.
 * Uses Decimal.js toDecimalPlaces(10) — enough precision while eliminating float drift.
 */
export const roundCacheBalance = (
	value: number | null | undefined,
): number => {
	if (value === null || value === undefined) return 0;
	return new Decimal(value).toDecimalPlaces(10).toNumber();
};

/**
 * Round all balance-related numeric fields on a SubjectBalance in-place.
 * Handles top-level fields, entity-scoped balances, and rollover balances.
 */
export const roundSubjectBalance = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): SubjectBalance => {
	subjectBalance.balance = roundCacheBalance(subjectBalance.balance);

	if (subjectBalance.adjustment !== null && subjectBalance.adjustment !== undefined)
		subjectBalance.adjustment = roundCacheBalance(subjectBalance.adjustment);

	if (subjectBalance.additional_balance !== null && subjectBalance.additional_balance !== undefined)
		subjectBalance.additional_balance = roundCacheBalance(subjectBalance.additional_balance);

	if (subjectBalance.entities && typeof subjectBalance.entities === "object") {
		for (const entityId of Object.keys(subjectBalance.entities)) {
			const entityData = subjectBalance.entities[entityId];
			if (!entityData || typeof entityData !== "object") continue;

			if (entityData.balance !== null && entityData.balance !== undefined)
				entityData.balance = roundCacheBalance(entityData.balance);

			if (entityData.adjustment !== null && entityData.adjustment !== undefined)
				entityData.adjustment = roundCacheBalance(entityData.adjustment);
		}
	}

	if (subjectBalance.rollovers && Array.isArray(subjectBalance.rollovers)) {
		for (const rollover of subjectBalance.rollovers) {
			if (rollover.balance !== null && rollover.balance !== undefined)
				rollover.balance = roundCacheBalance(rollover.balance);
		}
	}

	return subjectBalance;
};
