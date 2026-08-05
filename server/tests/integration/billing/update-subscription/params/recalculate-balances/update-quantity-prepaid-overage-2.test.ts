/**
 * update-quantity-prepaid-overage (slice 2 of 2)
 *
 * Prepaid recalculation isolation from lifetime grants and add-on plans.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const initialQuantity = 300;
const increasedQuantity = 500;
const trackedUsage = 450;

const getMessagesBalance = ({ customer }: { customer: ApiCustomerV5 }) => {
	const balance = customer.balances[TestFeature.Messages];
	expect(balance).toBeDefined();
	return balance;
};

const getMessagesPlanBucket = ({
	customer,
	planId,
	billingMethod,
}: {
	customer: ApiCustomerV5;
	planId: string;
	billingMethod: BillingMethod;
}) => {
	const balance = getMessagesBalance({ customer });
	const bucket = balance.breakdown?.find(
		(balanceBreakdown) =>
			balanceBreakdown.plan_id === planId &&
			balanceBreakdown.price?.billing_method === billingMethod,
	);

	expect(bucket).toBeDefined();
	return bucket!;
};

const getLifetimeMessagesBucket = ({
	customer,
	planId,
}: {
	customer: ApiCustomerV5;
	planId: string;
}) => {
	const balance = getMessagesBalance({ customer });
	const bucket = balance.breakdown?.find(
		(balanceBreakdown) =>
			balanceBreakdown.plan_id === planId &&
			balanceBreakdown.reset?.interval === ResetInterval.OneOff,
	);

	expect(bucket).toBeDefined();
	return bucket!;
};

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: recalculating prepaid does not touch lifetime usage")}`,
	async () => {
		const customerId = "qty-prepaid-overage-lifetime-isolated";
		const product = products.base({
			id: "prepaid-lifetime-isolated",
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 10,
				}),
				items.lifetimeMessages({
					includedUsage: 200,
				}),
			],
		});

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initialQuantity },
					],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: trackedUsage,
					timeout: 2000,
				}),
			],
		});

		// The tracked usage must be settled before the recalculating update
		// reads it back.
		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 50,
			usage: trackedUsage,
		});

		const customerBefore =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const lifetimeBucketBefore = getLifetimeMessagesBucket({
			customer: customerBefore,
			planId: product.id,
		});
		const prepaidBucketBefore = getMessagesPlanBucket({
			customer: customerBefore,
			planId: product.id,
			billingMethod: BillingMethod.Prepaid,
		});

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: increasedQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const lifetimeBucketAfter = getLifetimeMessagesBucket({
			customer: customerAfter,
			planId: product.id,
		});
		const prepaidBucketAfter = getMessagesPlanBucket({
			customer: customerAfter,
			planId: product.id,
			billingMethod: BillingMethod.Prepaid,
		});

		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: 250,
			usage: trackedUsage,
		});
		expect(lifetimeBucketAfter).toMatchObject({
			included_grant: lifetimeBucketBefore.included_grant,
			prepaid_grant: lifetimeBucketBefore.prepaid_grant,
			remaining: lifetimeBucketBefore.remaining,
			usage: lifetimeBucketBefore.usage,
		});
		expect(prepaidBucketAfter.usage).toBe(prepaidBucketBefore.usage);
		expect(prepaidBucketAfter.remaining).toBe(
			prepaidBucketBefore.remaining + 200,
		);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: updating pro prepaid does not touch add-on prepaid")}`,
	async () => {
		const customerId = "qty-prepaid-overage-addon-prepaid-isolated";
		const pro = products.pro({
			id: "pro-prepaid-main",
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const recurringPlusPack = products.base({
			id: "recurring-plus-pack",
			isAddOn: true,
			items: [
				items.lifetimeMessages({
					includedUsage: 200,
				}),
			],
		});

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringPlusPack] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initialQuantity },
					],
				}),
				s.billing.attach({
					productId: recurringPlusPack.id,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 350,
					timeout: 2000,
				}),
			],
		});

		// The tracked usage must be settled before the recalculating update
		// reads it back.
		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 150,
			usage: 350,
		});

		const customerBefore =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const proBucketBefore = getMessagesPlanBucket({
			customer: customerBefore,
			planId: pro.id,
			billingMethod: BillingMethod.Prepaid,
		});

		const lifetimeBucketBefore = getLifetimeMessagesBucket({
			customer: customerBefore,
			planId: recurringPlusPack.id,
		});

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: increasedQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const proBucketAfter = getMessagesPlanBucket({
			customer: customerAfter,
			planId: pro.id,
			billingMethod: BillingMethod.Prepaid,
		});
		const lifetimeBucketAfter = getLifetimeMessagesBucket({
			customer: customerAfter,
			planId: recurringPlusPack.id,
		});

		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: 350,
			usage: 350,
		});
		expect(lifetimeBucketAfter).toMatchObject({
			included_grant: lifetimeBucketBefore.included_grant,
			prepaid_grant: lifetimeBucketBefore.prepaid_grant,
			remaining: lifetimeBucketBefore.remaining,
			usage: lifetimeBucketBefore.usage,
		});
		expect(proBucketAfter.usage).toBe(proBucketBefore.usage);
		expect(proBucketAfter.remaining).toBe(proBucketBefore.remaining + 200);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: recalculating pro prepaid clears add-on overage")}`,
	async () => {
		const customerId = "qty-prepaid-overage-addon-usage-based";
		const pro = products.pro({
			id: "pro-prepaid-messages",
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const overageAddOn = products.recurringAddOn({
			id: "addon-overage-messages",
			items: [
				items.consumableMessages({
					includedUsage: 0,
				}),
			],
		});

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, overageAddOn] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initialQuantity },
					],
				}),
				s.billing.attach({
					productId: overageAddOn.id,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: trackedUsage,
					timeout: 2000,
				}),
			],
		});

		// The tracked usage must be settled before the recalculating update
		// reads it back.
		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: trackedUsage,
		});

		const customerBefore =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const addOnUsageBucketBefore = getMessagesPlanBucket({
			customer: customerBefore,
			planId: overageAddOn.id,
			billingMethod: BillingMethod.UsageBased,
		});
		expect(addOnUsageBucketBefore.usage).toBe(150);

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: increasedQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const proBucketAfter = getMessagesPlanBucket({
			customer: customerAfter,
			planId: pro.id,
			billingMethod: BillingMethod.Prepaid,
		});
		const addOnUsageBucketAfter = getMessagesPlanBucket({
			customer: customerAfter,
			planId: overageAddOn.id,
			billingMethod: BillingMethod.UsageBased,
		});

		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: 50,
			usage: trackedUsage,
		});
		expect(proBucketAfter.remaining).toBe(50);
		expect(addOnUsageBucketAfter).toMatchObject({
			remaining: 0,
			usage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
