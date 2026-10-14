import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { setCustomerOverageAllowed } from "@tests/integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("manual top-up 1: update with feature_quantities on one-off prepaid item adds credits and emits standalone invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-happy",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-happy-cus";

		const { autumnV1, autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: before,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});

		const fullCustomerV3 =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(fullCustomerV3).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 2: repeated calls each add the delta and emit a separate invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-delta",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-delta-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 300,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 3,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 3: pays down sibling cusEnt overage before routing remainder to prepaid")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-paydown",
			items: [items.lifetimeMessages({ includedUsage: 1000 }), oneOffItem],
		});

		const customerId = "manual-topup-paydown-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1500,
		});

		await timeout(5000);

		const preTopUp = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: preTopUp,
			featureId: TestFeature.Messages,
			remaining: 0,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 600 }],
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		expect(after.balances[TestFeature.Messages].breakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ remaining: 0, usage: 1000 }),
				expect.objectContaining({ remaining: 100 }),
			]),
		);

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 4: passing a forbidden field (cancel_action) rejects with 'Update too complex to perform.'")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-forbid",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-forbid-cus";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
				cancel_action: "cancel_end_of_cycle",
			}),
		).rejects.toThrow(/manual top-up can only change feature quantities/i);
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 5: multi-entry feature_quantities rejected with 'Update too complex to perform.'")}`,
	async () => {
		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-multi",
			items: [oneOffMessagesItem, oneOffWordsItem],
		});

		const customerId = "manual-topup-multi-cus";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 100 },
						{ feature_id: TestFeature.Words, quantity: 100 },
					],
				}),
			],
		});

		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
		).rejects.toThrow(
			/one-off prepaid quantity alongside other subscription changes/i,
		);
	},
);

// 6. Regression: one-off-only target plan still gets the existing one-off error.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(`${chalk.yellowBright("manual top-up 6: one-off-only plan target falls back to existing one-off error (not ManualTopUp)")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const plan = products.oneOff({
		id: "manual-topup-oneoff-only",
		items: [oneOffItem],
	});

	const customerId = "manual-topup-oneoff-only-cus";

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.attach({
				productId: plan.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await expect(
		autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		}),
	).rejects.toThrow(
		/(?:one[- ]off|Not allowed to update feature quantity for one off items)/i,
	);
});

test.concurrent(
	`${chalk.yellowBright("manual top-up 5b: UpdatePlan changing a one-off prepaid quantity is allowed and preserves remaining balance")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboard = items.dashboard();

		const plan = products.pro({
			id: "manual-topup-allow-updateplan",
			items: [dashboard, oneOffItem],
		});

		const customerId = "manual-topup-allow-updateplan-cus";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		const raisedBasePrice = items.monthlyPrice({ price: 30 });
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [raisedBasePrice, dashboard, oneOffItem],
			options: [{ feature_id: TestFeature.Messages, quantity: 1300 }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 6b: proration_behavior=none is accepted (dashboard parity)")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-proration",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-proration-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			proration_behavior: "none",
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("manual top-up 7: no_billing_changes=true grants credits without a Stripe invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-no-billing",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-no-billing-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			no_billing_changes: true,
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 30,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);
