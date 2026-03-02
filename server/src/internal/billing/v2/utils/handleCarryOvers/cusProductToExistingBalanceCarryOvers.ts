import {
	type AttachBillingContext,
	type AttachParamsV1,
	type Entitlement,
	featureUtils,
	type InsertCustomerEntitlement,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import {
	buildCarryOverCustomerEntitlement,
	buildCarryOverEntitlement,
} from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";

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
	const { currentCustomerProduct, planTiming, endOfCycleMs, fullCustomer } =
		attachBillingContext;

	const carryOverParams = params.carry_over_balances;

	if (planTiming !== "immediate")
		return { entitlements: [], customerEntitlements: [] };
	if (!currentCustomerProduct)
		return { entitlements: [], customerEntitlements: [] };
	if (!carryOverParams?.enabled)
		return { entitlements: [], customerEntitlements: [] };

	const featureIds = carryOverParams.feature_ids;

	const customer = fullCustomer;
	const orgId = customer.org_id;

	const entitlements: Entitlement[] = [];
	const customerEntitlements: InsertCustomerEntitlement[] = [];

	for (const cusEnt of currentCustomerProduct.customer_entitlements) {
		if (isBooleanCusEnt({ cusEnt })) continue;
		if (isUnlimitedCusEnt(cusEnt)) continue;
		if (featureUtils.isAllocated(cusEnt.entitlement.feature)) continue;
		if (featureIds && !featureIds.includes(cusEnt.entitlement.feature.id))
			continue;

		const expiresAt = cusEnt.next_reset_at ?? endOfCycleMs ?? null;

		if (isEntityScopedCusEnt(cusEnt)) {
			const entityPairs = Object.entries(cusEnt.entities)
				.filter(([, entityBalance]) => entityBalance.balance > 0)
				.flatMap(([entityId, entityBalance]) => {
					const entity = fullCustomer.entities?.find((e) => e.id === entityId);
					if (!entity) return [];
					const ent = buildCarryOverEntitlement({
						cusEnt,
						orgId,
						allowance: entityBalance.balance,
					});
					const cusEntRow = buildCarryOverCustomerEntitlement({
						cusEnt,
						entitlementId: ent.id,
						internalCustomerId: customer.internal_id,
						customerId: customer.id,
						internalEntityId: entity.internal_id,
						balance: entityBalance.balance,
						expiresAt,
					});
					return [{ ent, cusEntRow }];
				});

			entitlements.push(...entityPairs.map((p) => p.ent));
			customerEntitlements.push(...entityPairs.map((p) => p.cusEntRow));
			continue;
		}

		const balance = cusEnt.balance ?? 0;
		if (balance <= 0) continue;

		const ent = buildCarryOverEntitlement({
			cusEnt,
			orgId,
			allowance: balance,
		});
		const cusEntRow = buildCarryOverCustomerEntitlement({
			cusEnt,
			entitlementId: ent.id,
			internalCustomerId: customer.internal_id,
			customerId: customer.id,
			internalEntityId: currentCustomerProduct.internal_entity_id ?? null,
			balance,
			expiresAt,
		});

		entitlements.push(ent);
		customerEntitlements.push(cusEntRow);
	}

	return { entitlements, customerEntitlements };
};
