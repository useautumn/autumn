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

/** Every balance row the subject holds with the plan that granted it, selected or not: a finalize can land on a row a track would skip. */
const heldRowsOf = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): WorkerFullCustomerEntitlementWithProduct[] => [
	...fullSubject.customer_products.flatMap((customerProduct) =>
		customerProduct.customer_entitlements.map((customerEntitlement) => ({
			...customerEntitlement,
			customer_product: customerProduct,
		})),
	),
	...fullSubject.extra_customer_entitlements.map((customerEntitlement) => ({
		...customerEntitlement,
		customer_product: null,
	})),
];

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
	const rows = heldRowsOf({ fullSubject });
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
