/**
 * Mid-life flip: a sub created before `automatic_tax` was enabled must
 * pick up auto_tax on its next sub.update after the flag flips. Covers
 * both v1 `/v1/attach` and v2 `/v1/billing.attach`.
 */

import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";

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

test.concurrent(`${chalk.yellowBright("automatic-tax-subscription-update (v1 legacy /v1/attach): mid-life flip propagates auto_tax on upgrade")}`, async () => {
	const customerId = "tax-mid-life-flip-v1";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { ctx, customer, autumnV1 } = await initScenario({
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
		actions: [s.attach({ productId: "pro" })],
	});

	const stripeCusId = customer!.processor!.id!;
	const initialSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(initialSubs.data[0].automatic_tax.enabled).toBe(false);

	await flipConfigOn(ctx);

	await autumnV1.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
	});

	const updatedSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(updatedSubs.data[0].automatic_tax.enabled).toBe(true);
}, 300_000);

test.concurrent(`${chalk.yellowBright("automatic-tax-subscription-update (v2 /v1/billing.attach): mid-life flip propagates auto_tax on upgrade")}`, async () => {
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

	// V2_2 uses `plan_id`.
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	});

	const updatedSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(updatedSubs.data[0].automatic_tax.enabled).toBe(true);
}, 300_000);
