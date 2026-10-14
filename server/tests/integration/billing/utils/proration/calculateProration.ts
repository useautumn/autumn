import { addMonths, addYears } from "date-fns";
import { Decimal } from "decimal.js";
import {
	type BillingPeriod,
	type GetBillingPeriodParams,
	getBillingPeriod,
} from "./getBillingPeriod";

export type CalculateProrationParams = GetBillingPeriodParams & {
	advancedTo: number;
	amount: number;
};

export type CalculateResetBillingCycleNowTotalParams =
	GetBillingPeriodParams & {
		advancedTo: number;
		oldAmount: number;
		newAmount: number;
	};

export type CalculateBillingCycleAnchorResetNextCycleParams =
	GetBillingPeriodParams & {
		billingCycleAnchorMs: number;
		nextCycleAmount: number;
	};

export const calculateProration = async ({
	customerId,
	advancedTo,
	amount,
	interval,
}: CalculateProrationParams): Promise<number> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	return calculateProrationFromPeriod({
		billingPeriod,
		advancedTo,
		amount,
	});
};

export const calculateResetBillingCycleNowTotal = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	interval,
}: CalculateResetBillingCycleNowTotalParams): Promise<number> => {
	const proratedCredit = await calculateProration({
		customerId,
		advancedTo,
		amount: oldAmount,
		interval,
	});

	return new Decimal(newAmount)
		.minus(proratedCredit)
		.toDecimalPlaces(2)
		.toNumber();
};

const floorToStripeSecond = (timestampMs: number) =>
	Math.floor(timestampMs / 1000) * 1000;

export const calculateBillingCycleAnchorResetNextCycle = async ({
	customerId,
	billingCycleAnchorMs,
	nextCycleAmount,
	interval,
}: CalculateBillingCycleAnchorResetNextCycleParams): Promise<{
	startsAt: number;
	total: number;
}> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	const normalizedAnchorMs = floorToStripeSecond(billingCycleAnchorMs);

	if (normalizedAnchorMs < billingPeriod.end) {
		const addInterval = interval === "year" ? addYears : addMonths;
		const newCycleEndMs = addInterval(normalizedAnchorMs, 1).getTime();
		const originalPeriodEndMs = floorToStripeSecond(billingPeriod.end);

		const extraDays = new Decimal(newCycleEndMs - originalPeriodEndMs);
		const newPeriodLength = new Decimal(newCycleEndMs - normalizedAnchorMs);

		return {
			startsAt: normalizedAnchorMs,
			total: new Decimal(nextCycleAmount)
				.mul(extraDays.div(newPeriodLength))
				.toDecimalPlaces(2)
				.toNumber(),
		};
	}

	return {
		startsAt: billingPeriod.end,
		total: nextCycleAmount,
	};
};

export const calculateProrationFromPeriod = ({
	billingPeriod,
	advancedTo,
	amount,
}: {
	billingPeriod: BillingPeriod;
	advancedTo: number;
	amount: number;
}): number => {
	const now = new Decimal(floorToStripeSecond(advancedTo));

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
	const prorated = ratio.mul(amount);

	return prorated.toDecimalPlaces(2).toNumber();
};
