/**
 * TDD test for `automatic_tax` propagation via subscriptions.update on the
 * mid-life config flip scenario (Cycle 5).
 *
 * Real Mintlify scenario:
 *  - Sub was originally created BEFORE Mintlify enabled `automatic_tax: true`
 *    on their org config.
 *  - Mintlify flips the config flag.
 *  - Subsequent updates to the subscription must propagate
 *    `automatic_tax: { enabled: true }` so the existing sub starts taxing.
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach` for both initial attach and upgrade
 *  - v2 `/v1/billing.attach` for both initial attach and upgrade
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - Both paths' `subscriptions.update` calls omit `automatic_tax: { enabled: true }`.
 *  - Result: even after flipping `org.config.automatic_tax = true`, an
 *    upgrade goes through and the resulting subscription still has
 *    `automatic_tax.enabled === false`.
 *
 * Green-success criteria (after fix):
 *  - Both paths' `subscriptions.update` calls pass automatic_tax when
 *    `org.config.automatic_tax` is true.
 *  - After the upgrade, the resulting Stripe subscription has
 *    `automatic_tax.enabled === true`.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { products } from "@tests/utils/fixtures/products.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

async function flipConfigOn(ctx: TestContext) {
	const existingConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...existingConfig, automatic_tax: true },
		},
	});
}

test.concurrent(
	`${chalk.yellowBright("automatic-tax-subscription-update (v1 legacy /v1/attach): mid-life flip propagates auto_tax on upgrade")}`,
	async () => {
		const customerId = "tax-mid-life-flip-v1";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					// No configOverrides — automatic_tax starts at default (false).
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		const stripeCusId = customer!.processor!.id!;
		const initialSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(initialSubs.data[0].automatic_tax.enabled).toBe(false);

		await flipConfigOn(ctx);

		// Upgrade via legacy /v1/attach.
		await autumnV1.attach({
			customer_id: customerId,
			product_id: `premium_${customerId}`,
		});

		const updatedSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(updatedSubs.data[0].automatic_tax.enabled).toBe(true);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-subscription-update (v2 /v1/billing.attach): mid-life flip propagates auto_tax on upgrade")}`,
	async () => {
		const customerId = "tax-mid-life-flip-v2";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const stripeCusId = customer!.processor!.id!;
		const initialSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(initialSubs.data[0].automatic_tax.enabled).toBe(false);

		await flipConfigOn(ctx);

		// Upgrade via /v1/billing.attach (V2_2 client uses plan_id schema).
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		const updatedSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(updatedSubs.data[0].automatic_tax.enabled).toBe(true);
	},
	300_000,
);
