/**
 * Integration test for the new `tax` field on `previewAttach`.
 *
 * Architecture (per fetch–build–execute):
 *   Symptom surfaces in: server/src/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview.ts
 *     (formatter passes through `billingPlan.preview.tax` to the response)
 *   Root cause lives in: server/src/internal/billing/v2/utils/billingPlan/preview/tax/computeAttachTaxPreview.ts
 *     (build-stage helper that calls Stripe Tax)
 *   Fix layer: upstream — preview enrichment is a build-stage output read by
 *     the formatter; never reaches the executor.
 *
 * Three concurrent cases:
 *  - auto_tax-on, AU customer with address, Pro→Premium upgrade preview →
 *    `response.tax.status === "complete"`, total > 0
 *  - auto_tax-off (default) → `response.tax === undefined`
 *  - auto_tax-on, customer with no resolvable location →
 *    `response.tax.status === "incomplete"`, totals all zero
 */

import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
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

async function flipAutoTaxOn(ctx: TestContext) {
	const existingConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...existingConfig, automatic_tax: true },
		},
	});
}

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-immediate (auto_tax on, AU customer): preview returns tax.status=complete with positive total",
)}`, async () => {
	const customerId = "tax-preview-on-au";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
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

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");
	expect(preview.tax?.currency).toBe(preview.currency);
	expect(preview.tax?.total).toBeGreaterThan(0);
	expect(preview.tax?.amount_exclusive).toBeGreaterThan(0);
	expect(preview.tax?.amount_inclusive).toBe(0);

	// Sanity: the existing autumn-side total stays separate from the
	// stripe-side tax breakdown. They're computing different things —
	// the autumn `total` may include credits that Stripe doesn't tax.
	expect(preview.total).toBeGreaterThan(0);
	// Don't assert preview.total === preview.tax.total — divergence is
	// expected and documented on the schema.
}, 300_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-immediate (auto_tax off): preview omits the tax field entirely",
)}`, async () => {
	const customerId = "tax-preview-off";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			// No configOverrides — automatic_tax defaults to false.
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

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeUndefined();
}, 300_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-immediate (auto_tax on, no address): preview returns tax.status=incomplete with zeros",
)}`, async () => {
	const customerId = "tax-preview-on-no-addr";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			// Start with auto_tax OFF so initial Pro attach succeeds even
			// without an address; flip on after to exercise the
			// preview-with-no-address branch.
			s.platform.create({
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
				// NO stripeCustomerOverrides — no address.
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	await flipAutoTaxOn(ctx);

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("incomplete");
	expect(preview.tax?.total).toBe(0);
	expect(preview.tax?.amount_exclusive).toBe(0);
	expect(preview.tax?.amount_inclusive).toBe(0);
	expect(preview.tax?.currency).toBe(preview.currency);

	console.log(`[preview-tax] incomplete: currency=${preview.tax?.currency}`);
}, 300_000);
