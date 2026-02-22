import "dotenv/config";

import {
	BillingInterval,
	type Customer,
	type FullProduct,
	notNullish,
} from "@autumn/shared";
import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	format,
} from "date-fns";
import puppeteer from "puppeteer-core";
import type { Stripe } from "stripe";
import { timeout } from "./genUtils.js";

const STRIPE_TEST_CLOCK_TIMING = 20000; // 30s

export const completeCheckoutForm = async (
	url: string,
	overrideQuantity?: number,
	promoCode?: string,
	_isLocal?: boolean,
) => {
	let step = "launching browser";

	const browser = await puppeteer.launch({
		headless: true,
		executablePath: process.env.TESTS_CHROMIUM_PATH,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
		],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 }); // Set standard desktop viewport size

		step = "navigating to checkout URL";
		await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

		// Try to click accordion if it exists (wait up to 2 seconds)
		try {
			await page.waitForSelector("#payment-method-accordion-item-title-card", {
				timeout: 2000,
			});
			await page.click("#payment-method-accordion-item-title-card");
			await timeout(500); // Brief wait for accordion to expand
		} catch (_e) {
			// Accordion doesn't exist or didn't appear, continue without clicking
		}

		step = "waiting for #cardNumber";
		await page.waitForSelector("#cardNumber", { timeout: 60000 });
		await page.type("#cardNumber", "4242424242424242");

		step = "filling card expiry";
		await page.waitForSelector("#cardExpiry", { timeout: 60000 });
		await page.type("#cardExpiry", "1234");

		step = "filling card CVC";
		await page.waitForSelector("#cardCvc", { timeout: 60000 });
		await page.type("#cardCvc", "123");

		step = "filling billing name";
		await page.waitForSelector("#billingName", { timeout: 60000 });
		await page.type("#billingName", "Test Customer");

		// Email field may be present if customer has no email set
		try {
			await page.waitForSelector("#email", { timeout: 2000 });
			await page.type("#email", "test@example.com");
		} catch (_e) {
			// Email field doesn't exist (customer already has email), continue without it
		}

		// Postal code may not be present for all countries (e.g., UK)
		try {
			await page.waitForSelector("#billingPostalCode", { timeout: 2000 });
			await page.type("#billingPostalCode", "SW59SX");
		} catch (_e) {
			// Postal code field doesn't exist, continue without it
		}

		if (notNullish(overrideQuantity)) {
			step = `finding .AdjustableQuantitySelector for quantity=${overrideQuantity}`;
			const quantityBtn = await page.$(".AdjustableQuantitySelector");
			if (!quantityBtn) {
				throw new Error(
					`.AdjustableQuantitySelector not found - did you pass adjustable_quantity: true in attach params?`,
				);
			}
			await quantityBtn.evaluate((b: any) => (b as HTMLElement).click());

			step = "waiting for #adjustQuantity input";
			await page.waitForSelector("#adjustQuantity", { timeout: 60000 });
			await page.click("#adjustQuantity", { clickCount: 3 }); // Select all text
			await page.keyboard.press("Backspace"); // Delete selected text
			await page.type("#adjustQuantity", overrideQuantity.toString());

			step = "clicking quantity update button";
			const updateBtn = await page.$(".AdjustQuantityFooter-btn");
			if (!updateBtn) {
				throw new Error(`.AdjustQuantityFooter-btn not found`);
			}
			await updateBtn.evaluate((b: any) => (b as HTMLElement).click());

			await timeout(1000);
		}

		if (promoCode) {
			step = "applying promo code";
			await page.waitForSelector("#promotionCode", { timeout: 60000 });
			await page.click("#promotionCode");
			await page.type("#promotionCode", promoCode);
			await page.keyboard.press("Enter");
			await timeout(5000);
		}

		step = "clicking submit button";
		const submitButton = await page.$(".SubmitButton-TextContainer");
		if (!submitButton) {
			throw new Error(`.SubmitButton-TextContainer not found`);
		}
		await submitButton.evaluate((b: any) => (b as HTMLElement).click());

		step = "waiting for checkout to process";
		await timeout(15000);
	} catch (error: any) {
		const msg = error?.message || String(error);
		throw new Error(`[completeCheckoutForm] Failed at "${step}": ${msg}`);
	} finally {
		// always close browser
		await browser.close();
	}
};

/** Automates the Stripe setup payment checkout flow (mode: "setup") */
export const completeSetupPaymentForm = async ({ url }: { url: string }) => {
	const browser = await puppeteer.launch({
		headless: false,
		executablePath: process.env.TESTS_CHROMIUM_PATH,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
		],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		await page.goto(url, { waitUntil: "networkidle2" });

		// Click on Card radio button to expand the card form
		try {
			await page.waitForSelector("#payment-method-accordion-item-title-card", {
				timeout: 3000,
			});
			await page.click("#payment-method-accordion-item-title-card");
			await timeout(500);
		} catch (_e) {
			// Card section might already be expanded or have different structure
		}

		// Fill card number
		await page.waitForSelector("#cardNumber", { timeout: 5000 });
		await page.type("#cardNumber", "4242424242424242");

		// Fill expiry (MM/YY format)
		await page.waitForSelector("#cardExpiry");
		await page.type("#cardExpiry", "1228");

		// Fill CVC
		await page.waitForSelector("#cardCvc");
		await page.type("#cardCvc", "100");

		// Fill cardholder name
		await page.waitForSelector("#billingName");
		await page.type("#billingName", "Test Customer");

		// Uncheck "Save my information for faster checkout" (Stripe Link) if present and checked
		try {
			const enableStripePass = await page.waitForSelector("#enableStripePass", {
				timeout: 3000,
			});
			if (enableStripePass) {
				// Check if the checkbox is currently checked before clicking
				const isChecked = await page.evaluate(
					(el) => (el as HTMLInputElement).checked,
					enableStripePass,
				);
				if (isChecked) {
					// Try multiple click targets - Stripe uses custom styled checkboxes
					// Priority: 1) The styled checkbox span, 2) The checkbox container, 3) The label, 4) The input
					const styledCheckbox = await page.$(".Checkbox-StyledInput");
					const checkboxContainer = await page.$(".Checkbox-InputContainer");
					const label = await page.$('label[for="enableStripePass"]');

					if (styledCheckbox) {
						await styledCheckbox.click();
					} else if (checkboxContainer) {
						await checkboxContainer.click();
					} else if (label) {
						await label.click();
					} else {
						// Fallback: try clicking the input directly
						await enableStripePass.click();
					}
					await timeout(500);

					// Verify it was unchecked
					const stillChecked = await page.evaluate(
						(el) => (el as HTMLInputElement).checked,
						enableStripePass,
					);
					if (stillChecked) {
						console.log(
							"[completeSetupPaymentForm] Warning: Stripe Pass checkbox still checked after click attempt",
						);
					}
				}
			}
		} catch (_e) {
			// Stripe Link checkbox not present
		}

		// Some setup forms have country dropdown, some have postal code
		// Try postal code first, then skip if not present
		try {
			const postalCode = await page.$("#billingPostalCode");
			if (postalCode) {
				await page.type("#billingPostalCode", "12345");
			}
		} catch (_e) {
			// Postal code field not present
		}

		// Click the Save button
		const submitButton = await page.$(".SubmitButton-TextContainer");
		await submitButton?.evaluate((b: any) => (b as HTMLElement).click());

		// Wait for form submission to complete
		await timeout(7000);

		console.log("[completeSetupPaymentForm] Setup payment completed");
	} finally {
		// await browser.close();
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
	await stripeCli.testHelpers.testClocks.advance(testClockId, {
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
	let advanceTo: number;

	if (!startingFrom) {
		startingFrom = new Date();
	}

	if (numberOfDays) {
		advanceTo = addDays(startingFrom, numberOfDays).getTime();
	} else {
		advanceTo = addMonths(startingFrom, 1).getTime();
	}
	// advanceTo = subHours(addMonths(Date.now(), 1), 1).getTime();

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
		advanceTo = addMonths(advanceTo, 1);
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
