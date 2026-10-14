import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach: prepaid add-on with entities - upgrade and downgrade")}`,
	async () => {
		const customerId = "attach-prepaid-addon-entities";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 250 })],
		});

		const premium = products.pro({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const prepaidAddOn = products.recurringAddOn({
			id: "topup",
			items: [
				items.prepaidMessages({
					billingUnits: 100,
					price: 12.5,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
			],
		});

		const entity1Quantity = 100;
		const entity2OriginalQuantity = 300;
		const entity1UpgradedQuantity = 200;
		const entity2DowngradedQuantity = 200;

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, premium, prepaidAddOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({
					productId: prepaidAddOn.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: entity1Quantity },
					],
					newBillingSubscription: true,
				}),
				s.attach({ productId: premium.id, entityIndex: 1 }),
				s.attach({
					productId: prepaidAddOn.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: entity2OriginalQuantity,
						},
					],
					newBillingSubscription: true,
				}),
				s.attach({
					productId: prepaidAddOn.id,
					entityIndex: 0,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: entity1UpgradedQuantity,
						},
					],
					timeout: 10000,
				}),
				s.attach({
					productId: prepaidAddOn.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: entity2DowngradedQuantity,
						},
					],
					timeout: 5000,
				}),
			],
		});

		const entity2 = await autumnV1.entities.get(customerId, "ent-2");

		expect(entity2.invoices?.length).toBe(2);

		await expectProductItemCorrect({
			customer: entity2,
			productId: prepaidAddOn.id,
			featureId: TestFeature.Messages,
			quantity: entity2OriginalQuantity,
			upcomingQuantity: entity2DowngradedQuantity,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach: prepaid users upgrade quantity mid-cycle, usage preserved")}`,
	async () => {
		const customerId = "attach-prepaid-users-qty-upgrade";
		const usage = 2;

		const prepaidItem = items.prepaidUsers({
			billingUnits: 1,
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Users, quantity: 2 }],
				}),
			],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV1.attach({
					customer_id: customerId,
					product_id: pro.id,
					options: [{ feature_id: TestFeature.Users, quantity: 2 }],
				});
			},
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usage,
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Users, quantity: 4 }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Users,
			includedUsage: 4,
			balance: 4 - usage,
			usage,
		});
	},
);
