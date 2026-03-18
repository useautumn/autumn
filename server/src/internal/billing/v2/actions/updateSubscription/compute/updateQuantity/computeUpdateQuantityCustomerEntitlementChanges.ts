import {
	cusEntToCusPrice,
	customerPriceToBillingUnits,
	type FullCusEntWithFullCusProduct,
	fullCustomerToCustomerEntitlements,
	isEntityScopedCusEnt,
	priceToProrationConfig,
	type UpdateCustomerEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";

export const computeUpdateQuantityCustomerEntitlementChanges = ({
	ctx: _ctx,
	updateSubscriptionContext,
	quantityDifference,
	customerEntitlement,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	quantityDifference: number;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): UpdateCustomerEntitlement[] => {
	const { fullCustomer, recalculateBalances } = updateSubscriptionContext;

	const customerPrice = cusEntToCusPrice({
		cusEnt: customerEntitlement,
		errorOnNotFound: true,
	});

	const billingUnits = customerPriceToBillingUnits({ customerPrice });
	const customerEntitlementBalanceChange = new Decimal(quantityDifference)
		.mul(billingUnits)
		.toNumber();

	const isUpgrade = quantityDifference > 0;

	const { shouldApplyProration } = priceToProrationConfig({
		price: customerPrice.price,
		isUpgrade,
	});

	// If downgrade and no proration, don't change entitlement balance THIS cycle
	if (!isUpgrade && !shouldApplyProration) {
		return [];
	}

	// 1. Create cloned
	const cusEnts = recalculateBalances
		? fullCustomerToCustomerEntitlements({
				fullCustomer,
				featureIds: [customerEntitlement.entitlement.feature.id],
				entity: fullCustomer.entity,
				customerEntitlementFilters: {
					interval: customerEntitlement.entitlement.interval ?? undefined,
				},
			})
		: [customerEntitlement];

	if (cusEnts.length === 0) {
		return [];
	}

	const updatesById = new Map<
		string,
		ReturnType<typeof deductFromCusEntsTypescript>["updates"][string]
	>();

	const mergeUpdates = ({
		nextUpdates,
	}: {
		nextUpdates: ReturnType<typeof deductFromCusEntsTypescript>["updates"];
	}) => {
		for (const [customerEntitlementId, update] of Object.entries(nextUpdates)) {
			updatesById.set(customerEntitlementId, update);
		}
	};

	if (isEntityScopedCusEnt(customerEntitlement)) {
		const entityUsages = Object.fromEntries(
			Object.keys(customerEntitlement.entities ?? {}).map((entityId) => [
				entityId,
				-customerEntitlementBalanceChange,
			]),
		);

		for (const [entityId, entityUsage] of Object.entries(entityUsages)) {
			const { updates } = deductFromCusEntsTypescript({
				cusEnts,
				amountToDeduct: entityUsage,
				targetEntityId: entityId,
				allowOverage: true,
			});

			mergeUpdates({
				nextUpdates: updates,
			});
		}
	} else {
		const { updates: topLevelUpdates } = deductFromCusEntsTypescript({
			cusEnts,
			amountToDeduct: -customerEntitlementBalanceChange,
			allowOverage: true,
		});

		mergeUpdates({
			nextUpdates: topLevelUpdates,
		});
	}

	const customerEntitlementsById = new Map(
		cusEnts.map((cusEnt) => [cusEnt.id, cusEnt]),
	);

	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];

	for (const [customerEntitlementId, update] of updatesById.entries()) {
		const nextCustomerEntitlement = customerEntitlementsById.get(
			customerEntitlementId,
		);
		if (!nextCustomerEntitlement) continue;

		updateCustomerEntitlements.push({
			customerEntitlement: nextCustomerEntitlement,
			updates: {
				balance: update.balance,
				adjustment: update.adjustment,
				entities: update.entities,
			},
		});
	}

	return updateCustomerEntitlements;
};
