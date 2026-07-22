/** Pooled cancellation removes a source only when cancellation becomes effective. */

import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	EntInterval,
	PooledBalanceResetMode,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import { expectPooledSourceContributionsHydrated } from "../utils/expectPooledSourceContributionsHydrated";
import { getPooledSourceCustomerProduct } from "../utils/getPooledBalanceDbState.js";
import { waitForPooledBalanceCorrect } from "../utils/waitForPooledBalanceCorrect.js";

const CONTRIBUTION = 100;
const USAGE = 50;
const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

const runCancelCase = async ({
	cancelAction,
}: {
	cancelAction: "cancel_immediately" | "cancel_end_of_cycle";
}) => {
	const customerId = `pooled-${cancelAction}`;
	const pooledPlan = products.pro({
		id: `pooled-${cancelAction}-plan`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: CONTRIBUTION }),
				pooled: true,
			},
		],
	});
	const { entities, autumnV2_2, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

	const beforeCancel = await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: CONTRIBUTION * 2 - USAGE,
			adjustment: 0,
			granted: CONTRIBUTION * 2,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: {
			count: 2,
			currentContribution: CONTRIBUTION,
			nextCycleContribution: CONTRIBUTION,
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});
	const outgoingCustomerProduct = getPooledSourceCustomerProduct({
		state: beforeCancel,
		productId: pooledPlan.id,
		entityId: entities[0].id,
	});
	await expectPooledSourceContributionsHydrated({
		ctx,
		customerId,
		contributions: beforeCancel.contributions,
	});

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		customer_product_id: outgoingCustomerProduct.id,
		entity_id: entities[0].id,
		cancel_action: cancelAction,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const entityAfterRequest = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
		{ skip_cache: "true" },
	);
	await expectCustomerProducts({
		customer: entityAfterRequest,
		...(cancelAction === "cancel_immediately"
			? { notPresent: [pooledPlan.id] }
			: { canceling: [pooledPlan.id] }),
	});

	if (cancelAction === "cancel_end_of_cycle") {
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: CONTRIBUTION * 2 - USAGE,
				adjustment: 0,
				granted: CONTRIBUTION * 2,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		if (!testClockId) throw new Error("Expected a Stripe test clock");
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	}

	const usageAfterTransition =
		cancelAction === "cancel_immediately" ? USAGE : 0;
	await waitForPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: CONTRIBUTION - usageAfterTransition,
			adjustment: 0,
			granted: CONTRIBUTION,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: {
			count: 1,
			currentContribution: CONTRIBUTION,
			nextCycleContribution: CONTRIBUTION,
			excludedSourceCustomerProductIds: [outgoingCustomerProduct.id],
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});

	const customerAfterTransition = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer: customerAfterTransition,
		featureId: TestFeature.Messages,
		granted: CONTRIBUTION,
		includedGrant: CONTRIBUTION,
		remaining: CONTRIBUTION - usageAfterTransition,
		usage: usageAfterTransition,
		planId: null,
		breakdownCount: 1,
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled update: cancel immediately removes the source contribution")}`,
	async () => {
		await runCancelCase({ cancelAction: "cancel_immediately" });
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled update: cancel end of cycle removes the source only at transition")}`,
	async () => {
		await runCancelCase({ cancelAction: "cancel_end_of_cycle" });
	},
);
