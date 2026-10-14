import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
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
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("invoice.created consumable edge: downgrade with overage billed to previous product")}`, async () => {
	const customerId = "inv-created-cons-downgrade";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.attach({ productId: pro.id }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const expectedOverage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(10);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [pro.id],
		notPresent: [premium.id],
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage,
		latestInvoiceProductIds: [pro.id, premium.id],
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("invoice.created consumable edge: addon separate subscription with consumable")}`, async () => {
	const customerId = "inv-created-cons-addon-sep-sub";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const consumableWordsItem = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [consumableWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id, newBillingSubscription: true }),
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.track({ featureId: TestFeature.Words, value: 150 }),
			s.advanceToNextInvoice(),
		],
	});

	const expectedMessagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedMessagesOverage).toBe(10);

	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: addon.items,
		usage: [{ featureId: TestFeature.Words, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedWordsOverage).toBe(5);
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: addon.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 4,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
	expect(customerAfterAdvance.features[TestFeature.Words].balance).toBe(50);

	const invoices = customerAfterAdvance.invoices ?? [];

	const sortedInvoices = [...invoices].sort(
		(a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
	);
	const [latestInvoice, secondLatestInvoice] = sortedInvoices;

	const proRenewalInvoice = [latestInvoice, secondLatestInvoice].find((inv) =>
		inv.product_ids?.includes(pro.id),
	);
	const addonRenewalInvoice = [latestInvoice, secondLatestInvoice].find((inv) =>
		inv.product_ids?.includes(addon.id),
	);

	expect(proRenewalInvoice).toBeDefined();
	expect(proRenewalInvoice?.total).toBe(20 + expectedMessagesOverage);

	expect(addonRenewalInvoice).toBeDefined();
	expect(addonRenewalInvoice?.total).toBe(20 + expectedWordsOverage);
});
