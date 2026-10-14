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
	`${chalk.yellowBright("legacy-downgrade 1: premium -> pro, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-1";

		const wordsItem = items.consumableWords();
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

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

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});

		await expectProductScheduled({
			customer: customerBefore,
			productId: pro.id,
		});

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
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 2: premium -> free, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-2";

		const wordsConsumable = items.consumableWords();
		const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const free = products.base({ id: "free", items: [wordsIncluded] });

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [premium, free] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});

		await expectProductScheduled({
			customer: customerBefore,
			productId: free.id,
		});

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
			productId: free.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: premium.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Words,
			balance: 100,
		});
	},
);
