/**
 * Regression guard for the default-off behavior (Cycle 8).
 *
 * NOT a TDD red→green cycle — this test is GREEN at the start. It exists
 * to lock in the contract that:
 *  - Orgs without `automatic_tax: true` in their config get the legacy
 *    behavior: `automatic_tax: { enabled: false }` on Stripe writes.
 *  - The flag is OPT-IN, not opt-out, so adding the field to OrgConfig
 *    does not retroactively start taxing every existing org's customers.
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach`
 *  - v2 `/v1/billing.attach`
 *
 * Runs against the master test org (no `s.platform.create`), which has
 * `automatic_tax` falsy in its config (the schema default kicks in only
 * on .parse(); the raw DB jsonb may have `undefined`). Asserts that
 * resulting Stripe subscription has `automatic_tax.enabled === false`
 * after attach via either path.
 *
 * If a future change accidentally hardcodes `automatic_tax: { enabled: true }`
 * unconditionally (i.e. without checking org.config.automatic_tax), this
 * test will fail and surface the regression at PR time.
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

		// Master org (no s.platform.create). Config has automatic_tax falsy.
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
