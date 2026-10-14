import { expect, test } from "bun:test";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import {
	expireAllCusEntsForReset,
	expireCusEntForReset,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logger } from "@/external/logtail/logtailUtils.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { enqueueWorkerResets } from "@/internal/balances/batchReset/enqueueWorkerResets/enqueueWorkerResets.js";
import {
	fetchCustomerEntitlementRow,
	waitForPostgresBalance,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;
const POLL_ATTEMPTS = 200;
const POLL_INTERVAL_MS = 50;

const workerLaneTest = test.concurrent.skipIf(!isBalanceWorkerRoute());

const initWorkerLaneScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const plan = products.base({
		id: "batch-reset-worker-lane",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 3000 }),
		],
	});
	const customerEntitlement = await findCustomerEntitlement({
		ctx: scenario.ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	if (!customerEntitlement) throw new Error("expected the messages row");
	await waitForPostgresBalance({
		db: scenario.ctx.db,
		customerEntitlementId: customerEntitlement.id,
		expectedBalance: INCLUDED_USAGE - 30,
	});
	return { ...scenario, customerEntitlement };
};

type ScannedRow = {
	id: string;
	internal_customer_id: string;
	internal_entity_id?: string | null;
	customer_product_id?: string | null;
};

const sweepPageFor = ({
	rows,
	dueBefore,
}: {
	rows: ScannedRow[];
	dueBefore: number;
}) => ({
	page: rows.map((row) => ({
		id: row.id,
		nextResetAt: dueBefore - 1000,
		internalCustomerId: row.internal_customer_id,
		internalEntityId: row.internal_entity_id ?? null,
		customerProductId: row.customer_product_id ?? null,
	})),
	dueBefore,
	now: dueBefore,
});

const waitForNextResetAtAfter = async ({
	ctx,
	customerEntitlementId,
	after,
}: {
	ctx: { db: Parameters<typeof fetchCustomerEntitlementRow>[0]["db"] };
	customerEntitlementId: string;
	after: number;
}) => {
	let row = await fetchCustomerEntitlementRow({
		db: ctx.db,
		customerEntitlementId,
	});
	for (
		let attempt = 0;
		attempt < POLL_ATTEMPTS && (row.next_reset_at ?? 0) <= after;
		attempt++
	) {
		await Bun.sleep(POLL_INTERVAL_MS);
		row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId,
		});
	}
	return row;
};

workerLaneTest(
	`${chalk.yellowBright("batch-reset-v2 worker lane: a due row is refilled by the worker, once per sweep")}`,
	async () => {
		const customerId = "batch-reset-v2-worker-lane";
		const { ctx, customerEntitlement } = await initWorkerLaneScenario({
			customerId,
		});

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		await evictBalanceWorkerCustomer({ ctx, customerId });

		const dueBefore = Date.now();
		const sweep = sweepPageFor({ rows: [customerEntitlement], dueBefore });
		expect(
			await enqueueWorkerResets({ ctx: { db: ctx.db, logger }, ...sweep }),
		).toBe(1);

		const refilled = await waitForNextResetAtAfter({
			ctx,
			customerEntitlementId: customerEntitlement.id,
			after: pastTime,
		});
		expect(refilled.balance).toBe(INCLUDED_USAGE);
		expect(refilled.next_reset_at).toBeGreaterThan(Date.now());

		await enqueueWorkerResets({ ctx: { db: ctx.db, logger }, ...sweep });
		await Bun.sleep(1_000);
		const again = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(again.balance).toBe(INCLUDED_USAGE);
		expect(again.next_reset_at).toBe(refilled.next_reset_at);
	},
);

workerLaneTest(
	`${chalk.yellowBright("batch-reset-v2 worker lane: a track racing the cron's reset refills the row exactly once")}`,
	async () => {
		const customerId = "batch-reset-v2-worker-lane-race";
		const { ctx, autumnV1, customerEntitlement } = await initWorkerLaneScenario(
			{
				customerId,
			},
		);

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		await evictBalanceWorkerCustomer({ ctx, customerId });

		const dueBefore = Date.now();
		await Promise.all([
			enqueueWorkerResets({
				ctx: { db: ctx.db, logger },
				...sweepPageFor({ rows: [customerEntitlement], dueBefore }),
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 7,
			}),
		]);

		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
			expectedBalance: INCLUDED_USAGE - 7,
		});
		await Bun.sleep(1_000);
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE - 7);
		expect(row.next_reset_at).toBeGreaterThan(Date.now());
	},
);

workerLaneTest(
	`${chalk.yellowBright("batch-reset-v2 worker lane: an entity's own due rows are reset under the entity's subject, once each")}`,
	async () => {
		const customerId = "batch-reset-v2-worker-lane-entities";
		const plan = products.base({
			id: "batch-reset-worker-lane-entities",
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
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		const expired = await expireAllCusEntsForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(expired).toHaveLength(2);
		for (const row of expired) {
			await waitForPostgresBalance({
				db: ctx.db,
				customerEntitlementId: row.id,
				expectedBalance: INCLUDED_USAGE - 30,
			});
		}
		await evictBalanceWorkerCustomer({ ctx, customerId });

		const dueBefore = Date.now();
		const rows = await Promise.all(
			expired.map((row) =>
				fetchCustomerEntitlementRow({
					db: ctx.db,
					customerEntitlementId: row.id,
				}),
			),
		);
		expect(
			await enqueueWorkerResets({
				ctx: { db: ctx.db, logger },
				...sweepPageFor({ rows, dueBefore }),
			}),
		).toBe(2);

		for (const row of rows) {
			const refilled = await waitForNextResetAtAfter({
				ctx,
				customerEntitlementId: row.id,
				after: dueBefore - 1000,
			});
			expect(refilled.balance).toBe(INCLUDED_USAGE);
			expect(refilled.next_reset_at).toBeGreaterThan(Date.now());
		}
	},
);
