import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created consumable: attach → track decimal overage → advance cycle")}`,
	async () => {
		const customerId = "inv-created-cons-decimal";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id, timeout: 2000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 250.5,
					timeout: 2000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 250.5 }],
			options: { includeFixed: false, onlyArrear: true },
		});

		expect(expectedOverage).toBe(15.1);

		const customerAfterAdvance = await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductId: pro.id,
		});

		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(
			100,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created consumable: no overage - track within included → advance cycle")}`,
	async () => {
		const customerId = "inv-created-cons-no-ovg";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 50 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductId: pro.id,
		});

		expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(
			100,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created consumable: large overage → advance cycle")}`,
	async () => {
		const customerId = "inv-created-cons-large";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 1000 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 1000 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(90);

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductId: pro.id,
		});

		expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(
			100,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created consumable: billing units rounding up → advance cycle")}`,
	async () => {
		const customerId = "inv-created-cons-billing-units";

		const consumableItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1,
			billingUnits: 10,
		});

		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 155 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 155 }],
			options: { includeFixed: false, onlyArrear: true },
		});

		expect(expectedOverage).toBe(6);

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductId: pro.id,
		});

		expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(
			100,
		);
	},
);
