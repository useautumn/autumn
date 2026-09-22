/** Regression: standard trial expiry removes its pooled source, expires empty pools,
 * preserves other sources, and transitions onto an activated default product. */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	EntInterval,
	FreeTrialDuration,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { expireTrialProductsForCustomer } from "@/cron/productCron/expireTrialProductsForCustomer.js";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState.js";

const TRIAL_GRANT = 300;
const REMAINING_GRANT = 100;
const DEFAULT_GRANT = 50;
const LAZY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Lazy,
	stripeSubscriptionId: null,
} as const;

const pooledTrial = ({ id, group }: { id: string; group: string }) =>
	products.base({
		id,
		group,
		items: [
			{
				...items.monthlyMessages({ includedUsage: TRIAL_GRANT }),
				pooled: true,
			},
		],
		freeTrial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			cardRequired: false,
		},
	});

const expireTrial = async ({
	ctx,
	customerProductId,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerProductId: string;
	internalCustomerId: string;
}) => {
	const now = Date.now();
	await ctx.db
		.update(customerProducts)
		.set({ trial_ends_at: now - 60_000 })
		.where(eq(customerProducts.id, customerProductId));

	await expireTrialProductsForCustomer({
		ctx,
		internalCustomerId,
		nowMs: now,
	});
};

test(
	chalk.yellowBright(
		"pooled product cron: ending a sole trial deletes its contribution and expires the pool",
	),
	async () => {
		const customerId = "pooled-trial-end-sole";
		const trial = pooledTrial({
			id: "pooled-trial-end-sole-plan",
			group: "pooled-trial-end-sole-group",
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [trial] })],
			actions: [s.billing.attach({ productId: trial.id })],
		});

		const beforeExpiry = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: TRIAL_GRANT,
				adjustment: 0,
				granted: TRIAL_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const trialCustomerProduct = getPooledSourceCustomerProduct({
			state: beforeExpiry,
			productId: trial.id,
			entityId: null,
		});

		await expireTrial({
			ctx,
			customerProductId: trialCustomerProduct.id,
			internalCustomerId: trialCustomerProduct.internal_customer_id,
		});

		const afterExpiry = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterExpiry.contributions).toHaveLength(0);
		expect(afterExpiry.pools).toHaveLength(1);
		expect(afterExpiry.pools[0]?.expires_at).not.toBeNull();
		expect(afterExpiry.poolCustomerEntitlements[0]?.expires_at).not.toBeNull();
		expect(
			afterExpiry.sourceCustomerProducts.find(
				(customerProduct) => customerProduct.id === trialCustomerProduct.id,
			)?.status,
		).toBe(CusProductStatus.Expired);
	},
);

test(
	chalk.yellowBright(
		"pooled product cron: ending one trial preserves the remaining contribution",
	),
	async () => {
		const customerId = "pooled-trial-end-remaining";
		const group = "pooled-trial-end-remaining-group";
		const trial = pooledTrial({ id: "pooled-trial-end-outgoing", group });
		const remaining = products.base({
			id: "pooled-trial-end-remaining-plan",
			group,
			items: [
				{
					...items.monthlyMessages({ includedUsage: REMAINING_GRANT }),
					pooled: true,
				},
			],
		});
		const { ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [trial, remaining] }),
			],
			actions: [
				s.billing.attach({ productId: trial.id, entityIndex: 0 }),
				s.billing.attach({ productId: remaining.id, entityIndex: 1 }),
			],
		});

		const beforeExpiry = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: TRIAL_GRANT + REMAINING_GRANT,
				adjustment: 0,
				granted: TRIAL_GRANT + REMAINING_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const trialCustomerProduct = getPooledSourceCustomerProduct({
			state: beforeExpiry,
			productId: trial.id,
			entityId: entities[0].id,
		});
		const remainingCustomerProduct = getPooledSourceCustomerProduct({
			state: beforeExpiry,
			productId: remaining.id,
			entityId: entities[1].id,
		});

		await expireTrial({
			ctx,
			customerProductId: trialCustomerProduct.id,
			internalCustomerId: trialCustomerProduct.internal_customer_id,
		});

		const afterExpiry = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: REMAINING_GRANT,
				adjustment: 0,
				granted: REMAINING_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				excludedSourceCustomerProductIds: [trialCustomerProduct.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		expect(afterExpiry.pools[0]?.expires_at).toBeNull();
		expect(afterExpiry.contributions[0]?.source_customer_product_id).toBe(
			remainingCustomerProduct.id,
		);
	},
);

test(
	chalk.yellowBright(
		"pooled product cron: ending a trial replaces its contribution with the activated default",
	),
	async () => {
		const customerId = "pooled-trial-end-default";
		const group = "pooled-trial-end-default-group";
		const trial = pooledTrial({ id: "pooled-trial-end-default-trial", group });
		const defaultProduct = products.base({
			id: "pooled-trial-end-default-plan",
			group,
			isDefault: true,
			items: [
				{
					...items.monthlyMessages({ includedUsage: DEFAULT_GRANT }),
					pooled: true,
				},
			],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [defaultProduct, trial] }),
			],
			actions: [s.billing.attach({ productId: trial.id })],
		});

		const beforeExpiry = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: TRIAL_GRANT,
				adjustment: 0,
				granted: TRIAL_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const trialCustomerProduct = getPooledSourceCustomerProduct({
			state: beforeExpiry,
			productId: trial.id,
			entityId: null,
		});

		await expireTrial({
			ctx,
			customerProductId: trialCustomerProduct.id,
			internalCustomerId: trialCustomerProduct.internal_customer_id,
		});

		const afterExpiry = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: DEFAULT_GRANT,
				adjustment: 0,
				granted: DEFAULT_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				excludedSourceCustomerProductIds: [trialCustomerProduct.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const activatedDefault = getPooledSourceCustomerProduct({
			state: afterExpiry,
			productId: defaultProduct.id,
			entityId: null,
		});
		expect(activatedDefault.status).toBe(CusProductStatus.Active);
		expect(afterExpiry.contributions[0]?.source_customer_product_id).toBe(
			activatedDefault.id,
		);
	},
);
