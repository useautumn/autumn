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
import { isExactInteger } from "../../utils/numberUtils/exactIntegerUtils.js";
import { fullSubjectToHeldRows } from "../../utils/subjectUtils/convertSubjectUtils.js";

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

type RowFields = Pick<TrackDeduction, "feature_id" | "plan_id" | "reset">;

// A held row is one object per subject view, and its plan and reset never depend on its balance.
const rowFieldsByRow = new WeakMap<
	WorkerFullCustomerEntitlementWithProduct,
	RowFields
>();

const rowFieldsOf = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): RowFields => {
	let fields = rowFieldsByRow.get(row);
	if (!fields) {
		fields = {
			feature_id: row.entitlement.feature.id,
			plan_id: cusEntsToPlanId({ cusEnts: [row] }),
			reset: resetOf({ row }),
		};
		rowFieldsByRow.set(row, fields);
	}
	return fields;
};

/** `deltasToUsageEventFields` for integer deltas, in plain numbers with each row's plan and reset read once. */
const integerUsageEventFields = ({
	rows,
	deltas,
}: {
	rows: WorkerFullCustomerEntitlementWithProduct[];
	deltas: DeductionDelta[];
}): UsageEventFields => {
	const deductions: TrackDeduction[] = [];
	const tables: DeductionDelta["table"][] = [];
	let internalProductId: string | null = null;
	let mostMoved = 0;
	const movedByProduct = new Map<string, number>();
	for (const delta of deltas) {
		if (delta.balanceDelta === 0) continue;
		const row = rowOf({ delta, rows });
		if (!row) continue;
		const consumed = -delta.balanceDelta;
		let existing: TrackDeduction | undefined;
		for (let index = 0; index < deductions.length; index++)
			if (
				deductions[index]?.balance_id === delta.id &&
				tables[index] === delta.table
			)
				existing = deductions[index];
		if (existing) existing.value = consumed + existing.value;
		else {
			const { feature_id, plan_id, reset } = rowFieldsOf({ row });
			deductions.push({
				balance_id: delta.id,
				feature_id,
				plan_id,
				reset,
				value: consumed,
			});
			tables.push(delta.table);
		}
		const productId = row.customer_product?.internal_product_id;
		if (!productId) continue;
		movedByProduct.set(
			productId,
			Math.abs(consumed) + (movedByProduct.get(productId) ?? 0),
		);
	}
	for (const [candidate, moved] of movedByProduct) {
		if (moved <= mostMoved) continue;
		mostMoved = moved;
		internalProductId = candidate;
	}
	return { deductions, internalProductId };
};

export const deltasToUsageEventFields = ({
	fullSubject,
	deltas,
	lean = false,
}: {
	fullSubject: WorkerFullSubject;
	deltas: DeductionDelta[];
	/** Integer deltas take the plain-number path; the fields are the same. */
	lean?: boolean;
}): UsageEventFields => {
	if (lean && deltas.every((delta) => isExactInteger(delta.balanceDelta)))
		return integerUsageEventFields({
			rows: fullSubjectToHeldRows({ fullSubject }),
			deltas,
		});
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
