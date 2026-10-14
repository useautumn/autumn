import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach: quantity decrease → increase → decrease flow")}`,
	async () => {
		const customerId = "attach-qty-dec-inc-dec";

		const prepaidItem = items.prepaidMessages({
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(
			300,
		);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customerAfterDecrease =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfterDecrease.features[TestFeature.Messages].balance).toBe(
			300,
		);
		await expectProductItemCorrect({
			customer: customerAfterDecrease,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 300,
			upcomingQuantity: 200,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterIncrease =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfterIncrease.features[TestFeature.Messages].balance).toBe(
			400,
		);
		expectCustomerInvoiceCorrect({
			customer: customerAfterIncrease,
			count: 2,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerFinal.features[TestFeature.Messages].balance).toBe(400);
		await expectProductItemCorrect({
			customer: customerFinal,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 400,
			upcomingQuantity: 200,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach: quantity decrease with OnDecrease.None + track + next cycle reset")}`,
	async () => {
		const customerId = "attach-qty-dec-none-next-cycle";
		const billingUnits = 100;
		const pricePerPack = 10;
		const includedUsage = 100;
		const usage = 50;

		const prepaidItem = items.prepaidMessages({
			includedUsage,
			billingUnits,
			price: pricePerPack,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [prepaidItem, priceItem],
		});

		const initialQuantityV1 = 300;
		const initialTotalBalance = includedUsage + initialQuantityV1;
		const initialPacks = initialQuantityV1 / billingUnits;

		const { autumnV1, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
					],
				}),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance,
			balance: initialTotalBalance,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1,
			latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance,
			balance: initialTotalBalance - usage,
			usage: usage,
		});

		const downgradedQuantityV1 = 200;
		const downgradedTotalBalance = includedUsage + downgradedQuantityV1;
		const downgradedPacks = downgradedQuantityV1 / billingUnits;

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: downgradedQuantityV1 },
			],
		});

		const customerAfterDowngrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterDowngrade,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance,
			balance: initialTotalBalance - usage,
			usage: usage,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterDowngrade,
			count: 1,
		});

		await expectProductItemCorrect({
			customer: customerAfterDowngrade,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: initialPacks * billingUnits,
			upcomingQuantity: downgradedPacks * billingUnits,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: downgradedTotalBalance,
			balance: downgradedTotalBalance,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0),
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
