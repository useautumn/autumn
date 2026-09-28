/**
 * Contract: a deferred balance sync must not wipe a contribution that landed
 * after the cached snapshot was taken.
 *
 * The race:
 *   A. attach a pooled plan to entity 1        -> pool granted 100, balance 100
 *   B. track usage through the Redis path      -> Redis holds balance 80
 *   C. attach the same plan to entity 2        -> Postgres granted 200, balance 180
 *   D. the sync from B finally drains          -> must NOT write 80 back
 *
 * Step B's snapshot predates entity 2's contribution, so a blind flush would
 * reset the pool to a balance computed from a granted of 100 and silently erase
 * entity 2's +100.
 *
 * syncItemV4 is driven directly rather than syncItemV5: V5 only coalesces and
 * claims the dirty state before delegating to V4, and executeRedisDeductionV2
 * queues no sync, so V5 would no-op here and prove nothing. V4 is the component
 * that actually writes.
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import {
	getOrSetCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const USAGE = 20;

test(
	chalk.yellowBright(
		"pooled race: a stale sync must not wipe a contribution added after the snapshot",
	),
	async () => {
		const customerId = "pooled-race-stale-sync";
		const pooledPlan = products.pro({
			id: "pooled-race-plan",
			items: [
				{ ...items.monthlyMessages({ includedUsage: GRANT }), pooled: true },
			],
		});

		// ── A. First contributor ─────────────────────────────────────────
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});

		const afterFirstAttach = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterFirstAttach.pools).toHaveLength(1);
		expect(afterFirstAttach.pools[0].granted).toBe(GRANT);

		// ── B. Track through Redis, queuing no sync ──────────────────────
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "pooled-race-setup",
		});
		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		);
		if (!messagesFeature) throw new Error("Messages feature not found");

		const deductionResult = await executeRedisDeductionV2({
			ctx,
			deductions: [{ feature: messagesFeature, deduction: USAGE }],
			fullSubject,
			deductionOptions: { overageBehaviour: "cap" },
		});

		// ── C. Second contributor lands in Postgres ──────────────────────
		// skipCacheDeletion keeps B's stale Redis snapshot alive; a normal attach
		// would invalidate it and the race could not be reproduced.
		const attachSkippingCacheDeletion = new AutumnInt({
			version: ApiVersion.V2_3,
			secretKey: ctx.orgSecretKey,
			skipCacheDeletion: true,
		});
		await attachSkippingCacheDeletion.billing.attach({
			customer_id: customerId,
			plan_id: pooledPlan.id,
			entity_id: entities[1].id,
		});

		const afterSecondAttach = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterSecondAttach.pools).toHaveLength(1);
		expect(afterSecondAttach.pools[0].granted).toBe(GRANT * 2);
		expect(afterSecondAttach.contributions).toHaveLength(2);

		// ── D. The stale sync finally drains ─────────────────────────────
		await syncItemV4({
			ctx,
			payload: {
				customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				rolloverIds: Object.keys(deductionResult.rolloverUpdates),
				modifiedCusEntIdsByFeatureId:
					deductionResult.modifiedCusEntIdsByFeatureId,
				usageWindowUpdates: deductionResult.usageWindowUpdates,
			},
		});
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "pooled-race-assert",
		});

		// ── Contract: entity 2's contribution survives ───────────────────
		const afterSync = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(afterSync.pools).toHaveLength(1);
		expect(afterSync.contributions).toHaveLength(2);
		expect(afterSync.pools[0].granted).toBe(GRANT * 2);

		// The stale snapshot's balance was computed from a granted of GRANT, so
		// writing it back would strand the pool at GRANT - USAGE and erase the
		// second contribution outright.
		const pooledCustomerEntitlement = afterSync.poolCustomerEntitlements[0];
		expect(pooledCustomerEntitlement.balance).not.toBe(GRANT - USAGE);
		expect(pooledCustomerEntitlement.balance).toBeGreaterThanOrEqual(
			GRANT * 2 - USAGE,
		);
	},
);
