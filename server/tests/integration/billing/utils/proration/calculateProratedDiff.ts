import { Decimal } from "decimal.js";
import {
	type GetBillingPeriodParams,
	getBillingPeriod,
} from "./getBillingPeriod";

export type CalculateProratedDiffParams = GetBillingPeriodParams & {
	advancedTo: number;
	oldAmount: number;
	newAmount: number;
};

export const calculateProratedDiff = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	interval,
}: CalculateProratedDiffParams): Promise<number> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	const now = new Decimal(Math.floor(advancedTo / 1000) * 1000);

	const start = new Decimal(billingPeriod.start);
	const end = new Decimal(billingPeriod.end);

	const remaining = end.minus(now);
	const total = end.minus(start);

	if (total.isZero()) {
		throw new Error(
			`Invalid billing period: start and end are the same (${billingPeriod.start})`,
		);
	}

	const ratio = remaining.div(total);

	const diff = new Decimal(newAmount).minus(oldAmount);
	const proratedDiff = diff.mul(ratio);

	return proratedDiff.toDecimalPlaces(2).toNumber();
};
