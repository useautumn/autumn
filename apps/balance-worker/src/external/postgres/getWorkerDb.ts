import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	claimCustomerByEmail,
	claimPartitionProgress,
	commitFlush,
	createPostgresClient,
	getBillingCycleAnchors,
	getCatalogRows,
	getSubjectRows,
	insertPartitionProgress,
	listPooledBalancesWithoutOtherContributions,
	type PostgresClient,
	type PostgresClientConfig,
	readPartitionProgress,
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
	maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
	connectTimeout: 10,
	idleTimeout: 30,
});

/** One pool per worker, closed with it; its size counts against the fleet's PgBouncer client budget. */
export const createWorkerPostgresClient = ({
	env,
}: {
	env: Pick<
		BalanceWorkerEnv,
		"DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
	>;
}): PostgresClient =>
	createPostgresClient({ config: workerPostgresClientConfig({ env }) });

type WorkerDbContext = {
	postgres: Pick<PostgresClient, "db">;
	subjectLoads: Pick<SubjectLoadGate, "run">;
	timings: Pick<DatabaseTimings, "queryStarted" | "queryFinished">;
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
	ctx: Omit<WorkerDbContext, "subjectLoads">;
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
	flush: (request) =>
		timeQuery({
			ctx,
			kind: "flush",
			run: () =>
				commitFlush({
					ctx: { db: ctx.postgres.db, timing: timeFlushSection },
					request,
					statementTimeoutMs: FLUSH_STATEMENT_TIMEOUT_MS,
				}),
		}),
});

/** The flush's synchronous work shows up in the stall sections beside the request path's. */
function timeFlushSection<Value>(label: string, run: () => Value): Value {
	return timeSync({ label }, run);
}
