import {
	type AttachBillingContext,
	type AttachParamsV1,
	addCusProductToCusEnt,
	calculateNextExpiry,
	type Entitlement,
	type FullCustomerEntitlement,
	featureUtils,
	type InsertCustomerEntitlement,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import {
	initCarryOverCustomerEntitlement,
	initCarryOverEntitlement,
} from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";

/**
 * A carried-over balance would have expired at the old plan's next reset. If
 * the item rolls over, a positive leftover would instead have become a rollover
 * at that reset, so give it the rollover's expiry (null = forever). Negative
 * balances (debt) never roll over, so they keep the reset expiry.
 */
const getCarryOverExpiresAt = ({
	cusEnt,
	balance,
	endOfCycleMs,
}: {
	cusEnt: FullCustomerEntitlement;
	balance: number;
	endOfCycleMs?: number;
}): number | null => {
	const resetAt = cusEnt.next_reset_at ?? endOfCycleMs ?? null;
	const rolloverConfig = cusEnt.entitlement.rollover;

	if (resetAt === null || !rolloverConfig || balance <= 0) return resetAt;

	return calculateNextExpiry(resetAt, rolloverConfig);
};

export const cusProductToExistingBalanceCarryOvers = ({
	attachBillingContext,
	params,
}: {
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
}): {
	entitlements: Entitlement[];
	customerEntitlements: InsertCustomerEntitlement[];
} => {
	const {
		carryOverSourceCustomerProduct,
		planTiming,
		endOfCycleMs,
		fullCustomer,
	} = attachBillingContext;

	const carryOverParams = params.carry_over_balances;

	if (planTiming !== "immediate")
		return { entitlements: [], customerEntitlements: [] };
	if (!carryOverSourceCustomerProduct)
		return { entitlements: [], customerEntitlements: [] };
	if (!carryOverParams?.enabled)
		return { entitlements: [], customerEntitlements: [] };

	const featureIds = carryOverParams.feature_ids;

	const customer = fullCustomer;
	const orgId = customer.org_id;

	const entitlements: Entitlement[] = [];
	const customerEntitlements: InsertCustomerEntitlement[] = [];

	for (const cusEnt of carryOverSourceCustomerProduct.customer_entitlements) {
		if (isBooleanCusEnt({ cusEnt })) continue;
		if (isUnlimitedCusEnt(cusEnt)) continue;
		if (featureUtils.isAllocated(cusEnt.entitlement.feature)) continue;

		// One-off prepaid consumable cusEnts are already auto-preserved as a
		// lifetime cusEnt by cusProductToOneOffPrepaidCarryOvers — skip here
		// to avoid minting a second carry-over row for the same balance.
		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct: carryOverSourceCustomerProduct,
		});
		if (isOneOffPrepaidConsumableCustomerEntitlement(cusEntWithCusProduct))
			continue;

		if (featureIds && !featureIds.includes(cusEnt.entitlement.feature.id))
			continue;

		if (isEntityScopedCusEnt(cusEnt)) {
			const entityPairs = Object.entries(cusEnt.entities)
				.filter(([, entityBalance]) => entityBalance.balance !== 0)
				.flatMap(([entityId, entityBalance]) => {
					const entity = fullCustomer.entities?.find((e) => e.id === entityId);
					if (!entity) return [];
					const ent = initCarryOverEntitlement({
						cusEnt,
						orgId,
						allowance: entityBalance.balance,
					});
					const cusEntRow = initCarryOverCustomerEntitlement({
						cusEnt,
						entitlementId: ent.id,
						internalCustomerId: customer.internal_id,
						customerId: customer.id,
						internalEntityId: entity.internal_id,
						balance: entityBalance.balance,
						expiresAt: getCarryOverExpiresAt({
							cusEnt,
							balance: entityBalance.balance,
							endOfCycleMs,
						}),
					});
					return [{ ent, cusEntRow }];
				});

			entitlements.push(...entityPairs.map((p) => p.ent));
			customerEntitlements.push(...entityPairs.map((p) => p.cusEntRow));
			continue;
		}

		const balance = cusEnt.balance ?? 0;
		if (balance === 0) continue;

		const ent = initCarryOverEntitlement({
			cusEnt,
			orgId,
			allowance: balance,
		});
		const cusEntRow = initCarryOverCustomerEntitlement({
			cusEnt,
			entitlementId: ent.id,
			internalCustomerId: customer.internal_id,
			customerId: customer.id,
			internalEntityId:
				carryOverSourceCustomerProduct.internal_entity_id ?? null,
			balance,
			expiresAt: getCarryOverExpiresAt({ cusEnt, balance, endOfCycleMs }),
		});

		entitlements.push(ent);
		customerEntitlements.push(cusEntRow);
	}

	return { entitlements, customerEntitlements };
};
