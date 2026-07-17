import {
	cusEntToStartingBalance,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript.js";
import { isSyntheticPooledBalanceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";

export type CustomerEntitlementGrantState =
	| {
			startingBalance: number;
			adjustment: number;
			entities?: undefined;
	  }
	| {
			startingBalance?: undefined;
			adjustment: number;
			entities: Record<string, EntityBalance>;
	  };

export const getCustomerEntitlementGrantState = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}): CustomerEntitlementGrantState => {
	const startingBalance = cusEntToStartingBalance({
		cusEnt: customerEntitlement,
	});
	if (customerEntitlement.customer_product?.internal_entity_id) {
		return {
			startingBalance,
			adjustment: 0,
		};
	}
	if (
		isSyntheticPooledBalanceCustomerEntitlement({
			customerEntitlement,
			customerProduct: customerEntitlement.customer_product,
		})
	) {
		return {
			startingBalance,
			adjustment: customerEntitlement.adjustment ?? 0,
		};
	}

	const resetUpdate = getResetBalancesUpdate({
		cusEnt: customerEntitlement,
		allowance: startingBalance ?? undefined,
	});
	if ("entities" in resetUpdate) {
		return {
			entities: resetUpdate.entities,
			adjustment: 0,
		};
	}
	return {
		startingBalance: resetUpdate.balance,
		adjustment: resetUpdate.adjustment,
	};
};

export const reapplyUsageToCustomerEntitlements = ({
	customerEntitlements,
	usage,
	targetEntityId,
	getGrantState,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	usage: number;
	targetEntityId?: string;
	getGrantState: ({
		customerEntitlement,
	}: {
		customerEntitlement: FullCusEntWithFullCusProduct;
	}) => CustomerEntitlementGrantState;
}): void => {
	for (const customerEntitlement of customerEntitlements) {
		const grantState = getGrantState({ customerEntitlement });
		customerEntitlement.adjustment = grantState.adjustment;

		if (grantState.entities !== undefined) {
			customerEntitlement.entities = grantState.entities;
			continue;
		}

		customerEntitlement.balance = new Decimal(grantState.startingBalance)
			.plus(grantState.adjustment)
			.toNumber();
		customerEntitlement.additional_balance = 0;
	}

	const usesTopLevelEntityRows = customerEntitlements.every(
		(customerEntitlement) =>
			customerEntitlement.customer_product?.internal_entity_id != null,
	);
	const deductionCustomerEntitlements = usesTopLevelEntityRows
		? customerEntitlements.map((customerEntitlement) => ({
				...customerEntitlement,
				entitlement: {
					...customerEntitlement.entitlement,
					entity_feature_id: null,
				},
			}))
		: customerEntitlements;

	deductFromCusEntsTypescript({
		cusEnts: deductionCustomerEntitlements,
		amountToDeduct: usage,
		targetEntityId: usesTopLevelEntityRows ? undefined : targetEntityId,
		allowOverage: true,
	});

	if (usesTopLevelEntityRows) {
		const updatedById = new Map(
			deductionCustomerEntitlements.map((customerEntitlement) => [
				customerEntitlement.id,
				customerEntitlement,
			]),
		);
		for (const customerEntitlement of customerEntitlements) {
			const updated = updatedById.get(customerEntitlement.id);
			if (!updated) continue;
			customerEntitlement.balance = updated.balance;
			customerEntitlement.adjustment = updated.adjustment;
			customerEntitlement.additional_balance = updated.additional_balance;
			customerEntitlement.entities = updated.entities;
		}
	}
};
