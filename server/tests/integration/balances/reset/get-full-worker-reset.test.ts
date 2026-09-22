/**
 * CusService.getFull on the worker path: a due row is refilled by the owning worker, landed in
 * Postgres, and the read returns the fresh rows. Nothing in the server writes the reset itself.
 */

import { expect, test } from "bun:test";
import { fullCustomerToCustomerEntitlements } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import {
	fetchCustomerEntitlementRow,
	waitForPostgresBalance,
} from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	expireAllCusEntsForReset,
	expireCusEntForReset,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";

const INCLUDED_USAGE = 100;

test.concurrent(
	`${chalk.yellowBright("getFull (worker path): a due row is refilled by the worker and read back fresh")}`,
	async () => {
		const customerId = "get-full-worker-reset";
		const plan = products.base({
			id: "get-full-worker-reset",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 3000 }),
			],
		});
		const before = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		if (!before) throw new Error("expected the messages row");
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: before.id,
			expectedBalance: INCLUDED_USAGE - 30,
		});

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		await evictBalanceWorkerCustomer({ ctx, customerId });

		// The read itself brings the row current: the worker refills, lands it, and getFull re-reads.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const refilled = await findCustomerEntitlement({
			ctx,
			customerId,
			fullCustomer,
			featureId: TestFeature.Messages,
		});
		expect(refilled?.balance).toBe(INCLUDED_USAGE);
		expect(refilled?.next_reset_at).toBeGreaterThan(Date.now());

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: before.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);
		expect(row.next_reset_at).toBe(refilled?.next_reset_at ?? null);

		// Already current: a second read asks for nothing and changes nothing.
		const again = await CusService.getFull({ ctx, idOrInternalId: customerId });
		const still = await findCustomerEntitlement({
			ctx,
			customerId,
			fullCustomer: again,
			featureId: TestFeature.Messages,
		});
		expect(still?.balance).toBe(INCLUDED_USAGE);
		expect(still?.next_reset_at).toBe(refilled?.next_reset_at ?? null);
	},
);

test.concurrent(
	`${chalk.yellowBright("getFull (worker path): entity-owned due rows are refilled under each entity's subject")}`,
	async () => {
		const customerId = "get-full-worker-reset-entities";
		const plan = products.base({
			id: "get-full-worker-reset-entities",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});
		const { ctx, autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: plan.id, entityIndex: 0 }),
				s.attach({ productId: plan.id, entityIndex: 1 }),
			],
		});
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		const expired = await expireAllCusEntsForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(expired).toHaveLength(2);
		const trackedRow = expired.find(
			(row) => row.customer_product?.entity_id === entities[0].id,
		);
		if (!trackedRow) throw new Error("expected entity 0's row");
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: trackedRow.id,
			expectedBalance: INCLUDED_USAGE - 30,
		});
		await evictBalanceWorkerCustomer({ ctx, customerId });

		// One getFull, two entity subjects due: both refilled before the rows come back.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		for (const expiredRow of expired) {
			const row = await fetchCustomerEntitlementRow({
				db: ctx.db,
				customerEntitlementId: expiredRow.id,
			});
			expect(row.balance).toBe(INCLUDED_USAGE);
			expect(row.next_reset_at).toBeGreaterThan(Date.now());
		}
		const inMemory = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId: TestFeature.Messages,
		});
		expect(inMemory.map((row) => row.balance)).toEqual([
			INCLUDED_USAGE,
			INCLUDED_USAGE,
		]);
	},
);
