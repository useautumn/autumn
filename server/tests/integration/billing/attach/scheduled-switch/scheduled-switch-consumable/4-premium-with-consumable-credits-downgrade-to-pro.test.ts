import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 4: premium with consumable credits, downgrade to pro")}`,
	async () => {
		const customerId = "sched-switch-premium-credits-to-pro";

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

		const proConsumableCredits = items.consumable({
			featureId: TestFeature.Credits,
			includedUsage: 100,
			price: 0.1,
			billingUnits: 1,
		});

		const pro = products.pro({
			id: "pro",
			items: [proConsumableCredits],
		});

		const usageAmount = 300;

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, timeout: 5000 }),
				s.track({
					featureId: TestFeature.Credits,
					value: usageAmount,
					timeout: 2000,
				}),
				s.billing.attach({ productId: pro.id }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [premium.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Credits,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductIds: [pro.id, premium.id],
		});
	},
);
