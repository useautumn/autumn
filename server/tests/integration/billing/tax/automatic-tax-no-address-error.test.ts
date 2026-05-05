/**
 * Regression guard: when `automatic_tax: true` but the customer has no
 * address, attach must surface an actionable tax/address error (Stripe's
 * `customer_tax_location_invalid` or a typed RecaseError) instead of a
 * generic 500. Covers both v1 `/v1/attach` and v2 `/v1/billing.attach`.
 */

import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

function hasActionableTaxSignal(err: unknown): boolean {
	const errorString = JSON.stringify(err, [
		"message",
		"code",
		"name",
		"type",
	]).toLowerCase();
	return (
		errorString.includes("tax") ||
		errorString.includes("address") ||
		errorString.includes("location")
	);
}

test.concurrent(`${chalk.yellowBright("automatic-tax-no-address-error (v1 legacy /v1/attach): customer without address surfaces actionable error")}`, async () => {
	const customerId = "tax-no-address-v1";
	const proProd = products.pro({ id: "pro", items: [] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
			}),
			s.products({ list: [proProd] }),
		],
		actions: [],
	});

	let caughtError: unknown;
	try {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
		});
	} catch (err) {
		caughtError = err;
	}

	expect(caughtError).toBeDefined();
	expect(hasActionableTaxSignal(caughtError)).toBe(true);
}, 240_000);

test.concurrent(`${chalk.yellowBright("automatic-tax-no-address-error (v2 /v1/billing.attach): customer without address surfaces actionable error")}`, async () => {
	const customerId = "tax-no-address-v2";
	const proProd = products.pro({ id: "pro", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
			}),
			s.products({ list: [proProd] }),
		],
		actions: [],
	});

	let caughtError: unknown;
	try {
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		});
	} catch (err) {
		caughtError = err;
	}

	expect(caughtError).toBeDefined();
	expect(hasActionableTaxSignal(caughtError)).toBe(true);
}, 240_000);
