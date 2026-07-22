/** Scheduled attach downgrades replace pooled contributions without replaying usage. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type AttachParamsV1Input,
	EntInterval,
	PooledBalanceResetMode,
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

const USAGE = 50;
const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

const runDowngradeCase = async ({
	id,
	premiumGrant,
	proGrant,
}: {
	id: string;
	premiumGrant: number;
	proGrant: number;
}) => {
	const customerId = `pooled-downgrade-${id}`;
	const premium = products.premium({
		id: `pooled-premium-${id}`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: premiumGrant }),
				pooled: true,
			},
		],
	});
	const pro = products.pro({
		id: `pooled-pro-${id}`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: proGrant }),
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
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

	const initialGrant = premiumGrant + proGrant;
	const beforeDowngrade = await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: initialGrant - USAGE,
			adjustment: 0,
			granted: initialGrant,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: { count: 2 },
		sources: { count: 2, balance: 0, adjustment: 0 },
	});
	const outgoingCustomerProduct = getPooledSourceCustomerProduct({
		state: beforeDowngrade,
		productId: premium.id,
		entityId: entities[0].id,
	});
	await expectPooledSourceContributionsHydrated({
		ctx,
		customerId,
		contributions: beforeDowngrade.contributions,
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: pro.id,
		redirect_mode: "if_required",
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const entityBeforeTransition = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
		{ skip_cache: "true" },
	);
	await expectCustomerProducts({
		customer: entityBeforeTransition,
		canceling: [premium.id],
		scheduled: [pro.id],
	});
	const scheduledState = await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: initialGrant - USAGE,
			adjustment: 0,
			granted: initialGrant,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: { count: 2 },
		sources: { count: 3 },
	});
	const incomingCustomerProduct = getPooledSourceCustomerProduct({
		state: scheduledState,
		productId: pro.id,
		entityId: entities[0].id,
	});
	expect(
		scheduledState.contributions.some(
			(contribution) =>
				contribution.source_customer_product_id === incomingCustomerProduct.id,
		),
	).toBe(false);

	if (!testClockId) throw new Error("Expected a Stripe test clock");
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId,
		currentEpochMs: advancedTo,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const finalGrant = proGrant * 2;
	await waitForPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: finalGrant,
			adjustment: 0,
			granted: finalGrant,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: {
			count: 2,
			currentContribution: proGrant,
			nextCycleContribution: proGrant,
			excludedSourceCustomerProductIds: [outgoingCustomerProduct.id],
		},
		sources: { count: 3, balance: 0, adjustment: 0 },
	});

	const entityAfterTransition = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
		{ skip_cache: "true" },
	);
	await expectCustomerProducts({
		customer: entityAfterTransition,
		active: [pro.id],
		notPresent: [premium.id],
	});
	const customerAfterTransition = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer: customerAfterTransition,
		featureId: TestFeature.Messages,
		granted: finalGrant,
		includedGrant: finalGrant,
		remaining: finalGrant,
		usage: 0,
		planId: null,
		breakdownCount: 1,
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled attach: equal-grant downgrade preserves the renewed shared balance")}`,
	async () => {
		await runDowngradeCase({ id: "equal", premiumGrant: 100, proGrant: 100 });
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled attach: different-grant downgrade applies the delta to the renewed shared balance")}`,
	async () => {
		await runDowngradeCase({ id: "delta", premiumGrant: 200, proGrant: 100 });
	},
);
