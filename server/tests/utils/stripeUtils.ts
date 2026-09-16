import "dotenv/config";

import {
	BillingInterval,
	type Customer,
	type FullProduct,
} from "@autumn/shared";
import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	format,
} from "date-fns";
import type { Stripe } from "stripe";
import { timeout } from "./genUtils.js";
import { advanceStripeTestClock } from "./stripeUtils/testClock/advanceStripeTestClock";
import { waitForStripeClockReady } from "./stripeUtils/testClock/waitForStripeClockReady";
import { createTestWait } from "./testWait/createTestWait";

const STRIPE_TEST_CLOCK_TIMING = 20_000;

export const waitForClockReady = async ({
	stripeCli,
	testClockId,
	signal,
	timeoutMs = 180_000,
}: {
	stripeCli: Stripe;
	testClockId: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}) => {
	const wait = createTestWait({
		timeoutMs,
		signal,
		description: `Wait for Stripe test clock ${testClockId}`,
	});
	try {
		await waitForStripeClockReady({ stripeCli, testClockId, wait });
	} finally {
		wait.close();
	}
};

export const deleteAllStripeProducts = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}) => {
	const stripeProds = await stripeCli.products.list({
		limit: 100,
	});

	const batchSize = 10;
	for (let i = 0; i < stripeProds.data.length; i += batchSize) {
		const batch = stripeProds.data.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (prod) => {
				console.log("Deleting stripe product", prod.id);
				try {
					await stripeCli.products.del(prod.id);
				} catch (_error) {
					await stripeCli.products.update(prod.id, {
						active: false,
					});
				}
			}),
		);
		console.log("Deleted", i, "of", stripeProds.data.length);
	}
};

export const deleteAllStripeTestClocks = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}) => {
	const stripeTestClocks = await stripeCli.testHelpers.testClocks.list({
		limit: 100,
	});
	const batchSize = 10;
	for (let i = 0; i < stripeTestClocks.data.length; i += batchSize) {
		const batch = stripeTestClocks.data.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (clock) =>
				stripeCli.testHelpers.testClocks.del(clock.id),
			),
		);
	}
};

export const deleteStripeProduct = async ({
	stripeCli,
	product,
}: {
	stripeCli: Stripe;
	product: FullProduct;
}) => {
	try {
		await stripeCli.products.retrieve(product.processor!.id);
	} catch (_error) {
		return;
	}

	for (const price of product.prices!) {
		const config = price.config as any;
		if (config.stripe_price_id) {
			const stripePrice = await stripeCli.prices.retrieve(
				config.stripe_price_id,
			);

			await stripeCli.prices.update(config.stripe_price_id, {
				active: false,
			});

			// Delete default product
			try {
				await stripeCli.products.del(stripePrice.product as string);
			} catch (_error) {
				await stripeCli.products.update(stripePrice.product as string, {
					active: false,
				});
			}
		}

		if (config.stripe_meter_id) {
			await stripeCli.billing.meters.deactivate(config.stripe_meter_id);
		}
	}

	if (product.processor) {
		// console.log("Stripe product", stripeProd.active, stripeProd.id);
		const stripeProdId = product.processor.id;
		try {
			await stripeCli.products.del(stripeProdId);
		} catch (_error) {
			await stripeCli.products.update(stripeProdId, {
				active: false,
			});
		}
	}
};

export const checkMeteredEventSummary = async ({
	stripeCli,
	meterId,
	customerId,
}: {
	stripeCli: Stripe;
	meterId: string;
	customerId: string;
}) => {
	const summaries = await stripeCli.billing.meters.listEventSummaries(meterId, {
		customer: customerId,
		start_time: Math.floor(Date.now() / 1000),
		end_time: Math.floor(addMonths(new Date(), 1).getTime() / 1000),
	});
	return summaries;
};

export const advanceTestClock = async ({
	stripeCli,
	testClockId,
	startingFrom,
	numberOfDays,
	numberOfWeeks,
	numberOfHours,
	numberOfMonths,
	advanceTo,
	waitForSeconds,
	minimumWaitForSeconds,
	signal,
	timeoutMs,
}: {
	stripeCli: Stripe;
	testClockId: string;
	numberOfDays?: number;
	startingFrom?: Date;
	numberOfWeeks?: number;
	numberOfHours?: number;
	numberOfMonths?: number;
	advanceTo?: number;
	waitForSeconds?: number;
	minimumWaitForSeconds?: number;
	signal?: AbortSignal;
	timeoutMs?: number;
}) => {
	if (!startingFrom) {
		startingFrom = new Date();
	}

	// Stack all time units - they accumulate from startingFrom
	let targetDate = startingFrom;

	if (numberOfMonths) {
		targetDate = addMonths(targetDate, numberOfMonths);
	}

	if (numberOfWeeks) {
		targetDate = addWeeks(targetDate, numberOfWeeks);
	}

	if (numberOfDays) {
		targetDate = addDays(targetDate, numberOfDays);
	}

	if (numberOfHours) {
		targetDate = addHours(targetDate, numberOfHours);
	}

	// Only use calculated targetDate if we actually had time params
	if (numberOfMonths || numberOfWeeks || numberOfDays || numberOfHours) {
		advanceTo = targetDate.getTime();
	}

	if (!advanceTo) {
		advanceTo = addMinutes(addMonths(startingFrom, 1), 10).getTime();
	}

	console.log("   - Advancing to: ", format(advanceTo, "dd MMM yyyy HH:mm:ss"));
	const defaultSettleSeconds =
		minimumWaitForSeconds === undefined ? STRIPE_TEST_CLOCK_TIMING / 1000 : 0;
	await advanceStripeTestClock({
		stripeCli,
		testClockId,
		targetSeconds: Math.floor(advanceTo / 1000),
		minimumWaitMs: (minimumWaitForSeconds ?? 0) * 1000,
		settleMs: (waitForSeconds ?? defaultSettleSeconds) * 1000,
		signal,
		timeoutMs,
	});

	return advanceTo;
};

export const waitForMeterUpdate = async () => {
	const timeoutSeconds = 160;
	for (let i = 0; i < timeoutSeconds; i += 10) {
		console.log(`   - ${i} / ${timeoutSeconds}`);
		await timeout(10000);
	}
};

export const advanceClockForInvoice = async ({
	stripeCli,
	testClockId,
	waitForMeterUpdate = false,
	numberOfDays,
	startingFrom = new Date(),
	signal,
	timeoutMs = 300_000,
}: {
	stripeCli: Stripe;
	testClockId: string;
	waitForMeterUpdate?: boolean;
	numberOfDays?: number;
	startingFrom?: Date;
	signal?: AbortSignal;
	timeoutMs?: number;
}) => {
	const invoiceTime = numberOfDays
		? addDays(startingFrom, numberOfDays).getTime()
		: addMonths(startingFrom, 1).getTime();
	const paymentTime = addDays(new Date(invoiceTime), 4).getTime();
	const stages = [
		{
			targetSeconds: Math.ceil(invoiceTime / 1000),
			settleMs: waitForMeterUpdate ? 200_000 : STRIPE_TEST_CLOCK_TIMING,
		},
		{
			targetSeconds: Math.floor(paymentTime / 1000),
			settleMs: STRIPE_TEST_CLOCK_TIMING,
		},
	];
	const wait = createTestWait({
		timeoutMs,
		signal,
		description: `Advance invoice clock ${testClockId}`,
	});
	try {
		for (const stage of stages) {
			await advanceStripeTestClock({
				stripeCli,
				testClockId,
				...stage,
				signal: wait.signal,
				timeoutMs: wait.remainingMs(),
			});
		}
		return paymentTime;
	} finally {
		wait.close();
	}
};

export const advanceMonths = async ({
	stripeCli,
	testClockId,
	numberOfMonths,
	signal,
	timeoutMs = 300_000,
}: {
	stripeCli: Stripe;
	testClockId: string;
	numberOfMonths: number;
	signal?: AbortSignal;
	timeoutMs?: number;
}) => {
	const wait = createTestWait({
		timeoutMs,
		signal,
		description: `Advance ${numberOfMonths} months on clock ${testClockId}`,
	});
	let advanceTo = new Date();
	try {
		for (let i = 0; i < numberOfMonths; i += 1) {
			advanceTo = addMonths(advanceTo, 1);
			console.log(
				"   - Advancing to: ",
				format(advanceTo, "dd MMM yyyy HH:mm:ss"),
			);
			const startedAt = performance.now();
			await advanceStripeTestClock({
				stripeCli,
				testClockId,
				targetSeconds: Math.floor(advanceTo.getTime() / 1000),
				signal: wait.signal,
				timeoutMs: wait.remainingMs(),
			});
			const remainingSettleMs = 15_000 - (performance.now() - startedAt);
			if (remainingSettleMs > 0) await wait.sleep(remainingSettleMs);
		}
	} finally {
		wait.close();
	}
};

// Check billing meter event summary
export const checkBillingMeterEventSummary = async ({
	stripeCli,
	startTime,
	stripeMeterId,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	startTime: Date;
	stripeMeterId: string;
	stripeCustomerId: string;
}) => {
	const endTime = addMonths(startTime, 1);
	const event = await stripeCli.billing.meters.listEventSummaries(
		stripeMeterId,
		{
			limit: 100,
			start_time: Math.round(startTime.getTime() / 1000),
			end_time: Math.round(endTime.getTime() / 1000),
			customer: stripeCustomerId,
		},
	);

	if (event.data.length === 0) {
		return null;
	} else {
		return event.data[0];
	}
};

export const getDiscount = async ({
	stripeCli,
	customer,
	stripeId,
}: {
	stripeCli: Stripe;
	customer?: Customer;
	stripeId?: string;
}): Promise<
	(Stripe.Discount & { source: { coupon: Stripe.Coupon } }) | null
> => {
	const stripeCustomer: any = await stripeCli.customers.retrieve(
		stripeId || customer!.processor!.id,
		{
			expand: ["discount.source.coupon"],
		},
	);

	return stripeCustomer.discount;
};

export const stripeToAutumnInterval = ({
	interval,
	intervalCount,
}: {
	interval: string;
	intervalCount: number;
}) => {
	if (interval === "month" && intervalCount === 1) {
		return BillingInterval.Month;
	}

	if (interval === "month" && intervalCount === 3) {
		return BillingInterval.Quarter;
	}

	if (interval === "month" && intervalCount === 6) {
		return BillingInterval.SemiAnnual;
	}

	if (
		(interval === "month" && intervalCount === 12) ||
		(interval === "year" && intervalCount === 1)
	) {
		return BillingInterval.Year;
	}
};

export const subItemToAutumnInterval = (item: Stripe.SubscriptionItem) => {
	return {
		interval: item.price.recurring?.interval as BillingInterval,
		intervalCount: item.price.recurring?.interval_count || 1,
	};
	// return stripeToAutumnInterval({
	//   interval: item.price.recurring?.interval!,
	//   intervalCount: item.price.recurring?.interval_count!,
	// });
};
