/**
 * Regression guard: orgs without `automatic_tax` in config must NOT have
 * Stripe Tax enabled on attach (auto_tax is opt-in). Runs against the master
 * test org via both v1 `/v1/attach` and v2 `/v1/billing.attach`.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

async function assertSubNotTaxed({
	ctx,
	stripeCusId,
}: {
	ctx: TestContext;
	stripeCusId: string;
}) {
	expect(ctx.org.config.automatic_tax).toBeFalsy();

	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(subs.data.length).toBeGreaterThan(0);
	expect(subs.data[0].automatic_tax.enabled).toBe(false);
}

test.concurrent(
	`${chalk.yellowBright("automatic-tax-default-off (v1 legacy /v1/attach): master org without auto_tax config does NOT enable Stripe Tax")}`,
	async () => {
		const customerId = "tax-default-off-v1";
		const proProd = products.pro({ id: "pro", items: [] });

		// Master org (no s.platform.create) with automatic_tax falsy.
		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		await assertSubNotTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
		});
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-default-off (v2 /v1/billing.attach): master org without auto_tax config does NOT enable Stripe Tax")}`,
	async () => {
		const customerId = "tax-default-off-v2";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		await assertSubNotTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
		});
	},
	120_000,
);
