import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: basic refund")}`,
	async () => {
		const customerId = "cancel-addon-imm-1";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({ items: [messagesItem] });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: recurringAddon.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 2,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [pro.id],
			notPresent: [recurringAddon.id],
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 3,
			latestTotal: -20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: usage overage not charged")}`,
	async () => {
		const customerId = "cancel-addon-imm-2";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.base({
			id: "pro",
			items: [messagesItem],
		});

		const usageAddon = products.base({
			id: "usage-addon",
			isAddOn: true,
			items: [
				items.monthlyPrice({ price: 20 }),
				items.consumableMessages({ includedUsage: 0 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, usageAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: usageAddon.id }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: usageAddon.id,
			cancel_action: "cancel_immediately",
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [pro.id],
			notPresent: [usageAddon.id],
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 2,
			latestTotal: -20,
		});
	},
);
