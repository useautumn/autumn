/** Regression: batch reset must use pooled grants and reset pools of every
 * non-lifetime mode — invoice.created is only a redundant fast path. */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	EntInterval,
	entitlements,
	PooledBalanceResetMode,
	pooledBalances,
	RolloverExpiryDurationType,
	rolloverConfigToSignature,
} from "@autumn/shared";
import { buildCustomerMeteredScenario } from "@tests/integration/db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "@tests/integration/db/full-subject/utils/withInsertedScenario.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getResetEligibleCustomerEntitlementsPage } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import {
	fetchCustomerEntitlementRow,
	fetchRollovers,
	runBatchResetV2,
} from "./batchResetV2TestUtils.js";

const withPooledResetScenario = async ({
	name,
	granted,
	resetMode,
	withRollover,
	run,
}: {
	name: string;
	granted: number;
	resetMode: PooledBalanceResetMode;
	withRollover: boolean;
	run: (params: {
		customerEntitlementId: string;
		pastTime: number;
	}) => Promise<void>;
}) => {
	const scenario = buildCustomerMeteredScenario({ ctx, name });

	await withInsertedScenario({
		ctx,
		scenario,
		run: async () => {
			const suffix = scenario.ids.internalCustomerId;
			const entitlementId = `ent_pool_${suffix}`;
			const customerEntitlementId = `cus_ent_pool_${suffix}`;
			const pooledBalanceId = `pool_${suffix}`;
			const pastTime = Date.now() - 1_000;
			const sourceEntitlement = scenario.entitlements[0];
			const sourceCustomerEntitlement = scenario.customerEntitlements[0];
			const rollover = withRollover
				? {
						max_percentage: 50,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					}
				: null;

			await ctx.db.insert(entitlements).values({
				...sourceEntitlement,
				id: entitlementId,
				internal_product_id: null,
				is_custom: true,
				allowance: 0,
				pooled: true,
				rollover,
			});
			await ctx.db.insert(customerEntitlements).values({
				...sourceCustomerEntitlement,
				id: customerEntitlementId,
				customer_product_id: null,
				entitlement_id: entitlementId,
				balance: granted,
				reset_cycle_anchor: pastTime,
				next_reset_at: pastTime,
				is_pooled_balance: true,
				pooled_balance_id: pooledBalanceId,
				pooled_contribution_id: null,
				reset_by_invoice: null,
			});
			await ctx.db.insert(pooledBalances).values({
				id: pooledBalanceId,
				org_id: ctx.org.id,
				env: ctx.env,
				internal_customer_id: scenario.ids.internalCustomerId,
				internal_feature_id: sourceEntitlement.internal_feature_id,
				granted,
				interval: EntInterval.Month,
				interval_count: 1,
				reset_cycle_anchor: pastTime,
				reset_mode: resetMode,
				stripe_subscription_id:
					resetMode === PooledBalanceResetMode.Subscription
						? `sub_${suffix}`
						: null,
				customer_license_link_id: null,
				rollover_signature: rolloverConfigToSignature({ rollover }),
				customer_entitlement_id: customerEntitlementId,
				last_applied_reset_at: null,
			});

			try {
				await run({ customerEntitlementId, pastTime });
			} finally {
				await ctx.db
					.delete(pooledBalances)
					.where(eq(pooledBalances.id, pooledBalanceId));
				await ctx.db
					.delete(customerEntitlements)
					.where(eq(customerEntitlements.id, customerEntitlementId));
				await ctx.db
					.delete(entitlements)
					.where(eq(entitlements.id, entitlementId));
			}
		},
	});
};

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 pooled: lazy reset uses pooled granted for balance and rollover cap")}`,
	async () => {
		const granted = 400;
		await withPooledResetScenario({
			name: "batch-reset-v2-pooled-lazy",
			granted,
			resetMode: PooledBalanceResetMode.Lazy,
			withRollover: true,
			run: async ({ customerEntitlementId }) => {
				const result = await runBatchResetV2({
					ctx,
					customerEntitlementIds: [customerEntitlementId],
				});

				expect(result.resetMutations).toHaveLength(1);
				const row = await fetchCustomerEntitlementRow({
					db: ctx.db,
					customerEntitlementId,
				});
				expect(row.balance).toBe(granted);

				const rolloverRows = await fetchRollovers({
					db: ctx.db,
					customerEntitlementId,
				});
				expect(
					rolloverRows.reduce(
						(total, rollover) => total + (rollover.balance ?? 0),
						0,
					),
				).toBe(granted * 0.5);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 pooled: subscription pool resets like a lazy pool")}`,
	async () => {
		const granted = 300;
		await withPooledResetScenario({
			name: "batch-reset-v2-pooled-subscription",
			granted,
			resetMode: PooledBalanceResetMode.Subscription,
			withRollover: false,
			run: async ({ customerEntitlementId, pastTime }) => {
				const result = await runBatchResetV2({
					ctx,
					customerEntitlementIds: [customerEntitlementId],
				});

				expect(result.resetMutations).toHaveLength(1);
				const row = await fetchCustomerEntitlementRow({
					db: ctx.db,
					customerEntitlementId,
				});
				expect(row.balance).toBe(granted);
				expect(row.next_reset_at).toBeGreaterThan(pastTime);
				expect(row.reset_by_invoice).not.toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 pooled: lifetime pool is never reset")}`,
	async () => {
		const granted = 200;
		await withPooledResetScenario({
			name: "batch-reset-v2-pooled-lifetime",
			granted,
			resetMode: PooledBalanceResetMode.Lifetime,
			withRollover: false,
			run: async ({ customerEntitlementId, pastTime }) => {
				const result = await runBatchResetV2({
					ctx,
					customerEntitlementIds: [customerEntitlementId],
				});

				expect(result.resetMutations).toHaveLength(0);
				expect(result.verdicts).toEqual([
					expect.objectContaining({
						kind: "no_action",
						reason: "pooled_balance_lifetime",
						customerEntitlementId,
					}),
				]);

				const row = await fetchCustomerEntitlementRow({
					db: ctx.db,
					customerEntitlementId,
				});
				expect(row.balance).toBe(granted);
				expect(row.next_reset_at).toBe(pastTime);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 pooled: source contribution is excluded from scans and direct resets")}`,
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "batch-reset-v2-pooled-source",
		});
		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const sourceEntitlement = scenario.entitlements[0];
				const sourceCustomerEntitlement = scenario.customerEntitlements[0];
				const nextResetAt = Date.UTC(1985, 0, 1);
				const dueBefore = nextResetAt + 1_000;

				await ctx.db
					.update(entitlements)
					.set({ pooled: true })
					.where(eq(entitlements.id, sourceEntitlement.id));
				await ctx.db
					.update(customerEntitlements)
					.set({
						balance: 0,
						next_reset_at: nextResetAt,
						pooled_contribution_id: `pbc_${scenario.ids.internalCustomerId}`,
					})
					.where(eq(customerEntitlements.id, sourceCustomerEntitlement.id));

				const scan = await getResetEligibleCustomerEntitlementsPage({
					db: ctx.db,
					dueBefore,
					cursor: null,
					limit: 10_000,
				});
				expect(scan.map(({ id }) => id)).not.toContain(
					sourceCustomerEntitlement.id,
				);

				const result = await runBatchResetV2({
					ctx,
					customerEntitlementIds: [sourceCustomerEntitlement.id],
				});
				expect(result.resetMutations).toHaveLength(0);
				expect(result.verdicts).toEqual([
					expect.objectContaining({
						kind: "no_action",
						reason: "pooled_balance_source",
						customerEntitlementId: sourceCustomerEntitlement.id,
					}),
				]);

				const row = await fetchCustomerEntitlementRow({
					db: ctx.db,
					customerEntitlementId: sourceCustomerEntitlement.id,
				});
				expect(row.balance).toBe(0);
				expect(row.next_reset_at).toBe(nextResetAt);
			},
		});
	},
);
