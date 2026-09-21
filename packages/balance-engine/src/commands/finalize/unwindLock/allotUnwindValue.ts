import { Decimal } from "decimal.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";

/** The ids of every balance row the subject still holds; a lock's delta on anything else has nothing to land on. */
const heldRowIdsOf = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): Set<string> => {
	// Unfiltered on purpose: a row that has expired since the lock still takes its refund.
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

/** Spreads `unwindValue` over the lock's deltas, newest first: how much of each to give back, and what no held row can take. */
export const allotUnwindValue = ({
	fullSubject,
	lockDeltas,
	unwindValue,
}: {
	fullSubject: WorkerFullSubject;
	lockDeltas: DeductionDelta[];
	unwindValue: number;
}): {
	allotments: { delta: DeductionDelta; taken: Decimal }[];
	skippedValue: number;
} => {
	const heldRowIds = heldRowIdsOf({ fullSubject });
	const allotments: { delta: DeductionDelta; taken: Decimal }[] = [];
	let remaining = new Decimal(unwindValue);
	let skipped = new Decimal(0);

	for (const delta of [...lockDeltas].reverse()) {
		if (remaining.lte(0)) break;
		const deltaMagnitude = new Decimal(delta.valueDelta).abs();
		if (deltaMagnitude.isZero()) continue;
		const taken = Decimal.min(remaining, deltaMagnitude);
		remaining = remaining.minus(taken);
		if (heldRowIds.has(delta.id)) allotments.push({ delta, taken });
		else skipped = skipped.plus(taken);
	}
	return { allotments, skippedValue: skipped.toNumber() };
};
