/**
 * TDD test for the negative guard when `automatic_tax: true` but the
 * customer has no tax-resolvable address (Cycle 7).
 *
 * Why: Stripe Tax can't compute tax without knowing the customer's
 * jurisdiction. If `automatic_tax: { enabled: true }` is passed alongside
 * a customer with no address, Stripe responds with
 * `customer_tax_location_invalid`. Without a clean error path, this surfaces
 * as an opaque 500 to the integrator.
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach`
 *  - v2 `/v1/billing.attach`
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - Stripe throws `customer_tax_location_invalid`, but the error bubbles
 *    up wrapped in a generic 500 with no actionable code or message.
 *
 * Green-success criteria (after fix):
 *  - The API surfaces a clearly-attributable error: either Stripe's exact
 *    `customer_tax_location_invalid` code, OR a typed `RecaseError` with a
 *    tax-related message.
 *
 * As of writing: both paths already surface a tax/address-attributable
 * error message via the existing AutumnError plumbing, so this is
 * effectively a regression guard (GREEN at start) — locks in the contract
 * that no-address attach with auto_tax produces an actionable error.
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
			// No stripeCustomerOverrides => no address.
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
		console.log("caughtError", caughtError);
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
