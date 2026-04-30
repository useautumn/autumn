/**
 * TDD test for `automatic_tax` + `customer_update.address: "auto"` on
 * Stripe Checkout sessions (Cycle 6). Customers without a payment method
 * are routed to a Stripe-hosted checkout session — that session needs to
 * (a) collect tax, (b) write the entered address back to the Stripe
 * customer record so future charges have a tax-resolvable address.
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach` → handleCreateCheckout
 *  - v2 `/v1/billing.attach` → executeStripeCheckoutSessionAction
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - Both checkout paths call `stripeCli.checkout.sessions.create({...})`
 *    WITHOUT `automatic_tax` or `customer_update`.
 *  - Result: session.automatic_tax.enabled is false. Mintlify (and any
 *    auto-tax org) would have to manually pass these via
 *    `checkout_session_params` on every attach call.
 *
 * Green-success criteria (after fix):
 *  - Both checkout paths inject `automatic_tax: { enabled: true }` and
 *    `customer_update: { address: "auto" }` when `org.config.automatic_tax`
 *    is true. Mintlify gets this for free without any client-side work.
 *
 * No invoice-total assertion here: the customer hasn't completed checkout,
 * so there's no invoice yet. Total-validation is covered by Cycles 2–5.
 *
 * Note: customer_update is a create-only param and is NOT echoed back in
 * the Session response object. The customer_update fix is applied in
 * production code; the integration test asserts only the observable
 * `session.automatic_tax.enabled`.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

async function assertCheckoutSessionTaxed({
	ctx,
	checkoutUrl,
}: {
	ctx: TestContext;
	checkoutUrl: string;
}) {
	const sessionIdMatch = checkoutUrl.match(/cs_(test|live)_[A-Za-z0-9]+/);
	expect(sessionIdMatch).not.toBeNull();
	const sessionId = sessionIdMatch![0];

	const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId);
	expect(session.automatic_tax.enabled).toBe(true);
}

test.concurrent(
	`${chalk.yellowBright("automatic-tax-checkout-session (v1 legacy /v1/attach): no payment method returns checkout session with auto_tax")}`,
	async () => {
		const customerId = "tax-checkout-v1";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				// NO paymentMethod — forces checkout-URL branch on attach.
				s.customer({
					testClock: false,
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const result = (await autumnV1.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
		})) as { checkout_url?: string };

		expect(result.checkout_url).toBeDefined();
		await assertCheckoutSessionTaxed({ ctx, checkoutUrl: result.checkout_url! });
	},
	240_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-checkout-session (v2 /v1/billing.attach): no payment method returns checkout session with auto_tax")}`,
	async () => {
		const customerId = "tax-checkout-v2";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const result = (await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as { payment_url?: string };

		// V2 returns the URL via `payment_url` (not `checkout_url`).
		expect(result.payment_url).toBeDefined();
		expect(typeof result.payment_url).toBe("string");
		await assertCheckoutSessionTaxed({
			ctx,
			checkoutUrl: result.payment_url!,
		});
	},
	240_000,
);
