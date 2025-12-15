import { Decimal } from "decimal.js";

export const roundUsageToNearestBillingUnit = ({
	usage,
	billingUnits,
}: {
	usage: number;
	billingUnits: number;
}): number => {
	return new Decimal(usage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();
};
