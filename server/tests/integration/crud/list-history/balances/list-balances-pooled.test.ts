/**
 * balances.list — pooled balances read as one row per pool, live or expired.
 *
 * Contract:
 *   - a pool's contributing source customer_entitlements are never listed; the synthetic pool row is
 *   - the pool row's grant comes from pooled_balances.granted and matches customers.get
 *   - a pool whose last contributor expired lists as expired, and its expired plan adds no source row
 *   - a license pool whose parent plan is gone lists as expired, not active
 *   - a pool's rollovers ride on the pool row, capped against the full pool grant
 *
 * Red (before): sources listed beside the pool, pool included_grant 0, license pool still active.
 * Green (after): every assertion below holds.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type BalanceListRow,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expirePooledBalanceForReset } from "@tests/integration/billing/pooled-balances/utils/expirePooledBalanceForReset.js";
import {
	LICENSE_POOLED_GRANT,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
} from "@tests/integration/licenses/pooled-balances/utils/licensePooledBalanceTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listBalances } from "../utils/listHistoryClient.js";

const POOL_GRANT = 500;

const messagesRows = (rows: BalanceListRow[]) =>
	rows.filter((row) => row.feature_id === TestFeature.Messages);

test.concurrent(
	`${chalk.yellowBright("balances.list pooled: one pool row replaces its sources and matches customers.get")}`,
	async () => {
		const pooledPlan = products.base({
			id: "lh-pool-live",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOL_GRANT }),
					pooled: true,
				},
			],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "lh-pool-live",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 700,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		const [poolBreakdown] =
			customer.balances[TestFeature.Messages].breakdown ?? [];

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		const [poolRow, ...extraRows] = messagesRows(live.list);
		expect(extraRows).toHaveLength(0);
		expect(poolRow.id).toBe(poolBreakdown.id);
		expect(poolRow.plan_id).toBe(poolBreakdown.plan_id);
		expect(poolRow.included_grant).toBe(POOL_GRANT * 2);
		expect(poolRow.usage).toBe(700);
		expect(poolRow.remaining).toBe(POOL_GRANT * 2 - 700);
		expect(poolRow.status).toBe("active");

		// Sources stay hidden however the list is filtered
		const everything = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["active", "expired"] },
		});
		expect(messagesRows(everything.list).map((row) => row.id)).toEqual([
			poolRow.id,
		]);

		const byPlan = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, plan_id: pooledPlan.id },
		});
		expect(messagesRows(byPlan.list)).toHaveLength(0);

		const orgWide = await listBalances({
			autumn: autumnV2_4,
			params: {
				feature_id: TestFeature.Messages,
				statuses: ["active", "expired"],
				limit: 200,
			},
		});
		expect(
			orgWide.list
				.filter((row) => row.customer_id === customerId)
				.map((row) => row.id),
		).toEqual([poolRow.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("balances.list pooled: expiring the last contributor lists the pool as expired, with no source row")}`,
	async () => {
		const pooledPlan = products.base({
			id: "lh-pool-expire",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOL_GRANT }),
					pooled: true,
				},
			],
		});

		const { customerId, autumnV2_4, entities } = await initScenario({
			customerId: "lh-pool-expire",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});

		const before = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		const [livePool] = messagesRows(before.list);
		expect(livePool.included_grant).toBe(POOL_GRANT);

		await autumnV2_4.subscriptions.update({
			customer_id: customerId,
			product_id: pooledPlan.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		expect(messagesRows(live.list)).toHaveLength(0);

		const expired = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"] },
		});
		const expiredRows = messagesRows(expired.list);
		expect(expiredRows.map((row) => row.id)).toEqual([livePool.id]);
		expect(expiredRows[0].status).toBe("expired");
		expect(expiredRows[0].expires_at).not.toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("balances.list pooled: a license pool whose parent is canceled lists as expired")}`,
	async () => {
		const parent = parentPlan({ id: "lh-lic-pool-parent" });
		const seat = pooledSeatPlan({
			id: "lh-lic-pool-seat",
			item: pooledMonthlyMessages(),
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "lh-lic-pool",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		const before = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		const [livePool, ...extraRows] = messagesRows(before.list);
		expect(extraRows).toHaveLength(0);
		expect(livePool.included_grant).toBe(LICENSE_POOLED_GRANT);

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		expect(messagesRows(live.list)).toHaveLength(0);

		const expired = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"] },
		});
		const expiredRows = messagesRows(expired.list);
		expect(expiredRows.map((row) => row.id)).toEqual([livePool.id]);
		expect(expiredRows[0].status).toBe("expired");
	},
);

test.concurrent(
	`${chalk.yellowBright("balances.list pooled: rollovers ride on the pool row, capped by the pool grant")}`,
	async () => {
		const grant = 200;
		const pooledPlan = products.base({
			id: "lh-pool-rollover",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: grant,
						rolloverConfig: {
							max_percentage: 50,
							length: 1,
							duration: RolloverExpiryDurationType.Month,
						},
					}),
					pooled: true,
				},
			],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "lh-pool-rollover",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
			],
		});

		await autumnV2_4.track({
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
		await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, feature_id: TestFeature.Messages },
		});
		const [poolRow, ...extraRows] = live.list;
		expect(extraRows).toHaveLength(0);
		expect(poolRow.included_grant).toBe(grant * 2);
		expect(poolRow.usage).toBe(0);
		// Pool grant 400 at 50% caps the rollover at 200; the 200 source grant would cap it at 100
		expect(poolRow.rollovers.map((rollover) => rollover.balance)).toEqual([
			200,
		]);
	},
);
