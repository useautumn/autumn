import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 1: free allocated to pro allocated")}`, async () => {
	const customerId = "imm-switch-free-alloc-to-pro";

	const freeAllocated = items.monthlyUsers({ includedUsage: 3 });
	const free = products.base({
		id: "free",
		items: [freeAllocated],
	});

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 2: allocated under limit, same included")}`, async () => {
	const customerId = "imm-switch-alloc-under-same";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const proVariantAllocated = items.allocatedUsers({ includedUsage: 3 });
	const proVariant = products.premium({
		id: "pro-variant",
		items: [proVariantAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proVariant] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proVariant.id,
	});
	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proVariant.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proVariant.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 3: allocated at limit, same included")}`, async () => {
	const customerId = "imm-switch-alloc-at-limit";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const proVariantAllocated = items.allocatedUsers({ includedUsage: 3 });
	const proVariant = products.premium({
		id: "pro-variant",
		items: [proVariantAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proVariant] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 0,
		usage: 3,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proVariant.id,
	});
	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proVariant.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proVariant.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 0,
		usage: 3,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 4: allocated under limit, higher included")}`, async () => {
	const customerId = "imm-switch-alloc-under-higher";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 5 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 3,
		usage: 2,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 5: allocated over limit, higher included")}`, async () => {
	const customerId = "imm-switch-alloc-over-higher";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	await new Promise((r) => setTimeout(r, 4000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 20,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 5,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 10,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 6: allocated usage carries over")}`, async () => {
	const customerId = "imm-switch-allocated-carry";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 5 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 3,
		usage: 2,
	});
});
