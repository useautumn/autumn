import { Decimal } from "decimal.js";
import type { BillingPeriod } from "../../../../models/billingModels/lineItem/lineItemContext";

export const applyProration = ({
	now,
	billingPeriod,
	amount,
}: {
	now: number;
	billingPeriod: BillingPeriod;
	amount: number;
}) => {
	const { start, end } = billingPeriod;

	const denom = new Decimal(end).minus(start);

	if (denom.isZero()) {
		throw new Error("Billing period is incorrect (start and end are the same)");
	}

	const num = new Decimal(end).minus(now);

	return num.div(denom).mul(amount).toNumber();
};
