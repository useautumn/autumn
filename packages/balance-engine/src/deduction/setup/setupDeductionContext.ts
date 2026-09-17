import {
	fullSubjectToCustomerEntitlements,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionRow } from "../types/deductionRow.js";

/** Unpriced rows only for now: the grant is the allowance, the overage floor is usage_limit above it. */
const customerEntitlementToDeductionRow = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}): DeductionRow => {
	const { entitlement } = customerEntitlement;
	const usageAllowed = customerEntitlement.usage_allowed ?? false;
	const unlimited =
		Boolean(customerEntitlement.unlimited) ||
		isUnlimitedEntitlement({ entitlement });
	const allowance = entitlement.allowance ?? 0;
	const maxOverage =
		usageAllowed && entitlement.usage_limit != null
			? entitlement.usage_limit - allowance
			: null;

	return {
		table: "customerEntitlements",
		id: customerEntitlement.id,
		balance: customerEntitlement.balance,
		creditCost: 1,
		usageAllowed: unlimited || usageAllowed,
		minBalance: unlimited || maxOverage === null ? null : -maxOverage,
		maxBalance: unlimited ? null : allowance,
		unlimited,
	};
};

/** A rollover only ever drains to zero and is never refunded into. */
const rolloverToDeductionRow = ({
	rollover,
}: {
	rollover: WorkerRollover;
}): DeductionRow => ({
	table: "rollovers",
	id: rollover.id,
	balance: rollover.balance,
	creditCost: 1,
	usageAllowed: false,
	minBalance: 0,
	maxBalance: 0,
	unlimited: false,
});

/** The sort prefers unlimited only within a tier; the sink contract needs it first outright. */
const hoistUnlimited = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlement[];
}): WorkerFullCustomerEntitlement[] => {
	const unlimitedCustomerEntitlement = customerEntitlements.find(
		(customerEntitlement) =>
			Boolean(customerEntitlement.unlimited) ||
			isUnlimitedEntitlement({ entitlement: customerEntitlement.entitlement }),
	);
	if (!unlimitedCustomerEntitlement) return customerEntitlements;
	return [
		unlimitedCustomerEntitlement,
		...customerEntitlements.filter(
			(customerEntitlement) =>
				customerEntitlement !== unlimitedCustomerEntitlement,
		),
	];
};

/** Soonest-expiring first; rollovers without an expiry drain last. */
const byExpiresAt = (left: WorkerRollover, right: WorkerRollover): number =>
	(left.expires_at ?? Number.POSITIVE_INFINITY) -
	(right.expires_at ?? Number.POSITIVE_INFINITY);

/** Everything a deduction of `featureId` needs, decided once; the buckets never read the subject. */
export const setupDeductionContext = ({
	fullSubject,
	featureId,
	overageBehavior,
	now,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
	overageBehavior: OverageBehavior;
	now: number;
}): DeductionContext => {
	const customerEntitlements = hoistUnlimited({
		customerEntitlements: fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [featureId],
			now,
		}),
	});
	const rollovers = customerEntitlements
		.flatMap((customerEntitlement) => customerEntitlement.rollovers)
		.sort(byExpiresAt);

	return {
		featureId,
		entityId: fullSubject.entity?.id ?? null,
		now,
		overageBehavior,
		customerEntitlements,
		rollovers,
		rows: customerEntitlements.map((customerEntitlement) =>
			customerEntitlementToDeductionRow({ customerEntitlement }),
		),
		rolloverRows: rollovers.map((rollover) =>
			rolloverToDeductionRow({ rollover }),
		),
	};
};
