/**
 * update-quantity-prepaid-overage (slice 1 of 2)
 *
 * Prepaid + overage quantity updates on a single plan.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const initialQuantity = 300;
const increasedQuantity = 500;
const decreasedQuantity = 200;
const trackedUsage = 450;

const buildPrepaidOverageProduct = ({
	id,
	onDecrease,
}: {
	id: string;
	onDecrease?: OnDecrease;
}) =>
	products.base({
		id,
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
				prorationConfig: onDecrease
					? {
							onDecrease,
						}
					: undefined,
			}),
			items.consumableMessages({
				includedUsage: 0,
			}),
		],
	});

const getMessagesBalance = ({ customer }: { customer: ApiCustomerV5 }) => {
	const balance = customer.balances[TestFeature.Messages];
	expect(balance).toBeDefined();
	return balance;
};

const expectPrepaidOverageCustomer = ({
	customer,
	remaining,
	usage,
	prepaidRemaining,
	usageBasedRemaining = 0,
	usageBasedUsage,
}: {
	customer: ApiCustomerV5;
	remaining: number;
	usage: number;
	prepaidRemaining: number;
	usageBasedRemaining?: number;
	usageBasedUsage: number;
}) => {
	const balance = getMessagesBalance({ customer });
	const prepaidBuckets =
		balance.breakdown?.filter(
			(balanceBreakdown) =>
				balanceBreakdown.price?.billing_method === BillingMethod.Prepaid,
		) ?? [];
	const usageBasedBuckets =
		balance.breakdown?.filter(
			(balanceBreakdown) =>
				balanceBreakdown.price?.billing_method === BillingMethod.UsageBased,
		) ?? [];

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining,
		usage,
	});

	expect(
		prepaidBuckets.reduce(
			(total, balanceBreakdown) => total + balanceBreakdown.remaining,
			0,
		),
	).toBe(prepaidRemaining);
	expect(
		usageBasedBuckets.reduce(
			(total, balanceBreakdown) => total + balanceBreakdown.remaining,
			0,
		),
	).toBe(usageBasedRemaining);
	expect(
		usageBasedBuckets.reduce(
			(total, balanceBreakdown) => total + balanceBreakdown.usage,
			0,
		),
	).toBe(usageBasedUsage);
};

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: increase quantity with balance recalculation")}`,
	async () => {
		const customerId = "qty-prepaid-overage-increase";
		const product = buildPrepaidOverageProduct({
			id: "prepaid-overage-increase",
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
			remaining: 0,
			usage: trackedUsage,
		});

		const customerBefore =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectPrepaidOverageCustomer({
			customer: customerBefore,
			remaining: 0,
			usage: trackedUsage,
			prepaidRemaining: 0,
			usageBasedUsage: 150,
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
		expectPrepaidOverageCustomer({
			customer: customerAfter,
			remaining: 50,
			usage: trackedUsage,
			prepaidRemaining: 50,
			usageBasedUsage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: increasing zero prepaid preserves usage-based grant")}`,
	async () => {
		const customerId = "qty-prepaid-preserve-usage-grant";
		const monthlyBasePrice = 20;
		const consumableIncludedUsage = 100;
		const checkoutPrepaidQuantity = 600;
		const expectedPrepaidCharge = 50;

		const product = products.base({
			id: "prepaid-preserve-usage-grant",
			items: [
				items.monthlyPrice({ price: monthlyBasePrice }),
				items.consumableMessages({
					includedUsage: consumableIncludedUsage,
				}),
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: 1,
					tiers: [
						{ to: 500, amount: 0, flat_amount: 0 },
						{ to: "inf", amount: 0, flat_amount: 50 },
					],
				}),
			],
		});

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({
					productId: product.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			remaining: consumableIncludedUsage,
			usage: 0,
			breakdown: {
				[BillingMethod.UsageBased]: {
					included_grant: consumableIncludedUsage,
					remaining: consumableIncludedUsage,
					usage: 0,
				},
				[BillingMethod.Prepaid]: {
					prepaid_grant: 0,
					remaining: 0,
					usage: 0,
				},
			},
		});

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: checkoutPrepaidQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: checkoutPrepaidQuantity + consumableIncludedUsage,
			usage: 0,
			breakdown: {
				[BillingMethod.UsageBased]: {
					included_grant: consumableIncludedUsage,
					remaining: consumableIncludedUsage,
					usage: 0,
				},
				[BillingMethod.Prepaid]: {
					prepaid_grant: checkoutPrepaidQuantity,
					remaining: checkoutPrepaidQuantity,
					usage: 0,
				},
			},
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedPrepaidCharge,
			latestStatus: "paid",
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: decrease quantity with balance recalculation")}`,
	async () => {
		const customerId = "qty-prepaid-overage-decrease";
		const product = buildPrepaidOverageProduct({
			id: "prepaid-overage-decrease",
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
			remaining: 0,
			usage: trackedUsage,
		});

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: decreasedQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectPrepaidOverageCustomer({
			customer: customerAfter,
			remaining: 0,
			usage: trackedUsage,
			prepaidRemaining: 0,
			usageBasedUsage: 250,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: increase quantity without balance recalculation")}`,
	async () => {
		const customerId = "qty-prepaid-overage-no-backfill";
		const product = buildPrepaidOverageProduct({
			id: "prepaid-overage-no-backfill",
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
			remaining: 0,
			usage: trackedUsage,
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
				enabled: false,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectPrepaidOverageCustomer({
			customer: customerAfter,
			remaining: 200,
			usage: trackedUsage,
			prepaidRemaining: 200,
			usageBasedUsage: 150,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity-prepaid-overage: no-proration downgrade keeps balances unchanged")}`,
	async () => {
		const customerId = "qty-prepaid-overage-no-proration";
		const product = buildPrepaidOverageProduct({
			id: "prepaid-overage-no-proration",
			onDecrease: OnDecrease.None,
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
			remaining: 0,
			usage: trackedUsage,
		});

		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: decreasedQuantity,
				},
			],
			recalculate_balances: {
				enabled: true,
			},
		});

		const customerAfter =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectPrepaidOverageCustomer({
			customer: customerAfter,
			remaining: 0,
			usage: trackedUsage,
			prepaidRemaining: 0,
			usageBasedUsage: 150,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
