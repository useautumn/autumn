import { test } from "bun:test";
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
	`${chalk.yellowBright("new-billing-sub 5: downgrade ignores flag")}`,
	async () => {
		const customerId = "new-billing-sub-v2-downgrade-ignored";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
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
			actions: [s.billing.attach({ productId: premium.id })],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 1 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			canceling: [premium.id],
			scheduled: [pro.id],
		});

		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 50,
		});
	},
);
