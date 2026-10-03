import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import {
	claimCustomerByEmail,
	claimPartitionProgress,
	commitFlush,
	createPostgresClient,
	getBillingCycleAnchors,
	getCatalogRows,
	getEntitySubjectRows,
	getSubjectRows,
	insertPartitionProgress,
	listPooledBalancesWithoutOtherContributions,
	type PostgresClient,
	type PostgresClientConfig,
	type PostgresLogger,
	readPartitionProgress,
	readSubjectSnapshot,
	sumPooledContributionGrants,
} from "@autumn/postgres";
import {
	type DatabaseTimings,
	timeQuery,
} from "../../logging/databaseTimings.js";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import type { CommitterDb } from "../../types/committerDb.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { SubjectLoadGate } from "./createSubjectLoadGate.js";

export const workerPostgresClientConfig = ({
	env,
}: {
	env: Pick<
		BalanceWorkerEnv,
		"DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
	>;
}): PostgresClientConfig => ({
	databaseUrl: env.DATABASE_URL,
	applicationName: "autumn-balance-worker",
	maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
	connectTimeout: 10,
	idleTimeout: 30,
	// Past the role's 2s statement_timeout plus bouncer queueing: only a connection that went silent waits this long.
	queryTimeout: 5,
});

/** One pool per worker, closed with it; its size counts against the fleet's PgBouncer client budget. */
export const createWorkerPostgresClient = ({
	ctx,
	env,
}: {
	ctx: { logger?: PostgresLogger };
	env: Pick<
		BalanceWorkerEnv,
		"DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
	>;
}): PostgresClient =>
	createPostgresClient({ ctx, config: workerPostgresClientConfig({ env }) });

type WorkerDbContext = {
	postgres: Pick<PostgresClient, "db">;
	subjectLoads: Pick<SubjectLoadGate, "run">;
	timings: Pick<
		DatabaseTimings,
		"queryStarted" | "queryFinished" | "recordSubjectSnapshots"
	>;
};

export const createWorkerDb = ({
	ctx,
}: {
	ctx: WorkerDbContext;
}): WorkerDb => ({
	getSubjectRows: ({ identity, asOfTimestampMs }) =>
		ctx.subjectLoads.run(() =>
			timeQuery({
				ctx,
				kind: "subject_rows",
				run: () =>
					getSubjectRows({
						ctx: {
							db: ctx.postgres.db,
							orgId: identity.orgId,
							env: identity.env,
						},
						customerId: identity.customerId,
						entityId: identity.entityId,
						asOfTimestampMs,
					}),
			}),
		),
	readSubjectSnapshot: ({ identity }) =>
		ctx.subjectLoads.run(async () => {
			const snapshot = await timeQuery({
				ctx,
				kind: "subject_snapshot",
				run: () =>
					readSubjectSnapshot({
						ctx: {
							db: ctx.postgres.db,
							orgId: identity.orgId,
							env: identity.env,
						},
						customerId: identity.customerId,
						entityId: identity.entityId,
						stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
					}),
			});
			ctx.timings.recordSubjectSnapshots(
				snapshot === null ? { misses: 1 } : { hits: 1 },
			);
			return snapshot;
		}),
	getEntitySubjectRows: ({ identity, entityIds, asOfTimestampMs }) =>
		ctx.subjectLoads.run(() =>
			timeQuery({
				ctx,
				kind: "entity_rows",
				run: () =>
					getEntitySubjectRows({
						ctx: {
							db: ctx.postgres.db,
							orgId: identity.orgId,
							env: identity.env,
						},
						customerId: identity.customerId,
						entityIds,
						asOfTimestampMs,
					}),
			}),
		),
	getCatalogRows: ({ identity, ids }) =>
		timeQuery({
			ctx,
			kind: "catalog_rows",
			run: () =>
				getCatalogRows({
					ctx: {
						db: ctx.postgres.db,
						orgId: identity.orgId,
						env: identity.env,
					},
					ids,
				}),
		}),
	getBillingCycleAnchors: ({ identity, customerProductIds }) =>
		timeQuery({
			ctx,
			kind: "billing_anchors",
			run: () =>
				getBillingCycleAnchors({
					ctx: {
						db: ctx.postgres.db,
						orgId: identity.orgId,
						env: identity.env,
					},
					customerProductIds,
				}),
		}),
	claimCustomerByEmail: ({ identity, email }) =>
		timeQuery({
			ctx,
			kind: "claim_customer",
			run: () =>
				claimCustomerByEmail({
					ctx: {
						db: ctx.postgres.db,
						orgId: identity.orgId,
						env: identity.env,
					},
					customerId: identity.customerId,
					email,
				}),
		}),
	sumPooledContributionGrants: ({ pooledBalanceIds, dueBy }) =>
		timeQuery({
			ctx,
			kind: "pooled_balances",
			run: () =>
				sumPooledContributionGrants({
					ctx: { db: ctx.postgres.db },
					pooledBalanceIds,
					dueBy,
				}),
		}),
	listPooledBalancesWithoutOtherContributions: ({
		pooledBalanceIds,
		removedContributionIds,
	}) =>
		timeQuery({
			ctx,
			kind: "pooled_balances",
			run: () =>
				listPooledBalancesWithoutOtherContributions({
					ctx: { db: ctx.postgres.db },
					pooledBalanceIds,
					removedContributionIds,
				}),
		}),
});

/** A flush must be quick or fail: the server cancels it past this, and the committer retries. */
const FLUSH_STATEMENT_TIMEOUT_MS = 2_000;

export const createCommitterDb = ({
	ctx,
}: {
	ctx: Omit<WorkerDbContext, "subjectLoads" | "timings"> & {
		timings: Pick<
			DatabaseTimings,
			"queryStarted" | "queryFinished" | "recordSubjectSnapshots"
		>;
	};
}): CommitterDb => ({
	readPartitionProgress: (params) =>
		timeQuery({
			ctx,
			kind: "partition_progress",
			run: () =>
				readPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
		}),
	insertPartitionProgress: (params) =>
		timeQuery({
			ctx,
			kind: "partition_progress",
			run: () =>
				insertPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
		}),
	claimPartitionProgress: (params) =>
		timeQuery({
			ctx,
			kind: "partition_progress",
			run: () =>
				claimPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
		}),
	flush: async (request) => {
		const result = await timeQuery({
			ctx,
			kind: "flush",
			run: () =>
				commitFlush({
					ctx: { db: ctx.postgres.db, timing: timeFlushSection },
					request,
					statementTimeoutMs: FLUSH_STATEMENT_TIMEOUT_MS,
					roundTrips: "single",
				}),
		});
		const { snapshots } = result;
		// A rolled-back flush answers zero counts: nothing to put on the database line.
		if (snapshots && snapshots.upserted + snapshots.deleted > 0)
			ctx.timings.recordSubjectSnapshots(snapshots);
		return result;
	},
});

/** The flush's synchronous work shows up in the stall sections beside the request path's. */
function timeFlushSection<Value>(label: string, run: () => Value): Value {
	return timeSync({ label }, run);
}
