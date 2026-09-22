import { Decimal } from "decimal.js";
import type { FullCustomerPrice } from "../../../models/cusProductModels/cusPriceModels/cusPriceModels.js";
import { entToOptions } from "../../productUtils/convertProductUtils.js";
import {
	cusEntToStartingBalance,
	type StartingBalanceCustomerEntitlement,
} from "../balanceUtils/cusEntToStartingBalance.js";
import { getStartingBalance } from "../getStartingBalance.js";

/** What the rollover cap reads: the grant's terms and what sizes its starting balance. */
export type RolloverMaxCustomerEntitlement = StartingBalanceCustomerEntitlement;

function hasFullCusProduct(
	cusEnt: RolloverMaxCustomerEntitlement,
): cusEnt is RolloverMaxCustomerEntitlement & {
	customer_product: { customer_prices: FullCustomerPrice[] };
} {
	return (
		cusEnt.customer_product != null &&
		"customer_prices" in cusEnt.customer_product
	);
}

/** Effective rollover cap for a cusEnt: null = unlimited (or no config). */
export const cusEntToEffectiveRolloverMax = ({
	cusEnt,
}: {
	cusEnt: RolloverMaxCustomerEntitlement;
}): number | null => {
	const rolloverConfig = cusEnt.entitlement.rollover;
	if (!rolloverConfig) return null;

	if (rolloverConfig.max_percentage == null) return rolloverConfig.max ?? null;

	let startingBalance: number;
	if (cusEnt.pooled_balance) {
		startingBalance = cusEntToStartingBalance({ cusEnt });
	} else if (hasFullCusProduct(cusEnt)) {
		startingBalance = cusEntToStartingBalance({ cusEnt });
	} else {
		const options = entToOptions({
			ent: cusEnt.entitlement,
			options: cusEnt.customer_product?.options ?? [],
		});
		startingBalance = getStartingBalance({
			entitlement: cusEnt.entitlement,
			options,
			productQuantity: cusEnt.customer_product?.quantity ?? 1,
		});
	}

	return new Decimal(startingBalance)
		.mul(rolloverConfig.max_percentage)
		.div(100)
		.floor()
		.toNumber();
};
