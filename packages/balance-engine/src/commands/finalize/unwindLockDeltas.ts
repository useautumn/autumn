import { Decimal } from "decimal.js";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";

/** The ids of every balance row the subject still holds; a lock's delta on anything else has nothing to land on. */
const heldRowIdsOf = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): Set<string> => {
	const customerEntitlements = [
		...fullSubject.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
		...fullSubject.extra_customer_entitlements,
	];
	return new Set(
		customerEntitlements.flatMap((customerEntitlement) => [
			customerEntitlement.id,
			...customerEntitlement.rollovers.map((rollover) => rollover.id),
		]),
	);
};

/** The inverse of `share` of one delta: every counter it moved, moved back by that share. */
const inverseOf = ({
	delta,
	share,
}: {
	delta: DeductionDelta;
	share: Decimal;
}): DeductionDelta => {
	const back = (value: number): number =>
		new Decimal(value).mul(share).neg().toNumber();
	return {
		...delta,
		balanceDelta: back(delta.balanceDelta),
		usageDelta: back(delta.usageDelta),
		valueDelta: back(delta.valueDelta),
		...(delta.usageAttributionDelta && {
			usageAttributionDelta: {
				...delta.usageAttributionDelta,
				units: back(delta.usageAttributionDelta.units),
				credits: back(delta.usageAttributionDelta.credits),
			},
		}),
	};
};

/**
 * Gives back `unwindValue` of what the lock took, newest delta first. Exact and unclamped: a refund may leave
 * a balance above its allowance. What sat on a row that is gone (a plan changed mid-lock) comes back as `skippedValue`.
 */
export const unwindLockDeltas = ({
	fullSubject,
	lockDeltas,
	unwindValue,
}: {
	fullSubject: WorkerFullSubject;
	lockDeltas: DeductionDelta[];
	unwindValue: number;
}): { deltas: DeductionDelta[]; skippedValue: number } => {
	const heldRowIds = heldRowIdsOf({ fullSubject });
	const deltas: DeductionDelta[] = [];
	let remaining = new Decimal(unwindValue);
	let skipped = new Decimal(0);

	for (const delta of [...lockDeltas].reverse()) {
		if (remaining.lte(0)) break;
		const deltaMagnitude = new Decimal(delta.valueDelta).abs();
		if (deltaMagnitude.isZero()) continue;
		const taken = Decimal.min(remaining, deltaMagnitude);
		remaining = remaining.minus(taken);
		if (!heldRowIds.has(delta.id)) {
			skipped = skipped.plus(taken);
			continue;
		}
		deltas.push(inverseOf({ delta, share: taken.div(deltaMagnitude) }));
	}
	return { deltas, skippedValue: skipped.toNumber() };
};
