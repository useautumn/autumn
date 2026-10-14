import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 3: chain premium -> pro -> free -> pro -> premium")}`,
	async () => {
		const customerId = "legacy-downgrade-3";

		const wordsConsumable = items.consumableWords();
		const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const pro = products.pro({ id: "pro", items: [wordsConsumable] });
		const free = products.base({ id: "free", items: [wordsIncluded] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [premium, pro, free] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: free.id });
		await expectProductNotPresent({ customer, productId: pro.id });

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });
		await expectProductNotPresent({ customer, productId: free.id });

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectProductNotPresent({ customer, productId: pro.id });
		await expectProductNotPresent({ customer, productId: free.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 5: premium -> pro schedule, renew, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-5";

		const dashboardItem = items.dashboard();
		const messagesItemPro = items.monthlyMessages({ includedUsage: 10 });
		const adminItem = items.adminRights();
		const messagesItemPremium = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItemPro, adminItem],
		});
		const premium = products.premium({
			id: "premium",
			items: [messagesItemPremium],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectProductNotPresent({ customer, productId: pro.id });

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			minimumWaitForSeconds: 30,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfter,
			productId: pro.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: premium.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			balance: 10,
		});
	},
);
