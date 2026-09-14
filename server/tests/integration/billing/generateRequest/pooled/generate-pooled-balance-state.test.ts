/**
 * Contract: a generated update_subscription against a customer who already
 * holds a POOLED balance must survive execution without corrupting the pool.
 *
 * The generation context is built from `toCreatePlanItemParams`, so what the
 * model can see of an existing item is exactly what it can copy back into a
 * remove_items + add_items pair. Anything the context drops is a setting the
 * generated request silently deletes.
 *
 * Cases:
 *   1. unrelated edit  -> same pool row, same contribution row, granted and
 *      usage untouched
 *   2. grant raise     -> ONE pool (identity preserved: pooled + rollover
 *      copied through), granted moves by the delta, usage preserved
 *   3. dimensioned pool-> a dimensioned track after the generated edit still
 *      deducts at the override rate, i.e. feature_override survived
 *
 * Requires ANTHROPIC_API_KEY on the server under test: each case makes a real
 * model call through /agent.generate_billing_request.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	FeatureConfigOverride,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import {
	EntInterval,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GENERATE_PATH = "/agent.generate_billing_request";
const LLM_TEST_TIMEOUT = 180_000;

const INITIAL_GRANT = 10_000;
const RAISED_GRANT = 12_000;
const WORDS_GRANT = 25;
const RAISED_WORDS_GRANT = 75;
const USAGE = 400;
/** An items-style update expires the source product and inserts its successor,
 * so the expired row's pooled entitlement lingers beside the live one. */
const EXPIRED_PLUS_LIVE_SOURCES = 2;

const ROLLOVER = {
	max: 5_000,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

/** Pooled credits with a rollover cap, plus an unrelated private words item. */
const pooledPlan = ({
	id,
	featureOverride,
}: {
	id: string;
	featureOverride?: FeatureConfigOverride;
}) => {
	const creditsItem = items.monthlyCredits({
		includedUsage: INITIAL_GRANT,
		rolloverConfig: ROLLOVER,
	});
	return products.pro({
		id,
		items: [
			{
				...creditsItem,
				pooled: true,
				config: {
					...creditsItem.config,
					...(featureOverride ? { feature_override: featureOverride } : {}),
				},
			},
			items.monthlyWords({ includedUsage: WORDS_GRANT }),
		],
	});
};

const setupPooledGenerationScenario = async ({
	customerId,
	featureOverride,
	trackFeatureId = TestFeature.Credits,
	trackValue = USAGE,
	trackProperties,
}: {
	customerId: string;
	featureOverride?: FeatureConfigOverride;
	trackFeatureId?: string;
	trackValue?: number;
	trackProperties?: Record<string, string>;
}) => {
	const plan = pooledPlan({ id: `${customerId}-plan`, featureOverride });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.billing.attach({ productId: plan.id, entityIndex: 0 }),
			s.track({
				featureId: trackFeatureId,
				value: trackValue,
				entityIndex: 1,
				...(trackProperties ? { properties: trackProperties } : {}),
				timeout: 3_000,
			}),
		],
	});

	const state = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	const sourceCustomerProduct = getPooledSourceCustomerProduct({
		state,
		productId: plan.id,
		entityId: scenario.entities[0]!.id,
	});
	const [poolBefore] = state.pools;
	const [contributionBefore] = state.contributions;
	expect(poolBefore).toBeDefined();
	expect(contributionBefore).toBeDefined();

	return {
		...scenario,
		plan,
		poolBefore: poolBefore!,
		contributionBefore: contributionBefore!,
		sourceCustomerProduct,
	};
};

type Scenario = Awaited<ReturnType<typeof setupPooledGenerationScenario>>;

/** Generates against the entity-scoped source product, then executes the
 * generated V0 request through the same update endpoint the sheet posts to. */
const generateAndApply = async ({
	scenario,
	prompt,
}: {
	scenario: Scenario;
	prompt: string;
}) => {
	const generated = (await scenario.autumnV2_2.post(GENERATE_PATH, {
		customer_id: scenario.customerId,
		customer_product_id: scenario.sourceCustomerProduct.id,
		prompt,
		tool: "update_subscription",
	})) as { request: Record<string, unknown>; unrepresentable: string[] };

	expect(generated.unrepresentable).toEqual([]);
	expect(generated.request.customer_product_id).toBe(
		scenario.sourceCustomerProduct.id,
	);

	await scenario.autumnV1.subscriptions.update<UpdateSubscriptionV0Params>({
		...(generated.request as UpdateSubscriptionV0Params),
		entity_id: scenario.entities[0]!.id,
	});

	return generated;
};

const creditsItemFrom = (generated: { request: Record<string, unknown> }) => {
	const generatedItems = generated.request.items as
		| {
				feature_id?: string;
				included_usage?: number;
				pooled?: boolean;
				config?: Record<string, unknown>;
		  }[]
		| undefined;
	expect(Array.isArray(generatedItems)).toBe(true);
	return generatedItems?.find(
		(item) => item.feature_id === TestFeature.Credits,
	);
};

test.concurrent(
	`${chalk.yellowBright("generate pooled: an unrelated edit leaves the pool row untouched")}`,
	async () => {
		const customerId = "gen-pooled-unrelated";
		const scenario = await setupPooledGenerationScenario({ customerId });

		await generateAndApply({
			scenario,
			prompt: `Give them ${RAISED_WORDS_GRANT} included words instead of ${WORDS_GRANT}. Leave everything else exactly as it is.`,
		});

		// ── Pool identity, grant and usage all survive the unrelated edit ──
		const state = await expectPooledBalanceCorrect({
			db: scenario.ctx.db,
			customerId,
			pool: {
				balance: INITIAL_GRANT - USAGE,
				adjustment: 0,
				granted: INITIAL_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: INITIAL_GRANT,
				nextCycleContribution: INITIAL_GRANT,
			},
			sources: { count: EXPIRED_PLUS_LIVE_SOURCES, balance: 0, adjustment: 0 },
		});
		// The pool row itself must survive; its contribution is re-pointed at
		// the successor product, so only the pool id is stable across the edit.
		expect(state.pools[0]?.id).toBe(scenario.poolBefore.id);
		expect(state.contributions[0]?.pooled_balance_id).toBe(
			scenario.poolBefore.id,
		);

		// ── The requested change did land ──────────────────────────────────
		const customer = await scenario.autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customer.features[TestFeature.Words]?.included_usage).toBe(
			RAISED_WORDS_GRANT,
		);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate pooled: a grant raise keeps one pool and preserves usage")}`,
	async () => {
		const customerId = "gen-pooled-raise";
		const scenario = await setupPooledGenerationScenario({ customerId });

		const generated = await generateAndApply({
			scenario,
			prompt: `Raise their included credits to ${RAISED_GRANT}.`,
		});

		// ── The generated item still declares the pooled identity fields ───
		const creditsItem = creditsItemFrom(generated);
		expect(creditsItem?.included_usage).toBe(RAISED_GRANT);
		expect(creditsItem?.pooled).toBe(true);
		expect(creditsItem?.config?.rollover).toMatchObject({ max: ROLLOVER.max });

		// ── Exactly ONE live pool: identity held, delta applied, usage kept ─
		const state = await expectPooledBalanceCorrect({
			db: scenario.ctx.db,
			customerId,
			pool: {
				balance: RAISED_GRANT - USAGE,
				adjustment: 0,
				granted: RAISED_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: RAISED_GRANT,
				nextCycleContribution: RAISED_GRANT,
			},
			sources: { count: EXPIRED_PLUS_LIVE_SOURCES, balance: 0, adjustment: 0 },
		});
		expect(state.pools[0]?.id).toBe(scenario.poolBefore.id);
	},
	LLM_TEST_TIMEOUT,
);

const DIMENSIONED_CREDITS: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("generate pooled: a grant raise preserves the dimension credit schema")}`,
	async () => {
		const customerId = "gen-pooled-dimensions";
		const scenario = await setupPooledGenerationScenario({
			customerId,
			featureOverride: DIMENSIONED_CREDITS,
			trackFeatureId: TestFeature.Action1,
			trackValue: 25,
			trackProperties: { size: "large" },
		});

		// 25 large actions x 16 credits = 400 credits off the shared pool.
		await expectPooledBalanceCorrect({
			db: scenario.ctx.db,
			customerId,
			pool: {
				balance: INITIAL_GRANT - USAGE,
				adjustment: 0,
				granted: INITIAL_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: { count: 1, currentContribution: INITIAL_GRANT },
			sources: { count: 1 },
		});

		await generateAndApply({
			scenario,
			prompt: `Raise their included credits to ${RAISED_GRANT}.`,
		});
		// ── The dimension rate survived the remove+add ─────────────────────
		// Without feature_override the same track deducts 10 credits, not 160.
		// The update rewrites the entitlement, so read through the cache once
		// before tracking — a stale FullSubject would price at the old rate.
		await scenario.autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		await scenario.autumnV1.track(
			{
				customer_id: customerId,
				entity_id: scenario.entities[1]!.id,
				feature_id: TestFeature.Action1,
				value: 10,
				properties: { size: "large" },
			},
			{ skipCache: true, timeout: 4_000 },
		);

		await expectPooledBalanceCorrect({
			db: scenario.ctx.db,
			customerId,
			pool: {
				balance: RAISED_GRANT - USAGE - 160,
				adjustment: 0,
				granted: RAISED_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: { count: 1, currentContribution: RAISED_GRANT },
			sources: { count: EXPIRED_PLUS_LIVE_SOURCES },
		});
	},
	LLM_TEST_TIMEOUT,
);
