import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 1: overage, upgrade resets")}`, async () => {
	const customerId = "imm-switch-consumable-overage";

	const proConsumable = items.consumableMessages({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const premiumConsumable = items.consumableMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumConsumable],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await new Promise((r) => setTimeout(r, 4000));

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 50,
		usage: 150,
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
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 2: multiple with overage, upgrade charges")}`, async () => {
	const customerId = "imm-switch-multi-consumable-overage";

	const proMessagesConsumable = items.consumableMessages({
		includedUsage: 100,
	});
	const proWordsConsumable = items.consumableWords({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesConsumable, proWordsConsumable],
	});

	const premiumMessagesConsumable = items.consumableMessages({
		includedUsage: 500,
	});
	const premiumWordsConsumable = items.consumableWords({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesConsumable, premiumWordsConsumable],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await new Promise((r) => setTimeout(r, 4000));

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 300,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50,
		usage: 150,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: -100,
		usage: 300,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(40);

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
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 40,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 3: mid-cycle, arrear not prorated")}`, async () => {
	const customerId = "imm-switch-consumable-midcycle";

	const proWordsConsumable = items.consumableWords({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proWordsConsumable],
	});

	const premiumWordsConsumable = items.consumableWords({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumWordsConsumable],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Words, value: 300, timeout: 4000 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: -100,
		usage: 300,
	});

	const proratedBaseDiff = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 50,
	});

	const arrearOverage = 5;
	const expectedTotal = proratedBaseDiff + arrearOverage;

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

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
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});
