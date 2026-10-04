import {
	cusEntsToPlanId,
	cusEntsToReset,
	type TrackDeduction,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { engineDiet } from "../../utils/engineDiet/engineDiet.js";
import { isExactInteger } from "../../utils/numberUtils/exactIntegerUtils.js";
import { fullSubjectToHeldRows } from "../../utils/subjectUtils/convertSubjectUtils.js";

const isExactIntegerDelta = (delta: DeductionDelta): boolean =>
	isExactInteger(delta.balanceDelta);

/** `deltasToUsageEventFields` on exact integers: the same deductions and product, summed as plain numbers;
 *  null if a sum ever leaves the safe-integer range, which hands the call back to Decimal. */
const integerDeltasToUsageEventFields = ({
	fullSubject,
	deltas,
}: {
	fullSubject: WorkerFullSubject;
	deltas: DeductionDelta[];
}): UsageEventFields | null => {
	const rows = fullSubjectToHeldRows({ fullSubject });
	const deductions: TrackDeduction[] = [];
	// Keyed as the baseline keys its map: a balance id is only merged with its own table's deltas.
	const deductionTables: DeductionDelta["table"][] = [];
	let internalProductId: string | null = null;
	let mostMoved = 0;
	let productIds: string[] | null = null;
	let productMoved: number[] | null = null;
	for (const delta of deltas) {
		if (delta.balanceDelta === 0) continue;
		const row = rowOf({ delta, rows });
		if (!row) continue;
		const consumed = -delta.balanceDelta;
		let existing: TrackDeduction | undefined;
		for (let index = 0; index < deductions.length; index++)
			if (
				deductionTables[index] === delta.table &&
				(deductions[index] as TrackDeduction).balance_id === delta.id
			) {
				existing = deductions[index];
				break;
			}
		if (existing) {
			existing.value = consumed + existing.value;
			if (!Number.isSafeInteger(existing.value)) return null;
		} else {
			deductions.push({
				balance_id: delta.id,
				feature_id: row.entitlement.feature.id,
				plan_id: cusEntsToPlanId({ cusEnts: [row] }),
				reset: resetOf({ row }),
				value: consumed,
			});
			deductionTables.push(delta.table);
		}
		const productId = row.customer_product?.internal_product_id;
		if (!productId) continue;
		productIds ??= [];
		productMoved ??= [];
		const at = productIds.indexOf(productId);
		const moved =
			Math.abs(consumed) + (at >= 0 ? (productMoved[at] as number) : 0);
		if (!Number.isSafeInteger(moved)) return null;
		if (at >= 0) productMoved[at] = moved;
		else {
			productIds.push(productId);
			productMoved.push(moved);
		}
	}
	if (productIds && productMoved)
		for (let index = 0; index < productIds.length; index++) {
			const moved = productMoved[index] as number;
			if (moved <= mostMoved) continue;
			mostMoved = moved;
			internalProductId = productIds[index] as string;
		}
	return { deductions, internalProductId };
};

/** The row a delta moved: a customer entitlement directly, or the one that owns the rollover. */
const rowOf = ({
	delta,
	rows,
}: {
	delta: DeductionDelta;
	rows: WorkerFullCustomerEntitlementWithProduct[];
}): WorkerFullCustomerEntitlementWithProduct | undefined =>
	delta.table === "customerEntitlements"
		? rows.find((row) => row.id === delta.id)
		: rows.find((row) =>
				row.rollovers.some((rollover) => rollover.id === delta.id),
			);

/** The row's reset without undefined keys: a record has to survive a JSON round trip unchanged. */
const resetOf = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): TrackDeduction["reset"] => {
	const reset = cusEntsToReset({ cusEnts: [row] });
	if (!reset) return null;
	const { interval_count: intervalCount, ...rest } = reset;
	return intervalCount === undefined
		? rest
		: { ...rest, interval_count: intervalCount };
};

/** What a usage event says about the balances behind it; read here because only the decision has the rows. */
export type UsageEventFields = {
	/** One entry per balance drawn from, consumed amounts positive. */
	deductions: TrackDeduction[];
	/** The plan that paid the most, by absolute balance moved; null when nothing moved or the rows are loose grants. */
	internalProductId: string | null;
};

export const deltasToUsageEventFields = ({
	fullSubject,
	deltas,
}: {
	fullSubject: WorkerFullSubject;
	deltas: DeductionDelta[];
}): UsageEventFields => {
	if (engineDiet.usageEventFields && deltas.every(isExactIntegerDelta)) {
		const fields = integerDeltasToUsageEventFields({ fullSubject, deltas });
		if (fields) return fields;
	}
	const rows = fullSubjectToHeldRows({ fullSubject });
	const deductions = new Map<string, TrackDeduction>();
	const movedByProduct = new Map<string, Decimal>();

	for (const delta of deltas) {
		if (delta.balanceDelta === 0) continue;
		const row = rowOf({ delta, rows });
		if (!row) continue;

		const consumed = new Decimal(delta.balanceDelta).neg();
		const key = `${delta.table}:${delta.id}`;
		const existing = deductions.get(key);
		if (existing) {
			existing.value = consumed.plus(existing.value).toNumber();
		} else {
			deductions.set(key, {
				balance_id: delta.id,
				feature_id: row.entitlement.feature.id,
				plan_id: cusEntsToPlanId({ cusEnts: [row] }),
				reset: resetOf({ row }),
				value: consumed.toNumber(),
			});
		}

		const internalProductId = row.customer_product?.internal_product_id;
		if (!internalProductId) continue;
		movedByProduct.set(
			internalProductId,
			consumed.abs().plus(movedByProduct.get(internalProductId) ?? 0),
		);
	}

	let internalProductId: string | null = null;
	let mostMoved = new Decimal(0);
	for (const [candidate, moved] of movedByProduct) {
		if (moved.lte(mostMoved)) continue;
		mostMoved = moved;
		internalProductId = candidate;
	}
	return { deductions: [...deductions.values()], internalProductId };
};
