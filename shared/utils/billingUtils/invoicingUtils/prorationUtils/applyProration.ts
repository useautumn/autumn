import { Decimal } from "decimal.js";
import type { BillingPeriod } from "../../../../models/billingModels/invoicingModels/lineItemContext";

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

	const num = new Decimal(now).minus(start);

	return num.div(denom).mul(amount).toNumber();
};
