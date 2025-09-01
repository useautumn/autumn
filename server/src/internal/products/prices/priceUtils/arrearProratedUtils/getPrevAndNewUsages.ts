import type { Entitlement, Price, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const getUsageFromBalance = ({
	ent,
	price,
	balance,
}: {
	ent: Entitlement;
	price: Price;
	balance: number;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;

	const overage = -Math.min(0, balance);
	const roundedOverage = new Decimal(overage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();

	const usage = new Decimal(ent.allowance!).sub(balance).toNumber();

	let roundedUsage = usage;
	if (overage > 0) {
		roundedUsage = new Decimal(usage)
			.div(billingUnits)
			.ceil()
			.mul(billingUnits)
			.toNumber();
	}

	return { usage, roundedUsage, overage, roundedOverage };
};
