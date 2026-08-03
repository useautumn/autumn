/**
 * Cross-migration per-customer mutual exclusion — the DB invariant behind
 * `migration_item_runs_live_item_exclusive`: a customer can be RUNNING in at
 * most one live migration, no matter which lane is executing.
 *
 * Contract under test:
 *   - repo claim: a customer running in migration A is not claimable by B
 *     (claimed: false), and the claim raises nothing.
 *   - per-customer lane: a busy customer is left untouched (no item run, no
 *     mutation); after the blocker settles, a rerun converges them.
 *   - batch lane: claiming a busy customer fails the run loudly (the unique
 *     index is the arbiter — no anti-join prefilter); nothing is applied, and
 *     a rerun after the blocker settles converges everyone.
 *   - batch × batch: two identically-defined migrations racing the same
 *     customers never double-apply — every customer ends with exactly one
 *     added cusEnt row, whichever run wins (the loser fails loudly).
 */

import { expect, test } from "bun:test";
import { MigrationItemKind } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { settleLeftoverClaims } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	getInternalCustomerId,
	type ScenarioCtx,
} from "../batchTestUtils";

const addDashboard = (planId: string) => ({
	filter: { customer: { plan: { plan_id: planId } } },
	operations: {
		customer: [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId },
				customize: { add_items: [itemsV2.dashboard()] },
			},
		],
	},
});

/** A running claim under an unrelated migration id — "customer is busy". */
const blockCustomer = async ({
	ctx,
	blockerId,
	internalCustomerId,
}: {
	ctx: ScenarioCtx;
	blockerId: string;
	internalCustomerId: string;
}) => {
	const claim = await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: blockerId,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
		claimBehavior: "claim_new",
	});
	expect(claim.claimed).toBe(true);
};

const settleBlocker = async ({
	ctx,
	blockerId,
	internalCustomerId,
}: {
	ctx: ScenarioCtx;
	blockerId: string;
	internalCustomerId: string;
}) =>
	migrationItemRunRepo.markFailed({
		ctx,
		migrationInternalId: blockerId,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});

test.concurrent(
	`${chalk.yellowBright("concurrency exclusion: a running customer is not claimable by another migration")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `conc-claim-${suffix}`;
		const plan = products.base({ id: `conc-claim-plan-${suffix}`, items: [] });
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const blockerId = `conc-claim-blocker-${suffix}`;

		await blockCustomer({ ctx, blockerId, internalCustomerId });
		try {
			const rival = await migrationItemRunRepo.claim({
				ctx,
				migrationInternalId: `conc-claim-rival-${suffix}`,
				itemKind: MigrationItemKind.Customer,
				itemId: internalCustomerId,
				claimBehavior: "claim_new",
			});
			expect(rival).toMatchObject({ claimed: false, itemRun: null });
		} finally {
			await settleBlocker({ ctx, blockerId, internalCustomerId });
		}

		// Once the blocker settles, the rival claim goes through.
		const reclaim = await migrationItemRunRepo.claim({
			ctx,
			migrationInternalId: `conc-claim-rival-${suffix}`,
			itemKind: MigrationItemKind.Customer,
			itemId: internalCustomerId,
			claimBehavior: "claim_new",
		});
		expect(reclaim.claimed).toBe(true);
		await settleBlocker({
			ctx,
			blockerId: `conc-claim-rival-${suffix}`,
			internalCustomerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("concurrency exclusion: per-customer lane skips a customer running in another migration")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `conc-percus-${suffix}`;
		const plan = products.base({ id: `conc-percus-plan-${suffix}`, items: [] });
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const blockerId = `conc-percus-blocker-${suffix}`;

		await blockCustomer({ ctx, blockerId, internalCustomerId });
		try {
			const { migration, result } = await runChunkedMigration({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `conc-percus-mig-${suffix}`,
				...addDashboard(plan.id),
				noBillingChanges: true,
				// `limit` keeps the run on the per-customer lane; `only` narrows
				// it to this customer.
				controls: { only: [customerId], limit: 1 },
			});
			expect(result?.lane).toBe("per_customer");

			// Busy customer: untouched, and no item run recorded for this migration.
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Dashboard,
				count: 0,
			});
			expect(
				await migrationItemRunRepo.get({
					ctx,
					migrationInternalId: migration.internal_id,
					itemKind: MigrationItemKind.Customer,
					itemId: internalCustomerId,
				}),
			).toBeNull();
		} finally {
			await settleBlocker({ ctx, blockerId, internalCustomerId });
		}

		// Blocker settled → rerun converges the customer.
		await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `conc-percus-mig-${suffix}`,
			...addDashboard(plan.id),
			noBillingChanges: true,
			controls: { only: [customerId], limit: 1 },
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("concurrency exclusion: batch lane fails loudly on a busy customer and converges after settle")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const freeId = `conc-batch-free-${suffix}`;
		const busyId = `conc-batch-busy-${suffix}`;
		const plan = products.base({ id: `conc-batch-plan-${suffix}`, items: [] });
		const { autumnV2_2, ctx } = await initScenario({
			customerId: freeId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: busyId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({ customerId: busyId, productId: plan.id }),
			],
		});
		const busyInternalId = await getInternalCustomerId({
			ctx,
			customerId: busyId,
		});
		const blockerId = `conc-batch-blocker-${suffix}`;

		await blockCustomer({ ctx, blockerId, internalCustomerId: busyInternalId });
		try {
			// The page claim hits the exclusivity index → the run fails loudly;
			// the claim upsert is atomic, so nothing was applied to anyone.
			await expect(
				runChunkedMigration({
					ctx,
					migrationClient: autumnV2_2,
					migrationId: `conc-batch-mig-${suffix}`,
					...addDashboard(plan.id),
					noBillingChanges: true,
				}),
			).rejects.toThrow(/migration_item_runs_live_item_exclusive/);

			for (const customerId of [freeId, busyId]) {
				await expectCustomerEntitlementRowCount({
					ctx,
					customerId,
					planId: plan.id,
					featureId: TestFeature.Dashboard,
					count: 0,
				});
			}
		} finally {
			await settleBlocker({
				ctx,
				blockerId,
				internalCustomerId: busyInternalId,
			});
		}

		// Blocker settled → rerun converges both customers.
		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `conc-batch-mig-${suffix}`,
			...addDashboard(plan.id),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");
		for (const customerId of [freeId, busyId]) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Dashboard,
				count: 1,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("concurrency exclusion: two identical batch migrations racing never double-apply")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerIds = [1, 2, 3].map((n) => `conc-race-${n}-${suffix}`);
		const [firstId, ...otherIds] = customerIds;
		const plan = products.base({ id: `conc-race-plan-${suffix}`, items: [] });
		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer(),
				s.otherCustomers(otherIds.map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				...otherIds.map((customerId) =>
					s.billing.attach({ customerId, productId: plan.id }),
				),
			],
		});

		// The org-level run queue normally serializes these; driving the chunk
		// runner directly simulates that guard failing. If the runs genuinely
		// overlap, the loser fails loudly on the exclusivity index — the only
		// acceptable rejection.
		const outcomes = await Promise.allSettled(
			["a", "b"].map((tag) =>
				runChunkedMigration({
					ctx,
					migrationClient: autumnV2_2,
					migrationId: `conc-race-mig-${tag}-${suffix}`,
					...addDashboard(plan.id),
					noBillingChanges: true,
				}),
			),
		);
		const rejections = outcomes.filter(
			(outcome) => outcome.status === "rejected",
		);
		expect(rejections.length).toBeLessThanOrEqual(1);
		for (const rejection of rejections) {
			expect(String(rejection.reason)).toContain(
				"migration_item_runs_live_item_exclusive",
			);
		}

		// The invariant: no customer is double-applied, whichever run won them.
		for (const customerId of customerIds) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Dashboard,
				count: 1,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("concurrency exclusion: a dead run's claims stop blocking others once settled")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `conc-dead-${suffix}`;
		const plan = products.base({ id: `conc-dead-plan-${suffix}`, items: [] });
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });

		// A real run row whose task "died": it claimed the customer and will
		// never drain (the shape a crashed trigger task leaves behind).
		const deadMigration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `conc-dead-mig-${suffix}`,
			...addDashboard(plan.id),
			no_billing_changes: true,
		});
		const deadRun = await migrationRunRepo.insert({
			ctx,
			insert: {
				migration_internal_id: deadMigration.internal_id,
				dry_run: false,
				lazy_run: false,
				only_ids: null,
				target_limit: undefined,
			},
		});
		expect(deadRun).not.toBeNull();
		if (!deadRun) throw new Error("expected the dead run to claim");
		const claim = await migrationItemRunRepo.claim({
			ctx,
			migrationInternalId: deadMigration.internal_id,
			migrationRunId: deadRun.internal_id,
			itemKind: MigrationItemKind.Customer,
			itemId: internalCustomerId,
			claimBehavior: "claim_new",
		});
		expect(claim.claimed).toBe(true);

		try {
			// While the dead run's claim is live, other migrations are blocked.
			const blocked = await migrationItemRunRepo.claim({
				ctx,
				migrationInternalId: `conc-dead-rival-${suffix}`,
				itemKind: MigrationItemKind.Customer,
				itemId: internalCustomerId,
				claimBehavior: "claim_new",
			});
			expect(blocked).toMatchObject({ claimed: false, itemRun: null });

			// The cancel handler's dead-task path: settle the run's claims
			// (same call it makes once trigger confirms the task is terminal).
			await settleLeftoverClaims({ ctx, migrationRunId: deadRun.internal_id });

			// The dead run's item run is settled as failed…
			expect(
				await migrationItemRunRepo.get({
					ctx,
					migrationInternalId: deadMigration.internal_id,
					itemKind: MigrationItemKind.Customer,
					itemId: internalCustomerId,
				}),
			).toMatchObject({ status: "failed" });

			// …and the customer is claimable by other migrations again.
			const unblocked = await migrationItemRunRepo.claim({
				ctx,
				migrationInternalId: `conc-dead-rival-${suffix}`,
				itemKind: MigrationItemKind.Customer,
				itemId: internalCustomerId,
				claimBehavior: "claim_new",
			});
			expect(unblocked.claimed).toBe(true);
			await settleBlocker({
				ctx,
				blockerId: `conc-dead-rival-${suffix}`,
				internalCustomerId,
			});
		} finally {
			await migrationRunRepo.update({
				ctx,
				internalId: deadRun.internal_id,
				updates: { status: "canceled", finished_at: Date.now() },
			});
		}
	},
);
