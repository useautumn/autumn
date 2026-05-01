/**
 * `automatic_tax` + `customer_update.address: "auto"` on Stripe Checkout.
 * Asserts both v1 (`/v1/attach` → handleCreateCheckout) and v2
 * (`/v1/billing.attach` → executeStripeCheckoutSessionAction) inject
 * auto_tax + address-collection when `org.config.automatic_tax` is on.
 *
 * `customer_update` is create-only and not echoed in the Session response;
 * the test asserts only the observable `session.automatic_tax.enabled`.
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
				// No PM forces the checkout-URL branch.
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

		// V2 uses `payment_url`, not `checkout_url`.
		expect(result.payment_url).toBeDefined();
		expect(typeof result.payment_url).toBe("string");
		await assertCheckoutSessionTaxed({
			ctx,
			checkoutUrl: result.payment_url!,
		});
	},
	240_000,
);
