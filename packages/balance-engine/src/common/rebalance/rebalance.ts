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
