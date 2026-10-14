import { Decimal } from "decimal.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";

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
		...fullSubject.pooled_customer_entitlements,
	];
	return new Set(
		customerEntitlements.flatMap((customerEntitlement) => [
			customerEntitlement.id,
			...customerEntitlement.rollovers.map((rollover) => rollover.id),
		]),
	);
};

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
