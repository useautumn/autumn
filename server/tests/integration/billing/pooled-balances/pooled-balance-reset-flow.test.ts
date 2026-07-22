/**
 * TDD contract for pooled balance reset ownership.
 *
 * New behavior:
 *   - overdue lazy pools reset through customer reads to pooled_balances.granted;
 *   - subscription pools reset only from their matching subscription invoice;
 *   - lifetime pools and pooled source entitlements never reset lazily or by cron;
 *   - rollover max_percentage is based on the complete pool grant;
 *   - the cron loader selects and hydrates only overdue lazy synthetic pools.
 *
 * Side effects:
 *   - reset writes the synthetic customer entitlement balance/next_reset_at;
 *   - unused balance is inserted as rollover and trimmed to its configured cap;
 *   - customer caches expose the reset pooled balance after the write.
 *
 * Pre-implementation red: every synthetic pool is excluded by the generic lazy
 * filter, invoice.created has no pooled task, and cron cannot hydrate a pool.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	addInterval,
	customerEntitlements,
	EntInterval,
	PooledBalanceResetMode,
	ProductItemInterval,
	pooledBalances,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { expectPooledBalanceCorrect } from "./utils/expectPooledBalanceCorrect.js";
import { expirePooledBalanceForReset } from "./utils/expirePooledBalanceForReset.js";
import { getPooledBalanceDbState } from "./utils/getPooledBalanceDbState.js";

const attachPooledPlanToTwoEntities = async ({
	customerId,
	grant,
	rolloverConfig,
}: {
	customerId: string;
	grant: number;
	rolloverConfig?: {
		max_percentage: number;
		length: number;
		duration: RolloverExpiryDurationType;
	};
}) => {
	const pooledItem = {
		...(rolloverConfig
			? items.monthlyMessagesWithRollover({
					includedUsage: grant,
					rolloverConfig,
				})
			: items.monthlyMessages({ includedUsage: grant })),
		pooled: true,
	};
	const pooledPlan = products.base({
		id: `${customerId}-plan`,
		items: [pooledItem],
	});

	return initScenario({
		customerId,
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
};

test.concurrent(
	`${chalk.yellowBright("pooled reset: overdue lazy pool resets to the full pooled grant")}`,
	async () => {
		const customerId = "pooled-reset-lazy";
		const grant = 250;
		const { autumnV2_2, ctx } = await attachPooledPlanToTwoEntities({
			customerId,
			grant,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 125,
		});
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fullCustomer.pooled_customer_entitlements?.[0]?.balance).toBe(
			grant * 2,
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: grant * 2,
			includedGrant: grant * 2,
			remaining: grant * 2,
			usage: 0,
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: grant * 2,
				adjustment: 0,
				granted: grant * 2,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
				rollovers: [],
			},
			contributions: { count: 2, currentContribution: grant },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled reset: rollover max_percentage uses pooled granted")}`,
	async () => {
		const customerId = "pooled-reset-rollover-percent";
		const grant = 200;
		const { autumnV2_2, ctx } = await attachPooledPlanToTwoEntities({
			customerId,
			grant,
			rolloverConfig: {
				max_percentage: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		const customers = await Promise.all([
			autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			}),
			autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			}),
		]);
		// Pool grant = 400, so max rollover = 200. The source catalog grant is
		// only 200 and would incorrectly cap this at 100.
		for (const customer of customers) {
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				granted: 600,
				remaining: 600,
				usage: 0,
				rollovers: [{ balance: 200 }],
			});
		}
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 400,
				adjustment: 0,
				granted: 400,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
				rollovers: [{ balance: 200, usage: 0 }],
			},
			contributions: { count: 2, currentContribution: grant },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled reset: lifetime pool is never reset lazily")}`,
	async () => {
		const customerId = "pooled-reset-lifetime";
		const grant = 300;
		const pooledPlan = products.base({
			id: "pooled-reset-lifetime-plan",
			items: [
				{ ...items.lifetimeMessages({ includedUsage: grant }), pooled: true },
			],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 100,
					entityIndex: 1,
					timeout: 2_000,
				}),
			],
		});
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lifetime,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant - 100,
			usage: 100,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled reset: subscription pool waits for and resets on its invoice")}`,
	async () => {
		const customerId = "pooled-reset-subscription";
		const grant = 500;
		const pooledPlan = products.pro({
			id: "pooled-reset-subscription-plan",
			items: [
				{ ...items.monthlyMessages({ includedUsage: grant }), pooled: true },
			],
		});
		const { autumnV2_2, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 1,
					timeout: 2_000,
				}),
			],
		});
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Subscription,
		});

		const beforeInvoice = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: beforeInvoice,
			featureId: TestFeature.Messages,
			remaining: grant - 200,
			usage: 200,
		});
		if (!testClockId) throw new Error("Expected a Stripe test clock");

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		const afterInvoice = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: afterInvoice,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant,
			usage: 0,
		});
	},
);

/**
 * Contract:
 * - A two-month pooled entitlement on a monthly subscription is not reset by
 *   the first monthly invoice.
 * - The second monthly invoice resets it exactly once.
 * - Its next_reset_at advances by its own two-month interval, so the third
 *   monthly invoice does not reset it again.
 */
test.concurrent(
	`${chalk.yellowBright("pooled reset: subscription pool respects a two-month reset cycle")}`,
	async () => {
		const customerId = "pooled-reset-subscription-two-month";
		const grant = 500;
		const pooledPlan = products.pro({
			id: "pooled-reset-subscription-two-month-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: grant }),
					interval: ProductItemInterval.Month,
					interval_count: 2,
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 1,
					timeout: 2_000,
				}),
			],
		});
		if (!testClockId) throw new Error("Expected a Stripe test clock");

		const initialState = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		const initialNextResetAt =
			initialState.poolCustomerEntitlements[0]?.next_reset_at;
		if (!initialNextResetAt) {
			throw new Error("Expected the two-month pool to have a next reset");
		}

		let currentEpochMs = advancedTo;
		currentEpochMs = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs,
		});
		const afterFirstInvoice =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			});
		expectBalanceCorrect({
			customer: afterFirstInvoice,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant - 200,
			usage: 200,
		});

		currentEpochMs = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs,
		});
		const afterSecondInvoice = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: afterSecondInvoice,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant,
			usage: 0,
		});

		const afterSecondInvoiceState = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(
			afterSecondInvoiceState.poolCustomerEntitlements[0]?.next_reset_at,
		).toBe(
			addInterval({
				from: initialNextResetAt,
				interval: EntInterval.Month,
				intervalCount: 2,
			}),
		);

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs,
		});
		const afterThirdInvoice = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: afterThirdInvoice,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant - 50,
			usage: 50,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled reset: cron selects and resets only a lazy synthetic pool")}`,
	async () => {
		const customerId = "pooled-reset-cron";
		const grant = 250;
		const { ctx } = await attachPooledPlanToTwoEntities({
			customerId,
			grant,
		});
		const { pool, pooledCustomerEntitlement } =
			await expirePooledBalanceForReset({
				ctx,
				customerId,
				resetMode: PooledBalanceResetMode.Lazy,
			});
		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const sourceCustomerEntitlementIds = state.sourceCustomerProducts.flatMap(
			(customerProduct) =>
				customerProduct.customer_entitlements
					.filter(
						(customerEntitlement) => customerEntitlement.entitlement.pooled,
					)
					.map((customerEntitlement) => customerEntitlement.id),
		);
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: Date.now() - 1_000 })
			.where(inArray(customerEntitlements.id, sourceCustomerEntitlementIds));

		const resettable = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: Date.now(),
		});
		const resettableIds = resettable.map((candidate) => candidate.id);
		expect(resettableIds).toContain(pooledCustomerEntitlement.id);
		for (const sourceCustomerEntitlementId of sourceCustomerEntitlementIds) {
			expect(resettableIds).not.toContain(sourceCustomerEntitlementId);
		}

		const cronCustomerEntitlement = resettable.find(
			(candidate) => candidate.id === pooledCustomerEntitlement.id,
		);
		if (!cronCustomerEntitlement) {
			throw new Error("Expected cron to return the lazy pooled balance");
		}
		expect(cronCustomerEntitlement.pooled_balance?.id).toBe(pool.id);
		await resetCustomerEntitlement({
			ctx,
			cusEnt: cronCustomerEntitlement,
			updatedCusEnts: [],
		});

		const afterReset = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pooledCustomerEntitlement.id),
		});
		expect(afterReset?.balance).toBe(grant * 2);

		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: Date.now() - 1_000 })
			.where(eq(customerEntitlements.id, pooledCustomerEntitlement.id));
		await ctx.db
			.update(pooledBalances)
			.set({ reset_mode: PooledBalanceResetMode.Lifetime })
			.where(eq(pooledBalances.id, pool.id));

		const afterLifetime = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: Date.now(),
		});
		expect(afterLifetime.map((candidate) => candidate.id)).not.toContain(
			pooledCustomerEntitlement.id,
		);
	},
);
