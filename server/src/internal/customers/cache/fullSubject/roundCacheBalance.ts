import { roundCacheBalance, type SubjectBalance } from "@autumn/shared";

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

	if (
		subjectBalance.adjustment !== null &&
		subjectBalance.adjustment !== undefined
	)
		subjectBalance.adjustment = roundCacheBalance(subjectBalance.adjustment);

	if (
		subjectBalance.additional_balance !== null &&
		subjectBalance.additional_balance !== undefined
	)
		subjectBalance.additional_balance = roundCacheBalance(
			subjectBalance.additional_balance,
		);

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
