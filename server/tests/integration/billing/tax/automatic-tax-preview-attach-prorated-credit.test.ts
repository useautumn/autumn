import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

const AU_GST_RATE = 0.1;

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (upgrade with proration credit): preview taxes net subtotal, not positive lines alone",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-upgrade";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: true,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	const expectedTax = immediateLineItemsTotal * AU_GST_RATE;

	console.log(
		`[preview-tax-prorated-credit upgrade] line_items_total=${immediateLineItemsTotal} expectedTax=${expectedTax} actualTax=${preview.tax?.total}`,
	);

	const positiveLines = preview.line_items.filter((li) => li.total > 0);
	const negativeLines = preview.line_items.filter((li) => li.total < 0);
	expect(positiveLines.length).toBeGreaterThan(0);
	expect(negativeLines.length).toBeGreaterThan(0);

	const positiveSum = positiveLines.reduce((sum, li) => sum + li.total, 0);
	expect(positiveSum).toBeGreaterThan(immediateLineItemsTotal + 5);

	expect(preview.tax?.total).toBeGreaterThanOrEqual(expectedTax - 0.05);
	expect(preview.tax?.total).toBeLessThanOrEqual(expectedTax + 0.05);
});

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (downgrade, credit exceeds new charge): preview returns negative tax credit",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-downgrade";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: true,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [
			s.billing.attach({ productId: "premium" }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
		plan_schedule: "immediate",
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	console.log(
		`[preview-tax-prorated-credit downgrade] line_items_total=${immediateLineItemsTotal} actualTax=${preview.tax?.total}`,
	);
	expect(immediateLineItemsTotal).toBeLessThanOrEqual(0);

	const positiveLines = preview.line_items.filter((li) => li.total > 0);
	expect(positiveLines.length).toBeGreaterThan(0);

	const expectedTax = immediateLineItemsTotal * AU_GST_RATE;

	expect(preview.tax?.total).toBeGreaterThanOrEqual(expectedTax - 0.05);
	expect(preview.tax?.total).toBeLessThanOrEqual(expectedTax + 0.05);
	expect(preview.tax?.amount_exclusive).toBeGreaterThanOrEqual(
		expectedTax - 0.05,
	);
	expect(preview.tax?.amount_exclusive).toBeLessThanOrEqual(
		expectedTax + 0.05,
	);
	expect(preview.tax?.amount_inclusive).toBe(0);
});

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (all-positive new attach): regression guard, no proration so tax is unchanged",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-no-credit";
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
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd] }),
		],
		actions: [],
	});

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	const negativeLines = preview.line_items.filter((li) => li.total < 0);
	expect(negativeLines.length).toBe(0);

	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	const expectedTax = immediateLineItemsTotal * AU_GST_RATE;

	console.log(
		`[preview-tax-prorated-credit no-credit] line_items_total=${immediateLineItemsTotal} expectedTax=${expectedTax} actualTax=${preview.tax?.total}`,
	);

	expect(preview.tax?.total).toBeGreaterThanOrEqual(expectedTax - 0.05);
	expect(preview.tax?.total).toBeLessThanOrEqual(expectedTax + 0.05);
});
