import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 5: premium with consumable credits, downgrade to free")}`,
	async () => {
		const customerId = "sched-switch-premium-credits-to-free";

		const premiumConsumableCredits = items.consumable({
			featureId: TestFeature.Credits,
			includedUsage: 200,
			price: 0.1,
			billingUnits: 1,
		});

		const premium = products.premium({
			id: "premium",
			items: [premiumConsumableCredits],
		});

		const freeCredits = items.monthlyCredits({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeCredits],
		});

		const usageAmount = 350;

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, free] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, timeout: 5000 }),
				s.track({
					featureId: TestFeature.Credits,
					value: usageAmount,
					timeout: 2000,
				}),
				s.billing.attach({ productId: free.id }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(15);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [free.id],
			notPresent: [premium.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Credits,
			balance: 50,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductIds: [premium.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
