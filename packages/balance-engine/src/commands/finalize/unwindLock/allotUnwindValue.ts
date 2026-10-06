import { Decimal } from "decimal.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import { fullSubjectToHeldRows } from "../../../utils/subjectUtils/convertSubjectUtils.js";

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
	// Keep expired/past-due rows eligible as before; only an actual refill makes
	// their reservation stale. Rollover rows have their own identity.
	const heldRows = fullSubjectToHeldRows({ fullSubject });
	const heldRowIds = new Set(
		heldRows.flatMap((row) => [
			row.id,
			...row.rollovers.map((rollover) => rollover.id),
		]),
	);
	const resetAtById = new Map(
		heldRows.map((row) => [row.id, row.balance_reset_at ?? 0]),
	);
	const allotments: { delta: DeductionDelta; taken: Decimal }[] = [];
	let remaining = new Decimal(unwindValue);
	let skipped = new Decimal(0);

	for (const delta of [...lockDeltas].reverse()) {
		if (remaining.lte(0)) break;
		const deltaMagnitude = new Decimal(delta.valueDelta).abs();
		if (deltaMagnitude.isZero()) continue;
		const taken = Decimal.min(remaining, deltaMagnitude);
		remaining = remaining.minus(taken);
		// A refill replaced this hold. Consume its share without refunding it or
		// forwarding it to another live row through missing-row compensation.
		if (
			delta.table === "customerEntitlements" &&
			delta.balanceResetAt !== undefined &&
			resetAtById.has(delta.id) &&
			delta.balanceResetAt !== resetAtById.get(delta.id)
		)
			continue;
		if (heldRowIds.has(delta.id)) allotments.push({ delta, taken });
		else skipped = skipped.plus(taken);
	}
	return { allotments, skippedValue: skipped.toNumber() };
};
