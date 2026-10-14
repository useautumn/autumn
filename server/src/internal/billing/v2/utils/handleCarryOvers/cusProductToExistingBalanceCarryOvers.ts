import {
	type AttachBillingContext,
	type AttachParamsV1,
	addCusProductToCusEnt,
	calculateNextExpiry,
	cusEntToCusPrice,
	cusProductsToCusEnts,
	type Entitlement,
	type FullCusProduct,
	type FullCustomerEntitlement,
	featureUtils,
	type InsertCustomerEntitlement,
	isBooleanCusEnt,
	isConsumablePrice,
	isEntityScopedCusEnt,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";
import {
	initCarryOverCustomerEntitlement,
	initCarryOverEntitlement,
} from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";

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

const payDownDebtFromNewCustomerProduct = ({
	newCustomerProduct,
	internalFeatureId,
	debt,
}: {
	newCustomerProduct: FullCusProduct;
	internalFeatureId: string;
	debt: number;
}): boolean => {
	const targets = cusProductsToCusEnts({
		cusProducts: [newCustomerProduct],
		internalFeatureIds: [internalFeatureId],
	}).filter(
		(cusEnt) => !isUnlimitedCusEnt(cusEnt) && !isEntityScopedCusEnt(cusEnt),
	);
	if (targets.length === 0) return false;

	deductFromCusEntsTypescript({
		cusEnts: targets,
		amountToDeduct: debt,
		allowOverage: true,
	});

	for (const target of targets) {
		const original = newCustomerProduct.customer_entitlements.find(
			(cusEnt) => cusEnt.id === target.id,
		);
		if (!original) continue;
		original.balance = target.balance;
		original.adjustment = target.adjustment;
	}
	return true;
};

export const cusProductToExistingBalanceCarryOvers = ({
	attachBillingContext,
	params,
	newCustomerProduct,
}: {
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
	newCustomerProduct: FullCusProduct;
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

		const cusPrice = cusEntToCusPrice({ cusEnt: cusEntWithCusProduct });
		const isUnbilledDebt =
			balance < 0 && !(cusPrice && isConsumablePrice(cusPrice.price));
		if (
			isUnbilledDebt &&
			payDownDebtFromNewCustomerProduct({
				newCustomerProduct,
				internalFeatureId: cusEnt.entitlement.internal_feature_id,
				debt: -balance,
			})
		)
			continue;

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
