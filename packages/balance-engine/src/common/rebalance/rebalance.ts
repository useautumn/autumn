import { Decimal } from "decimal.js";
import { clampChange } from "../../deduction/utils/draw/clampChange.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import {
	selectCreditedCustomerEntitlement,
	selectCustomerEntitlementsInOverage,
	selectFeatureCustomerEntitlements,
} from "./selectCustomerEntitlements.js";
import type {
	RebalanceDelta,
	RebalanceOutcome,
} from "./types/rebalanceOutcome.js";
import type { RebalanceRequest } from "./types/rebalanceRequest.js";

/** Refund the purchase into each row's overage, in order, up to 0; what is not needed is left over. */
const refundOverage = ({
	customerEntitlementsInOverage,
	quantity,
}: {
	customerEntitlementsInOverage: { id: string; balance: number }[];
	quantity: Decimal;
}): { deltas: RebalanceDelta[]; leftover: Decimal } => {
	const deltas: RebalanceDelta[] = [];
	let leftover = quantity;
	for (const { id, balance } of customerEntitlementsInOverage) {
		if (leftover.isZero()) break;
		// A refund's ceiling of 0: at most what brings the balance back to 0.
		const refund = clampChange({
			current: new Decimal(balance),
			amount: leftover.neg(),
			floor: null,
			ceiling: 0,
		}).neg();
		deltas.push({ customerEntitlementId: id, delta: refund.toNumber() });
		leftover = leftover.minus(refund);
	}
	return { deltas, leftover };
};

/** One increment per row; a row given two deltas gets their sum. */
const deltasToIncrements = ({
	deltas,
}: {
	deltas: RebalanceDelta[];
}): RowChange[] => {
	const totalById = new Map<string, Decimal>();
	for (const { customerEntitlementId, delta } of deltas)
		totalById.set(
			customerEntitlementId,
			(totalById.get(customerEntitlementId) ?? new Decimal(0)).plus(delta),
		);
	return [...totalById].map(([id, total]) => ({
		table: "customerEntitlements",
		op: "increment",
		id,
		add: { balance: total.toNumber() },
	}));
};

/** A purchase: refund the overage of the rows at its level, then credit the leftover. Pure. */
export const rebalance = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: RebalanceRequest;
}): RebalanceOutcome => {
	const featureCustomerEntitlements = selectFeatureCustomerEntitlements({
		fullSubject,
		request,
	});
	const purchased = featureCustomerEntitlements.find(
		({ id }) => id === request.customerEntitlementId,
	);
	// As on the server: a purchased row outside the feature's rows moves nothing.
	if (!purchased || request.quantity <= 0) return { deltas: [], changes: [] };

	const inOverage = selectCustomerEntitlementsInOverage({
		featureCustomerEntitlements,
		purchased,
		request,
	});
	const refunded = refundOverage({
		customerEntitlementsInOverage: inOverage,
		quantity: new Decimal(request.quantity),
	});
	if (refunded.leftover.isZero())
		return {
			deltas: refunded.deltas,
			changes: deltasToIncrements({ deltas: refunded.deltas }),
		};

	const credited = selectCreditedCustomerEntitlement({
		featureCustomerEntitlements,
		inOverage,
		purchased,
		request,
	});
	const deltas = [
		...refunded.deltas,
		{
			customerEntitlementId: credited.id,
			delta: refunded.leftover.toNumber(),
		},
	];
	return { deltas, changes: deltasToIncrements({ deltas }) };
};
