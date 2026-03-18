import { test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	OnDecrease,
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
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining,
		usage,
		breakdown: {
			[BillingMethod.Prepaid]: {
				remaining: prepaidRemaining,
			},
			[BillingMethod.UsageBased]: {
				remaining: usageBasedRemaining,
				usage: usageBasedUsage,
			},
		},
	});
};

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage: increase quantity with backfill")}`, async () => {
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
		backfill_prepaid_update: true,
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
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage: decrease quantity with backfill")}`, async () => {
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

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: decreasedQuantity,
			},
		],
		backfill_prepaid_update: true,
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
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage: increase quantity without backfill")}`, async () => {
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

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: increasedQuantity,
			},
		],
		backfill_prepaid_update: false,
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
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage: no-proration downgrade keeps balances unchanged")}`, async () => {
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

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: decreasedQuantity,
			},
		],
		backfill_prepaid_update: true,
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
});
