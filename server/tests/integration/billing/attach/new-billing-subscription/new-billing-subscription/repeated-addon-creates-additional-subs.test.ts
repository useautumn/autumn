import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-billing-sub 2: repeated addon creates additional subs")}`,
	async () => {
		const customerId = "new-billing-sub-v2-repeat";

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
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: addon.id,
					newBillingSubscription: true,
				}),
			],
		});

		await expectSubCount({ ctx, customerId, count: 2 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 3 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const addonProduct = customer.products.find((p) => p.id === addon.id);
		expect(addonProduct?.quantity).toBe(2);

		expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 20,
		});
	},
);
