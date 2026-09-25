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
import { customerEntitlementsToAlertBalance } from "./customerEntitlementsToAlertBalance.js";
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
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject: view,
		featureIds: [feature.id],
		now,
	});
	if (process.env.EXP_LEAN_ALERT) {
		const lean = customerEntitlementsToAlertBalance({
			entityId: view.entity?.id ?? view.entity?.internal_id,
			customerEntitlements,
			feature,
		});
		if (process.env.EXP_LEAN_VERIFY) {
			const full = customerEntitlementsToApiBalance({
				fullSubject: view,
				customerEntitlements,
				feature,
			}).data;
			const pick = (b: ApiBalanceV1) =>
				JSON.stringify([
					b.unlimited,
					...(b.unlimited
						? []
						: [
								b.granted,
								b.remaining,
								b.usage,
								apiBalanceV1ToIncludedGrant({ apiBalance: b }),
								apiBalanceV1ToRecurringGrant({ apiBalance: b }),
							]),
				]);
			if (pick(lean) !== pick(full))
				throw new Error(`lean alert balance diverged: ${pick(lean)} vs ${pick(full)}`);
		}
		return lean;
	}
	return customerEntitlementsToApiBalance({
		fullSubject: view,
		customerEntitlements,
		feature,
	}).data;
};

const apiBalanceByRevision = new Map<string, ApiBalanceV1>();

/** A subject at one revision always adds up to the same balance, so the previous command's after is this one's before. */
const memoizedApiBalance = (params: {
	fullSubject: WorkerFullSubject;
	feature: Feature;
	entityId?: string;
	now: number;
}): ApiBalanceV1 => {
	if (!process.env.EXP_ALERT_MEMO) return subjectToApiBalance(params);
	const { identity, revision } = params.fullSubject;
	const key = `${identity.orgId}|${identity.env}|${identity.customerId}|${identity.entityId}|${revision}|${params.entityId ?? ""}|${params.feature.id}`;
	const cached = apiBalanceByRevision.get(key);
	if (cached) return cached;
	const apiBalance = subjectToApiBalance(params);
	if (apiBalanceByRevision.size > 50_000) apiBalanceByRevision.clear();
	apiBalanceByRevision.set(key, apiBalance);
	return apiBalance;
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
	before: memoizedApiBalance({
		fullSubject: tracked.before,
		feature,
		entityId,
		now,
	}),
	after: memoizedApiBalance({
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
