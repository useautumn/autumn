// Contract: Redis/Postgres track deduct the synthetic pool once and share updates across subjects.
// Exact exhaustion rejects overflow, while multiple pools deduct in shortest-reset-first order.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	EntInterval,
	ErrCode,
	PooledBalanceResetMode,
	ResetInterval,
	type TrackResponseV3,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const CONTRIBUTION = 500;
const POOLED_GRANT = CONTRIBUTION * 2;

test.concurrent(
	`${chalk.yellowBright("pooled track: contributing and unassigned entities share deductions through exact exhaustion")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-track-shared",
			items: [
				{
					...items.monthlyMessages({ includedUsage: CONTRIBUTION }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, customerId, entities } = await initScenario({
			customerId: "pooled-track-shared",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
			],
		});
		await Promise.all([
			autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[0].id),
			autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[1].id),
			autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[2].id),
		]);

		const firstTrack = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 300,
			overage_behavior: "reject",
		})) as TrackResponseV3;
		expect(firstTrack).toMatchObject({
			customer_id: customerId,
			entity_id: entities[0].id,
			value: 300,
			balance: {
				granted: POOLED_GRANT,
				remaining: 700,
				usage: 300,
			},
		});
		expect(firstTrack.deductions).toHaveLength(1);
		expect(firstTrack.deductions?.[0]).toMatchObject({
			feature_id: TestFeature.Messages,
			plan_id: null,
			value: 300,
		});

		const customerAfterFirstTrack =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const unassignedEntityAfterFirstTrack =
			await autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[2].id);
		for (const subject of [
			customerAfterFirstTrack,
			unassignedEntityAfterFirstTrack,
		]) {
			expectBalanceCorrect({
				customer: subject,
				featureId: TestFeature.Messages,
				granted: POOLED_GRANT,
				includedGrant: POOLED_GRANT,
				remaining: 700,
				usage: 300,
				planId: null,
				breakdownCount: 1,
			});
		}

		const exactExhaustion = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: 700,
			overage_behavior: "reject",
		})) as TrackResponseV3;
		expect(exactExhaustion.balance).toMatchObject({
			granted: POOLED_GRANT,
			remaining: 0,
			usage: POOLED_GRANT,
		});
		expect(exactExhaustion.deductions).toHaveLength(1);
		expect(exactExhaustion.deductions?.[0]?.value).toBe(700);

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_2.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		await timeout(2000);

		const uncachedCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		const uncachedContributingEntity =
			await autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[1].id, {
				skip_cache: "true",
			});
		for (const subject of [uncachedCustomer, uncachedContributingEntity]) {
			expectBalanceCorrect({
				customer: subject,
				featureId: TestFeature.Messages,
				granted: POOLED_GRANT,
				includedGrant: POOLED_GRANT,
				remaining: 0,
				usage: POOLED_GRANT,
				planId: null,
				breakdownCount: 1,
			});
		}

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: POOLED_GRANT,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: {
				count: 2,
				currentContribution: CONTRIBUTION,
				nextCycleContribution: CONTRIBUTION,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled track: Postgres deductions return and persist the updated shared pool")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-track-postgres",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 250 }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, customerId, entities } = await initScenario({
			customerId: "pooled-track-postgres",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
			],
		});

		const trackResponse = (await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[2].id,
				feature_id: TestFeature.Messages,
				value: 125,
				overage_behavior: "reject",
			},
			{ skipCache: true },
		)) as TrackResponseV3;

		expect(trackResponse.balance).toMatchObject({
			granted: 500,
			remaining: 375,
			usage: 125,
		});
		expect(trackResponse.deductions).toHaveLength(1);
		expect(trackResponse.deductions?.[0]).toMatchObject({
			feature_id: TestFeature.Messages,
			plan_id: null,
			value: 125,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 500,
			includedGrant: 500,
			remaining: 375,
			usage: 125,
			planId: null,
			breakdownCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled track: multiple pools deduct in shortest-reset-first order")}`,
	async () => {
		const hourlyPlan = products.base({
			id: "pooled-track-hourly",
			items: [
				{
					...items.hourlyMessages({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const monthlyPlan = products.base({
			id: "pooled-track-monthly",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 200 }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, customerId, entities } = await initScenario({
			customerId: "pooled-track-global-order",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [hourlyPlan, monthlyPlan] }),
			],
			actions: [
				s.billing.attach({ productId: hourlyPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: monthlyPlan.id, entityIndex: 1 }),
			],
		});

		const trackResponse = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: 120,
			overage_behavior: "reject",
		})) as TrackResponseV3;

		expect(trackResponse.balance).toMatchObject({
			granted: 300,
			remaining: 180,
			usage: 120,
		});
		expect(trackResponse.balance?.breakdown).toHaveLength(2);
		const hourlyBreakdown = trackResponse.balance?.breakdown?.find(
			(balance) => balance.reset?.interval === ResetInterval.Hour,
		);
		const monthlyBreakdown = trackResponse.balance?.breakdown?.find(
			(balance) => balance.reset?.interval === ResetInterval.Month,
		);
		expect(hourlyBreakdown).toMatchObject({
			plan_id: null,
			included_grant: 100,
			remaining: 0,
			usage: 100,
		});
		expect(monthlyBreakdown).toMatchObject({
			plan_id: null,
			included_grant: 200,
			remaining: 180,
			usage: 20,
		});

		expect(
			trackResponse.deductions?.map((deduction) => ({
				interval: deduction.reset?.interval,
				planId: deduction.plan_id,
				value: deduction.value,
			})),
		).toEqual([
			{ interval: ResetInterval.Hour, planId: null, value: 100 },
			{ interval: ResetInterval.Month, planId: null, value: 20 },
		]);
	},
);
