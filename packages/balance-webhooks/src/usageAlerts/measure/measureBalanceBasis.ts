import type { WorkerFullSubject } from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	apiBalanceV1ToIncludedGrant,
	apiBalanceV1ToRecurringGrant,
	type BalanceBasis,
	customerEntitlementsToApiBalance,
	type Feature,
	fullSubjectToCustomerEntitlements,
	subtractSafe,
} from "@autumn/shared";
import { entitySubjectToCustomerSubject } from "../../common/convertSubject/entitySubjectToCustomerSubject.js";
import type {
	BeforeAfter,
	TrackedSubjects,
	UsageAlertMeasurement,
} from "../types/usageAlert.js";

/** Balance bases (balance, included, recurring): what an alert reads off the scope's API balance. */

/** The balance a scope measures: the tracked entity's when the scope names one, else the customer's. */
const subjectToApiBalance = ({
	fullSubject,
	feature,
	entityId,
	now,
}: {
	fullSubject: WorkerFullSubject;
	feature: Feature;
	entityId?: string;
	now: number;
}): ApiBalanceV1 => {
	const view = entityId
		? fullSubject
		: entitySubjectToCustomerSubject({ fullSubject });
	return customerEntitlementsToApiBalance({
		fullSubject: view,
		customerEntitlements: fullSubjectToCustomerEntitlements({
			fullSubject: view,
			featureIds: [feature.id],
			now,
		}),
		feature,
	}).data;
};

export const resolveScopeApiBalances = ({
	tracked,
	feature,
	entityId,
	now,
}: {
	tracked: TrackedSubjects;
	feature: Feature;
	entityId?: string;
	now: number;
}): BeforeAfter<ApiBalanceV1> => ({
	before: subjectToApiBalance({
		fullSubject: tracked.before,
		feature,
		entityId,
		now,
	}),
	after: subjectToApiBalance({
		fullSubject: tracked.after,
		feature,
		entityId,
		now,
	}),
});

const basisToDenominator = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): number => {
	if (basis === "included") return apiBalanceV1ToIncludedGrant({ apiBalance });
	if (basis === "recurring")
		return apiBalanceV1ToRecurringGrant({ apiBalance });
	return apiBalance.granted;
};

// Unlimited masks usage, so no threshold can be read off it.
export const apiBalanceToUsageAlertMeasurement = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): UsageAlertMeasurement | null => {
	if (apiBalance.unlimited) return null;

	const denominator = basisToDenominator({ basis, apiBalance });
	const remaining =
		basis === "balance"
			? apiBalance.remaining
			: Math.max(
					0,
					subtractSafe({ left: denominator, right: apiBalance.usage }),
				);

	return {
		usage: apiBalance.usage,
		denominator: denominator > 0 ? denominator : null,
		remaining,
		periodStartAt: null,
		payloadBlock: {
			basis,
			balance: {
				usage: apiBalance.usage,
				granted: apiBalance.granted,
				included: apiBalanceV1ToIncludedGrant({ apiBalance }),
				remaining,
			},
		},
	};
};

export const measureBalanceAlert = ({
	basis,
	apiBalances,
}: {
	basis: BalanceBasis;
	apiBalances: BeforeAfter<ApiBalanceV1>;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const before = apiBalanceToUsageAlertMeasurement({
		basis,
		apiBalance: apiBalances.before,
	});
	const after = apiBalanceToUsageAlertMeasurement({
		basis,
		apiBalance: apiBalances.after,
	});
	const measuredBothSides = before !== null && after !== null;
	return measuredBothSides ? { before, after } : null;
};
