/**
 * BENCH ONLY (bench/bm-worker-vs-sql, never merge): every select for a patch up
 * front, then each customer's removes, replaces and adds as ONE applyBillingPlan.
 */
import {
	type BillingPlanOp,
	type CatalogRow,
	toBillingPlanIncrementOp,
	toBillingPlanInsertOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import {
	CusProductStatus,
	type EntitlementWithFeature,
	isResettingEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyMigrationPlanOnWorker } from "@/internal/balanceWorker/migrationPlan/applyMigrationPlanOnWorker.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationRemovedItem,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_WORKER_SEND_CONCURRENCY,
} from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import {
	type CycleEnrichmentCandidate,
	enrichCustomerEntitlementCycles,
} from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import { generateId } from "@/utils/genUtils.js";
import { selectAddCandidateRows } from "../addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { removeCandidatesToMigrationPlan } from "../removeCustomerEntitlementsOnWorker/removeCandidatesToMigrationPlan.js";
import {
	type HeldRemoveCandidateRow,
	selectHeldRemoveCandidates,
} from "../removeCustomerEntitlementsOnWorker/selectHeldRemoveCandidates.js";
import {
	type ReplaceCandidateRow,
	selectReplaceCandidateRows,
} from "../replaceCustomerEntitlementsForPage/selectReplaceCandidateRows.js";
import { remainingAfterBalancePatch } from "../replaceLicenseEntitlementsForPage/remainingAfterBalancePatch.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import { groupFilterReplaceRows } from "../utils/groupFilterReplaceRows.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";

type CycleFields = {
	resetCycleAnchor: number | null;
	nextResetAt: number | null;
};

type CustomerPlan = {
	ops: BillingPlanOp[];
	entityIds: string[];
	removedItems: BatchMigrationRemovedItem[];
	insertedItems: BatchMigrationInsertedItem[];
};

const collectPages = async <Row extends { customerProductId: string }>({
	ctx,
	select,
}: {
	ctx: AutumnContext;
	select: (params: {
		transaction: AutumnContext["db"];
		afterCustomerProductId?: string;
		limit: number;
	}) => Promise<Row[]>;
}): Promise<Row[]> => {
	const rows: Row[] = [];
	await iterateCustomerProductPages({
		db: ctx.db,
		pageSize: BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
		executePage: async ({ transaction, afterCustomerProductId, limit }) => {
			const page = await select({ transaction, afterCustomerProductId, limit });
			return { rows: page, result: page };
		},
		onCommit: (page) => {
			rows.push(...page);
		},
	});
	return rows;
};

const withCycles = <Row extends CycleEnrichmentCandidate>({
	rows,
	entitlement,
	now,
}: {
	rows: Row[];
	entitlement: EntitlementWithFeature;
	now: number;
}): (Row & CycleFields)[] =>
	isResettingEntitlement({ entitlement })
		? enrichCustomerEntitlementCycles({ candidates: rows, entitlement, now })
				.rows
		: rows.map((row) => ({
				...row,
				resetCycleAnchor: null,
				nextResetAt: null,
			}));

const catalogRowsOf = ({
	entitlements,
}: {
	entitlements: EntitlementWithFeature[];
}): CatalogRow[] =>
	entitlements.flatMap(({ feature, ...entitlement }): CatalogRow[] => [
		{ table: "entitlements", row: entitlement },
		{ table: "features", row: feature },
	]);

const replaceOps = ({
	row,
	entitlement,
	patch,
}: {
	row: ReplaceCandidateRow & CycleFields;
	entitlement: EntitlementWithFeature;
	patch: CustomerEntitlementPatch;
}): BillingPlanOp[] => {
	const setBalance =
		patch.balance?.type === "increment" ? undefined : patch.balance?.amount;
	return [
		toBillingPlanUpdateOp({
			table: "customerEntitlements",
			id: row.customerEntitlementId,
			set: {
				entitlement_id: entitlement.id,
				internal_feature_id: entitlement.internal_feature_id,
				feature_id: entitlement.feature.id,
				reset_cycle_anchor: row.resetCycleAnchor,
				next_reset_at: row.nextResetAt,
				balance: setBalance,
				unlimited: patch.unlimited,
			},
			expect: { entitlement_id: row.liveDefinition?.id ?? null },
		}),
		...(patch.balance?.type === "increment" && patch.balance.amount !== 0
			? [
					toBillingPlanIncrementOp({
						id: row.customerEntitlementId,
						add: { balance: patch.balance.amount },
					}),
				]
			: []),
	];
};

const insertOp = ({
	row,
	entitlement,
	granted,
	unlimited,
	invoiceCredit,
	now,
}: {
	row: CycleEnrichmentCandidate & CycleFields;
	entitlement: EntitlementWithFeature;
	granted: number | null;
	unlimited: boolean | null;
	invoiceCredit: boolean;
	now: number;
}): BillingPlanOp =>
	toBillingPlanInsertOp({
		table: "customerEntitlements",
		row: {
			id: generateId("cus_ent"),
			customer_product_id: row.customerProductId,
			entitlement_id: entitlement.id,
			internal_customer_id: row.internalCustomerId,
			internal_entity_id: null,
			internal_feature_id: entitlement.internal_feature_id,
			unlimited,
			balance: granted,
			created_at: now,
			reset_cycle_anchor: row.resetCycleAnchor,
			next_reset_at: row.nextResetAt,
			usage_allowed: false,
			separate_interval: false,
			adjustment: 0,
			additional_balance: 0,
			entities: null,
			expires_at: null,
			customer_id: row.customerId,
			feature_id: entitlement.feature.id,
			external_id: null,
			invoice_credit: invoiceCredit,
			expired: row.status === CusProductStatus.Expired,
		},
	});

const lifecycleOf = (row: CycleEnrichmentCandidate) => ({
	internalCustomerId: row.internalCustomerId,
	customerProductId: row.customerProductId,
	entityId: row.entityId,
	status: row.status,
	startsAt: row.startsAt,
	canceledAt: row.canceledAt,
	endedAt: row.endedAt,
	trialEndsAt: row.trialEndsAt,
});

export const applyPlanPerCustomerOnWorker = async ({
	ctx,
	gate,
	patch,
	customers,
	now,
	phases,
}: {
	ctx: AutumnContext;
	gate: WorkerPageGate;
	patch: BatchMigrationExecutionPatch;
	customers: BatchMigrationPageCustomer[];
	now: number;
	phases?: BatchMigrationPagePhases;
}): Promise<{
	removedItems: BatchMigrationRemovedItem[];
	insertedItems: BatchMigrationInsertedItem[];
	failureReasons: Record<string, string>;
}> => {
	const internalCustomerIds = customers.map(({ internalId }) => internalId);
	const planId = patch.fromProduct.id;

	const { removeRows, replaceSets, addSets } = await timePhase({
		phases,
		phase: "plan_selects",
		run: async () => {
			const [removeRows, replaceSets, addSets] = await Promise.all([
				selectHeldRemoveCandidates({ ctx, patch, internalCustomerIds }),
				Promise.all(
					patch.replaceEntitlementOps.map(async (replace) => {
						const rows = await collectPages({
							ctx,
							select: ({ transaction, afterCustomerProductId, limit }) =>
								selectReplaceCandidateRows({
									db: transaction,
									internalCustomerIds,
									scope: patch.scope,
									entitlement: replace.entitlement,
									filter: replace.from,
									excludeEntitlementId: replace.entitlement.id,
									features: ctx.features,
									includeAnchorSources: isResettingEntitlement({
										entitlement: replace.entitlement,
									}),
									afterCustomerProductId,
									limit,
								}),
						});
						return {
							replace,
							groups: groupFilterReplaceRows({
								rows: withCycles({
									rows,
									entitlement: replace.entitlement,
									now,
								}),
								toEntitlement: replace.entitlement,
							}),
						};
					}),
				),
				Promise.all(
					patch.addEntitlementOps.map(async (add) => {
						const rows = await collectPages({
							ctx,
							select: ({ transaction, afterCustomerProductId, limit }) =>
								selectAddCandidateRows({
									db: transaction,
									internalCustomerIds,
									scope: patch.scope,
									entitlement: add.entitlement,
									includeAnchorSources: isResettingEntitlement({
										entitlement: add.entitlement,
									}),
									afterCustomerProductId,
									limit,
								}),
						});
						return {
							add,
							rows: withCycles({ rows, entitlement: add.entitlement, now }),
						};
					}),
				),
			]);
			return { removeRows, replaceSets, addSets };
		},
	});

	const plans = new Map<string, CustomerPlan>();
	const planOf = (internalCustomerId: string): CustomerPlan => {
		const existing = plans.get(internalCustomerId);
		if (existing) return existing;
		const created: CustomerPlan = {
			ops: [],
			entityIds: [],
			removedItems: [],
			insertedItems: [],
		};
		plans.set(internalCustomerId, created);
		return created;
	};

	await timePhase({
		phases,
		phase: "plan_compile",
		run: async () => {
			const removeRowsByCustomer = new Map<string, HeldRemoveCandidateRow[]>();
			for (const row of removeRows) {
				const rows = removeRowsByCustomer.get(row.internalCustomerId) ?? [];
				rows.push(row);
				removeRowsByCustomer.set(row.internalCustomerId, rows);
			}
			for (const [internalCustomerId, rows] of removeRowsByCustomer) {
				const plan = planOf(internalCustomerId);
				const removePlan = removeCandidatesToMigrationPlan({ rows });
				plan.ops.push(...removePlan.ops);
				plan.entityIds.push(...removePlan.entityIds);
				for (const row of rows)
					if (row.liveDefinition)
						plan.removedItems.push(
							toRemovedItem({
								row,
								planId,
								fromEntitlement: row.liveDefinition,
							}),
						);
			}

			for (const { replace, groups } of replaceSets)
				for (const group of groups)
					for (const row of group.rows) {
						if (!row.liveDefinition) continue;
						const plan = planOf(row.internalCustomerId);
						plan.ops.push(
							...replaceOps({
								row,
								entitlement: replace.entitlement,
								patch: group.patch,
							}),
						);
						plan.removedItems.push(
							toRemovedItem({
								row,
								planId,
								fromEntitlement: row.liveDefinition,
							}),
						);
						plan.insertedItems.push({
							...lifecycleOf(row),
							planId,
							featureId: replace.entitlement.feature.id,
							granted: replace.initialState.granted,
							remaining: remainingAfterBalancePatch({
								liveBalance: row.liveBalance,
								patch: group.patch,
							}),
							unlimited: replace.initialState.unlimited === true,
							nextResetAt: row.nextResetAt,
						});
					}

			for (const { add, rows } of addSets)
				for (const row of rows) {
					const plan = planOf(row.internalCustomerId);
					plan.ops.push(
						insertOp({
							row,
							entitlement: add.entitlement,
							granted: add.initialState.granted,
							unlimited: add.initialState.unlimited,
							invoiceCredit: add.invoiceCredit ?? false,
							now,
						}),
					);
					plan.insertedItems.push({
						...lifecycleOf(row),
						planId,
						featureId: add.entitlement.feature.id,
						granted: add.initialState.granted,
						unlimited: add.initialState.unlimited === true,
						nextResetAt: row.nextResetAt,
					});
				}
		},
	});

	const catalogRows = catalogRowsOf({
		entitlements: [
			...patch.replaceEntitlementOps.map(({ entitlement }) => entitlement),
			...patch.addEntitlementOps.map(({ entitlement }) => entitlement),
		],
	});
	const customerById = new Map(
		customers.map((customer) => [customer.internalId, customer]),
	);
	const failureReasons: Record<string, string> = {};
	const removedItems: BatchMigrationRemovedItem[] = [];
	const insertedItems: BatchMigrationInsertedItem[] = [];

	await timePhase({
		phases,
		phase: "plan_send",
		run: () =>
			mapWithConcurrency({
				items: [...plans.entries()],
				concurrency: BATCH_MIGRATION_WORKER_SEND_CONCURRENCY,
				run: async ([internalCustomerId, plan]) => {
					const customerId = customerById.get(internalCustomerId)?.id;
					if (!customerId) {
						failureReasons[internalCustomerId] = "NO_PUBLIC_ID";
						return;
					}
					try {
						const outcome = await applyMigrationPlanOnWorker({
							ctx,
							customerId,
							plan: {
								entityIds: [...new Set(plan.entityIds)],
								ops: plan.ops,
								catalogRows,
							},
							commandId: generateId("mig"),
							signal: gate.signal,
						});
						if (outcome !== "applied") {
							failureReasons[internalCustomerId] = "STALE_SUBJECT";
							return;
						}
						removedItems.push(...plan.removedItems);
						insertedItems.push(...plan.insertedItems);
					} catch (error) {
						failureReasons[internalCustomerId] =
							error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
					}
				},
			}),
	});

	return { removedItems, insertedItems, failureReasons };
};
