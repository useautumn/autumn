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
	subHours,
} from "date-fns";
import puppeteer from "puppeteer-core";
import type { Stripe } from "stripe";
import { timeout } from "./genUtils.js";

const STRIPE_TEST_CLOCK_TIMING = 20000; // 30s

import { Hyperbrowser } from "@hyperbrowser/sdk";

const client = new Hyperbrowser({
	apiKey: process.env.HYPERBROWSER_API_KEY || "123",
});

export const completeCheckoutForm = async (
	url: string,
	overrideQuantity?: number,
	promoCode?: string,
	isLocal?: boolean,
) => {
	let browser;

	if (process.env.NODE_ENV === "development" && !isLocal) {
		const session = await client.sessions.create();
		browser = await puppeteer.connect({
			browserWSEndpoint: session!.wsEndpoint,
			defaultViewport: null,
		});
	} else {
		browser = await puppeteer.launch({
			headless: false,
			executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	}

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 }); // Set standard desktop viewport size
		await page.goto(url);

		// await page.waitForSelector("#payment-method-accordion-item-title-card");
		// await page.click("#payment-method-accordion-item-title-card");

		await page.waitForSelector("#cardNumber");
		await page.type("#cardNumber", "4242424242424242");

		await page.waitForSelector("#cardExpiry");
		await page.type("#cardExpiry", "1234");

		await page.waitForSelector("#cardCvc");
		await page.type("#cardCvc", "123");

		await page.waitForSelector("#billingName");
		await page.type("#billingName", "Test Customer");
		await page.waitForSelector("#billingPostalCode");
		await page.type("#billingPostalCode", "123456");

		if (overrideQuantity) {
			const quantityBtn = await page.$(".AdjustableQuantitySelector");
			await quantityBtn?.evaluate((b: any) => (b as HTMLElement).click());

			await page.waitForSelector("#adjustQuantity");
			await page.click("#adjustQuantity", { clickCount: 3 }); // Select all text
			await page.keyboard.press("Backspace"); // Delete selected text
			await page.type("#adjustQuantity", overrideQuantity.toString());

			const updateBtn = await page.$(".AdjustQuantityFooter-btn");
			await updateBtn?.evaluate((b: any) => (b as HTMLElement).click());

			await timeout(1000);
		}

		if (promoCode) {
			await page.waitForSelector("#promotionCode");
			await page.click("#promotionCode");
			await page.type("#promotionCode", promoCode);
			await page.keyboard.press("Enter");
			await timeout(5000);
		}

		const submitButton = await page.$(".SubmitButton-TextContainer");
		await submitButton?.evaluate((b: any) => (b as HTMLElement).click());
		await timeout(7000);
	} finally {
		// always close browser
		await browser.close();
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
				} catch (error) {
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
	let stripeProd;
	try {
		stripeProd = await stripeCli.products.retrieve(product.processor!.id);
	} catch (error) {
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
			} catch (error) {
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
		} catch (error) {
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
}) => {
	if (!startingFrom) {
		startingFrom = new Date();
	}

	if (numberOfDays) {
		advanceTo = addDays(startingFrom, numberOfDays).getTime();
	}

	if (numberOfWeeks) {
		advanceTo = addWeeks(startingFrom, numberOfWeeks).getTime();
	}

	if (numberOfHours) {
		advanceTo = addHours(startingFrom, numberOfHours).getTime();
	}

	if (numberOfMonths) {
		advanceTo = addMonths(startingFrom, numberOfMonths).getTime();
	}

	if (!advanceTo) {
		advanceTo = addMinutes(addMonths(startingFrom, 1), 10).getTime();
	}

	console.log("   - Advancing to: ", format(advanceTo, "dd MMM yyyy HH:mm:ss"));
	const res = await stripeCli.testHelpers.testClocks.advance(testClockId, {
		frozen_time: Math.floor(advanceTo / 1000),
	});

	await timeout(
		waitForSeconds ? waitForSeconds * 1000 : STRIPE_TEST_CLOCK_TIMING,
	);

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
	startingFrom,
}: {
	stripeCli: Stripe;
	testClockId: string;
	waitForMeterUpdate?: boolean;
	numberOfDays?: number;
	startingFrom?: Date;
}) => {
	let advanceTo;

	if (!startingFrom) {
		startingFrom = new Date();
	}

	// if (numberOfDays) {
	// 	advanceTo = addDays(startingFrom, numberOfDays).getTime();
	// } else {
	// 	advanceTo = addMonths(startingFrom, 1).getTime();
	// }
	advanceTo = subHours(addMonths(Date.now(), 1), 1).getTime();

	await stripeCli.testHelpers.testClocks.advance(testClockId, {
		frozen_time: Math.ceil(advanceTo / 1000),
	});

	console.log(
		"   - advanceClockForInvoice (1): ",
		format(advanceTo, "dd MMM yyyy HH:mm:ss"),
	);

	if (waitForMeterUpdate) {
		const timeoutSeconds = 200;
		for (let i = 0; i < timeoutSeconds; i += 10) {
			console.log(`   - ${i} / ${timeoutSeconds}`);
			await timeout(10000);
		}
	} else {
		await timeout(STRIPE_TEST_CLOCK_TIMING);
	}

	// const advanceTo2 = addHours(new Date(advanceTo), 30).getTime();
	const advanceTo2 = addDays(new Date(advanceTo), 4).getTime();
	await stripeCli.testHelpers.testClocks.advance(testClockId, {
		frozen_time: Math.floor(advanceTo2 / 1000),
	});

	console.log(
		"   - advanceClockForInvoice (2): ",
		format(advanceTo2, "dd MMM yyyy HH:mm:ss"),
	);

	await timeout(STRIPE_TEST_CLOCK_TIMING);
	return advanceTo2;
};

export const advanceMonths = async ({
	stripeCli,
	testClockId,
	numberOfMonths,
}: {
	stripeCli: Stripe;
	testClockId: string;
	numberOfMonths: number;
}) => {
	let advanceTo = new Date();
	for (let i = 0; i < numberOfMonths; i += 1) {
		// let numMonths = Math.min(numberOfMonths - i, 2);
		(advanceTo = addMonths(advanceTo, 1)), 10;
		console.log(
			"   - Advancing to: ",
			format(advanceTo, "dd MMM yyyy HH:mm:ss"),
		);

		try {
			await stripeCli.testHelpers.testClocks.advance(testClockId, {
				frozen_time: Math.floor(advanceTo.getTime() / 1000),
			});
		} catch (error: any) {
			console.log("   - Advance clock: ", error.message);
			await timeout(10000);
			await stripeCli.testHelpers.testClocks.advance(testClockId, {
				frozen_time: Math.floor(advanceTo.getTime() / 1000),
			});
		}

		await timeout(15000);
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
}) => {
	const stripeCustomer: any = await stripeCli.customers.retrieve(
		stripeId || customer!.processor!.id,
		{
			expand: ["discount.coupon"],
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
