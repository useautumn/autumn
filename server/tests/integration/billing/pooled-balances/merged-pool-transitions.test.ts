/**
 * Contract: pooled ROLLOVERS survive a transition of a customer product whose
 * contribution was repointed by the combine-pools merge.
 *
 * Production shape (see setupMergedPoolScenario): entity 1 attaches the plan,
 * entity 2 attaches the same plan on its own Stripe subscription so each mints
 * its own pool, then the pools are merged the way the combine-pools script
 * merges them. Entity 2's contribution now sits on a pool identified by entity
 * 1's subscription. Transitioning entity 2 splits the pool again.
 *
 * The split itself is ACCEPTED behavior and is deliberately not asserted
 * against. What must hold is that nothing is lost across it.
 *
 * Contract under test:
 *   New behaviors:
 *     - transition the mis-matched plan -> total rollover balance across all
 *       pools is unchanged
 *     - transition the mis-matched plan -> the customer's readable remaining
 *       for Messages is unchanged
 *   Side effects:
 *     - every rollover row remains attached to a synthetic cusEnt whose pool is
 *       still live, rather than stranded on a retired one
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	RolloverExpiryDurationType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "./utils/getPooledBalanceDbState.js";
import { setupMergedPoolScenario } from "./utils/mergedPoolScenario.js";

const GRANT = 10_000;
const USAGE = 4_000;
const NEW_BASE_PRICE = 45;

const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
} as const;

type PooledState = Awaited<ReturnType<typeof getPooledBalanceDbState>>;

const rolloverRows = (state: PooledState) =>
	state.poolCustomerEntitlements.flatMap((customerEntitlement) =>
		(customerEntitlement.rollovers ?? []).map((rollover) => ({
			rollover,
			customerEntitlementId: customerEntitlement.id,
		})),
	);

const sumRolloverBalance = (state: PooledState) =>
	rolloverRows(state).reduce(
		(sum, { rollover }) => sum + (rollover.balance ?? 0),
		0,
	);

test(
	chalk.yellowBright(
		"pooled rollover: transitioning a merge-mismatched plan preserves the pooled rollover",
	),
	async () => {
		const scenario = await setupMergedPoolScenario({
			customerId: "merged-pool-rollover-transition",
			grant: GRANT,
			rolloverConfig,
			usage: { value: USAGE, entityIndex: 1 },
			// Renewal is what mints the pooled rollover.
			advanceToNextInvoice: true,
		});
		const { ctx, customerId, autumnV2_3 } = scenario;

		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const rolloverBefore = sumRolloverBalance(before);
		// Guard: without a real rollover every assertion below passes vacuously.
		expect(rolloverBefore).toBeGreaterThan(0);

		const customerBefore = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		const remainingBefore =
			customerBefore.balances?.[TestFeature.Messages]?.remaining;
		expect(remainingBefore).toBeGreaterThan(0);

		// ── Act: transition the plan whose contribution the merge left pointing
		// at the other subscription's pool. Base-price customize only — the
		// pooled item itself is untouched.
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: scenario.mismatchedCustomerProduct.id,
			entity_id: scenario.mismatchedEntityId ?? undefined,
			customize: { price: itemsV2.monthlyPrice({ amount: NEW_BASE_PRICE }) },
		});

		const after = await getPooledBalanceDbState({ db: ctx.db, customerId });

		// ── Contract: the rollover balance is not lost across the split ──
		expect(sumRolloverBalance(after)).toBe(rolloverBefore);

		// ── Contract: no rollover is stranded on a retired pool ──────────
		const livePoolCustomerEntitlementIds = new Set(
			after.pools
				.filter((pool) => pool.expires_at === null)
				.map((pool) => pool.customer_entitlement_id),
		);
		for (const { rollover, customerEntitlementId } of rolloverRows(after)) {
			expect({
				rolloverId: rollover.id,
				onLivePool: livePoolCustomerEntitlementIds.has(customerEntitlementId),
			}).toEqual({ rolloverId: rollover.id, onLivePool: true });
		}

		// ── Contract: the customer reads the same remaining as before ────
		const customerAfter = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerAfter.balances?.[TestFeature.Messages]?.remaining).toBe(
			remainingBefore,
		);
	},
);

const MERGED_GRANT = GRANT * 2;
const REMAINING_AFTER_USAGE = MERGED_GRANT - USAGE;
const UNRELATED_GRANT = 50;

const sumGranted = (state: PooledState) =>
	state.pools.reduce((sum, pool) => sum + pool.granted, 0);

const sumPoolBalance = (state: PooledState) =>
	state.pools.reduce((sum, pool) => {
		const synthetic = state.poolCustomerEntitlements.find(
			(candidate) => candidate.id === pool.customer_entitlement_id,
		);
		return sum + (synthetic?.balance ?? 0);
	}, 0);

/**
 * A free plan pools alongside a paid one — the free plan resets lazily with no
 * subscription, so the two identities differ by more than the subscription id.
 * After the merge, transitioning EITHER side must leave the pooled totals alone.
 */
const expectFreeAndSubscriptionMergeConserved = async ({
	customerId,
	side,
}: {
	customerId: string;
	side: "mismatched" | "aligned";
}) => {
	const scenario = await setupMergedPoolScenario({
		customerId,
		grant: GRANT,
		variant: "free-and-subscription",
		usage: { value: USAGE, entityIndex: 1 },
	});
	const { ctx, autumnV2_3 } = scenario;

	const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(before.pools).toHaveLength(1);
	expect(before.contributions).toHaveLength(2);
	expect(sumGranted(before)).toBe(MERGED_GRANT);
	expect(sumPoolBalance(before)).toBe(REMAINING_AFTER_USAGE);

	const target =
		side === "mismatched"
			? scenario.mismatchedCustomerProduct
			: scenario.alignedCustomerProduct;
	const entityId =
		side === "mismatched"
			? scenario.mismatchedEntityId
			: scenario.alignedEntityId;
	const isFreeTarget = target.product_id === scenario.freePlan.id;

	// A free plan has no base price to customize, and re-declaring the pooled
	// item unchanged is rejected as a no-op — so add an unrelated feature, which
	// forces a transition while leaving the pooled Messages grant alone.
	const customize = isFreeTarget
		? {
				items: [
					{ ...itemsV2.monthlyMessages({ included: GRANT }), pooled: true },
					itemsV2.monthlyWords({ included: UNRELATED_GRANT }),
				],
			}
		: { price: itemsV2.monthlyPrice({ amount: NEW_BASE_PRICE }) };

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		customer_product_id: target.id,
		entity_id: entityId ?? undefined,
		customize,
	});

	// ── Contract: the transition neither creates nor destroys pooled credit ──
	const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(sumGranted(after)).toBe(MERGED_GRANT);
	expect(sumPoolBalance(after)).toBe(REMAINING_AFTER_USAGE);

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(customer.balances?.[TestFeature.Messages]?.remaining).toBe(
		REMAINING_AFTER_USAGE,
	);
};

test(
	chalk.yellowBright(
		"merged pool (free + subscription): updating the mis-matched plan conserves pooled totals",
	),
	async () => {
		await expectFreeAndSubscriptionMergeConserved({
			customerId: "merged-free-sub-update-mismatched",
			side: "mismatched",
		});
	},
);

test(
	chalk.yellowBright(
		"merged pool (free + subscription): updating the aligned plan conserves pooled totals",
	),
	async () => {
		await expectFreeAndSubscriptionMergeConserved({
			customerId: "merged-free-sub-update-aligned",
			side: "aligned",
		});
	},
);
