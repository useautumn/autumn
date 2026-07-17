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

	deductFromCusEntsTypescript({
		cusEnts: customerEntitlements,
		amountToDeduct: usage,
		targetEntityId,
		allowOverage: true,
	});
};
