import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-billing-sub 8: free to paid main merges into existing paid cycle")}`,
	async () => {
		const customerId = "new-billing-sub-v2-free-to-paid-main-merge";

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, addon, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: addon.id }),
			],
		});

		await expectSubCount({ ctx, customerId, count: 1 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			new_billing_subscription: false,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 1 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id, addon.id],
			notPresent: [free.id],
		});
	},
);
