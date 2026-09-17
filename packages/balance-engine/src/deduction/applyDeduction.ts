import { Decimal } from "decimal.js";
import { StaleTrackOutcomeError } from "../actions/track/errors.js";
import type { BalanceMutation, LeanCustomerEntitlement } from "../contracts.js";

export const applyDeduction = ({
	customerEntitlements,
	mutations,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	mutations: BalanceMutation[];
}): LeanCustomerEntitlement[] => {
	const mutationByCustomerEntitlementId = new Map(
		mutations.map((mutation) => [mutation.customerEntitlementId, mutation]),
	);
	if (mutationByCustomerEntitlementId.size !== mutations.length) {
		throw new StaleTrackOutcomeError({ subject: "duplicate mutation" });
	}

	for (const mutation of mutations) {
		const customerEntitlement = customerEntitlements.find(
			(candidate) => candidate.id === mutation.customerEntitlementId,
		);
		if (
			!customerEntitlement ||
			!new Decimal(customerEntitlement.balance).eq(mutation.balanceBefore) ||
			!new Decimal(customerEntitlement.usage).eq(mutation.usageBefore)
		) {
			throw new StaleTrackOutcomeError({
				subject: mutation.customerEntitlementId,
			});
		}
	}

	return customerEntitlements.map((customerEntitlement) => {
		const mutation = mutationByCustomerEntitlementId.get(
			customerEntitlement.id,
		);
		if (!mutation) return customerEntitlement;

		return {
			id: customerEntitlement.id,
			balance: mutation.balanceAfter,
			usage: mutation.usageAfter,
		};
	});
};
