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

	expect(preview.invoice_credits?.balance ?? 0).toBe(0);
	expect(preview.total).toBeCloseTo(
		preview.subtotal + (preview.tax?.total ?? 0),
		2,
	);
	expect(preview.total).toBeGreaterThan(preview.subtotal);
});

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-immediate (auto_tax off): preview omits the tax field entirely",
)}`, async () => {
	const customerId = "tax-preview-off";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
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

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-immediate (auto_tax on, no address): preview returns tax.status=requires_location with zeros",
)}`, async () => {
	const customerId = "tax-preview-on-no-addr";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
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
	expect(preview.tax?.status).toBe("requires_location");
	expect(preview.tax?.total).toBe(0);
	expect(preview.tax?.amount_exclusive).toBe(0);
	expect(preview.tax?.amount_inclusive).toBe(0);
	expect(preview.tax?.currency).toBe(preview.currency);

	console.log(`[preview-tax] requires_location: currency=${preview.tax?.currency}`);
});
