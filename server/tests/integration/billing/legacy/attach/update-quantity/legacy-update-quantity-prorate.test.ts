import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { calculateProratedCharge } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

test.concurrent(
	`${chalk.yellowBright("attach: quantity upgrade mid-cycle with prorate immediately")}`,
	async () => {
		const customerId = "attach-qty-upgrade-mid-cycle";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
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

		const usage = Math.floor(Math.random() * 220);

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
					timeout: 5000,
				}),
				s.track({ featureId: TestFeature.Messages, value: usage }),
				s.advanceTestClock({ weeks: 2 }),
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
					timeout: 5000,
				}),
			],
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerFinal.features[TestFeature.Messages].balance).toBe(
			500 - usage,
		);

		const upgradeQuantity = 500 - 400;
		const billingUnits = prepaidItem.billing_units ?? 1;
		if (prepaidItem.price == null)
			throw new Error("Missing price on prepaid item");

		if (billingUnits <= 0)
			throw new Error("Billing units must be greater than zero");

		const pricePerUnit = prepaidItem.price;
		const fullUpgradeAmount = new Decimal(upgradeQuantity)
			.div(billingUnits)
			.mul(pricePerUnit)
			.toNumber();
		const frozenTimeMs = Math.floor(advancedTo / 1000) * 1000;
		const expectedLatestTotal = await calculateProratedCharge({
			customerId,
			nowMs: frozenTimeMs,
			amount: fullUpgradeAmount,
		});

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 2,
			latestInvoiceProductId: pro.id,
			latestTotal: expectedLatestTotal,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500 - usage,
			usage: usage,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach: quantity upgrade with prorate-next-cycle")}`,
	async () => {
		const customerId = "attach-qty-upgrade-prorate-next";

		const prepaidItem = items.prepaidMessages({
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateNextCycle,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const usage = Math.floor(Math.random() * 220);

		const { autumnV1, ctx } = await initScenario({
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
				s.track({
					featureId: TestFeature.Messages,
					value: usage,
					timeout: 2000,
				}),
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
				}),
			],
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerFinal.features[TestFeature.Messages].balance).toBe(
			400 - usage,
		);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 1,
		});

		await expectProductItemCorrect({
			customer: customerFinal,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 400,
			upcomingQuantity: "undefined",
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
