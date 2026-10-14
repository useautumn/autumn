import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-billing-sub 1: addon creates separate subscription")}`,
	async () => {
		const customerId = "new-billing-sub-v2-addon";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
		});
		expect(preview.total).toBe(20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 2 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id, addon.id],
		});

		expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});
	},
);
