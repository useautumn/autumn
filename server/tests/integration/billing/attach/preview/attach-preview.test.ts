import { expect, test } from "bun:test";
import { expectPreviewChanges } from "@tests/integration/billing/utils/expectPreviewChanges";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach preview: new plan")}`, async () => {
	const customerId = "attach-preview-new-plan";
	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(preview.total).toBe(30);
	expectPreviewChanges({
		preview,
		incoming: [
			{
				planId: pro.id,
				featureQuantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
				effectiveAt: null,
			},
		],
		outgoing: [],
	});
});

test.concurrent(`${chalk.yellowBright("attach preview: immediate switch")}`, async () => {
	const customerId = "attach-preview-immediate-switch";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(preview.total).toBe(30);
	expectPreviewChanges({
		preview,
		incoming: [{ planId: premium.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});

test.concurrent(`${chalk.yellowBright("attach preview: scheduled switch")}`, async () => {
	const customerId = "attach-preview-scheduled-switch";
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});

	expect(preview.total).toBe(0);
	expectPreviewChanges({
		preview,
		incoming: [{ planId: free.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});
