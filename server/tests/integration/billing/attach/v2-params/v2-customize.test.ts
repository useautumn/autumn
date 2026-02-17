import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isPriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";

test.concurrent(`${chalk.yellowBright("v2-customize attach: both customize.price + customize.items")}`, async () => {
	const customerId = "v2-attach-customize-both";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: base.id,
		redirect_mode: "if_required",
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.monthlyWords({ included: 250 }), itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(30);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: base.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 250,
		balance: 250,
		usage: 0,
	});
	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: only customize.price")}`, async () => {
	const customerId = "v2-attach-customize-only-price";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: base.id,
		redirect_mode: "if_required",
		customize: {
			price: itemsV2.monthlyPrice({ amount: 25 }),
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(25);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: base.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 25,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: only customize.items")}`, async () => {
	const customerId = "v2-attach-customize-only-items";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		customize: {
			// price: null,
			items: [itemsV2.monthlyMessages({ included: 220 })],
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(20);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 220,
		balance: 220,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	// Verify that the original product price is still attached (price: null means keep original)

	const customerProduct = customer.products.find((p) => p.id === pro.id);
	const priceItem = customerProduct?.items?.find(isPriceItem);
	expect(priceItem).toBeDefined();
	expect(priceItem?.price).toBe(20);
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: price null makes product free")}`, async () => {
	const customerId = "v2-attach-customize-price-null-free";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 50 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		customize: {
			price: null,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(0);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	// Verify the customized feature is correct
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify no invoice was created (product is free)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	// Verify no price item exists on the customer product
	const customerProduct = customer.products.find((p) => p.id === pro.id);
	const priceItem = customerProduct?.items?.find(isPriceItem);
	expect(priceItem).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: plan item v1 prepaid mapping")}`, async () => {
	const customerId = "v2-attach-customize-prepaid-map";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: base.id,
		redirect_mode: "if_required",
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		customize: {
			price: null,
			items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 })],
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(10);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: plan item v1 multi-feature mapping")}`, async () => {
	const customerId = "v2-attach-customize-multi-feature-map";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: base.id,
		redirect_mode: "if_required",
		customize: {
			price: itemsV2.monthlyPrice({ amount: 40 }),
			items: [
				itemsV2.monthlyMessages({ included: 300 }),
				itemsV2.monthlyWords({ included: 150 }),
			],
		},
	};

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 150,
		balance: 150,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize attach: paid feature mix (consumable + prepaid + allocated)")}`, async () => {
	const customerId = "v2-attach-customize-paid-feature-mix";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		product_id: base.id,
		redirect_mode: "if_required",
		options: [{ feature_id: TestFeature.Words, quantity: 500 }],
		customize: {
			price: itemsV2.monthlyPrice({ amount: 40 }),
			items: [
				itemsV2.consumableMessages({ amount: 1 }),
				itemsV2.prepaidWords({ amount: 15, billingUnits: 100, included: 200 }),
				itemsV2.allocatedUsers({ amount: 10, included: 3 }),
			],
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);

	// Base ($40) + prepaid words ($15 for 100 units) + allocated users at included quantity
	expect(preview.total).toBe(85);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Messages,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
