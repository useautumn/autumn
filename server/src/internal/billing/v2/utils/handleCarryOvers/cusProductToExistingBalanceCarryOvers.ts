import {
	AllowanceType,
	type AttachBillingContext,
	type AttachParamsV1,
	type CustomerEntitlement,
	type Entitlement,
	type FullCustomerEntitlement,
	featureUtils,
	type InsertCustomerEntitlement,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

const buildCarryOverEntitlement = ({
	cusEnt,
	orgId,
	allowance,
}: {
	cusEnt: FullCustomerEntitlement;
	orgId: string;
	allowance: number;
}): Entitlement => ({
	id: generateId("ent"),
	created_at: Date.now(),
	org_id: orgId,
	internal_feature_id: cusEnt.entitlement.internal_feature_id,
	feature_id: cusEnt.entitlement.feature_id as string,
	internal_product_id: null,
	is_custom: true,
	allowance,
	allowance_type: AllowanceType.Fixed,
	interval: null,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	usage_limit: null,
	rollover: null,
});

const buildCarryOverCustomerEntitlement = ({
	cusEnt,
	entitlementId,
	internalCustomerId,
	customerId,
	internalEntityId,
	balance,
	expiresAt,
}: {
	cusEnt: FullCustomerEntitlement;
	entitlementId: string;
	internalCustomerId: string;
	customerId: string | null | undefined;
	internalEntityId: string | null;
	balance: number;
	expiresAt: number | null;
}): InsertCustomerEntitlement => ({
	id: generateId("cus_ent"),
	entitlement_id: entitlementId,
	internal_customer_id: internalCustomerId,
	internal_feature_id: cusEnt.entitlement.internal_feature_id,
	internal_entity_id: internalEntityId,
	customer_product_id: null,
	customer_id: customerId,
	feature_id: cusEnt.entitlement.feature.id,
	created_at: Date.now(),
	balance,
	additional_balance: 0,
	adjustment: 0,
	unlimited: false,
	usage_allowed: false,
	entities: null,
	next_reset_at: null,
	expires_at: expiresAt,
});

export const cusProductToExistingBalanceCarryOvers = ({
	attachBillingContext,
	params,
}: {
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
}): {
	entitlements: Entitlement[];
	customerEntitlements: CustomerEntitlement[];
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
	const customerEntitlements: CustomerEntitlement[] = [];

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
			customerEntitlements.push(
				...entityPairs.map((p) => p.cusEntRow as CustomerEntitlement),
			);
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
		customerEntitlements.push(cusEntRow as CustomerEntitlement);
	}

	return { entitlements, customerEntitlements };
};
