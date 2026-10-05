import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
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
	readPartitionProgress,
	sumPooledContributionGrants,
} from "@autumn/postgres";
import {
	type DatabaseTimings,
	errorCodeOf,
	timeQuery,
} from "../../logging/databaseTimings.js";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import type { CommitterDb } from "../../types/committerDb.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { SubjectLoadGate } from "./createSubjectLoadGate.js";

/** Staging diagnostic: 0 never reaps an idle connection, so a burst never waits on a fresh TLS connect. */
const WORKER_POOL_IDLE_TIMEOUT_SECONDS = 0;

type WorkerPoolEnv = Pick<
	BalanceWorkerEnv,
	"DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
>;

type ConnectionLogContext = {
	logger?: Pick<AutumnLogger, "info">;
	timings: Pick<DatabaseTimings, "connectionOpened" | "connectionClosed">;
};

export const workerPostgresClientConfig = ({
	env,
}: {
	env: WorkerPoolEnv;
}): PostgresClientConfig => ({
	databaseUrl: env.DATABASE_URL,
	maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
	connectTimeout: 10,
	idleTimeout: WORKER_POOL_IDLE_TIMEOUT_SECONDS,
});

/** One pool per worker, closed with it; its size counts against the fleet's PgBouncer client budget. */
export const createWorkerPostgresClient = ({
	ctx,
	env,
}: {
	ctx: ConnectionLogContext;
	env: WorkerPoolEnv;
}): PostgresClient =>
	createPostgresClient({
		config: {
			...workerPostgresClientConfig({ env }),
			onConnect: () => logConnectionChange({ ctx, change: "opened" }),
			onClose: (cause) => logConnectionChange({ ctx, change: "closed", cause }),
		},
	});

/** Bun reports a connect only once it finishes, so a runtime connect logs its completion, not its start. */
function logConnectionChange({
	ctx,
	change,
	cause = null,
}: {
	ctx: ConnectionLogContext;
	change: "opened" | "closed";
	cause?: Error | null;
}): void {
	if (change === "opened") ctx.timings.connectionOpened();
	else ctx.timings.connectionClosed({ cause });
	ctx.logger?.info(
		{
			event: "balance_worker.postgres_connection",
			data: {
				change,
				code: cause === null ? undefined : errorCodeOf({ cause }),
			},
		},
		`Balance worker Postgres connection ${change}`,
	);
}

/** Staging diagnostic: opens every pool connection before the worker takes traffic, timing each connect. */
export async function prefillWorkerPool({
	ctx,
	size,
}: {
	ctx: {
		postgres: Pick<PostgresClient, "client">;
		logger?: Pick<AutumnLogger, "info">;
	};
	size: number;
}): Promise<void> {
	const startedAt = performance.now();
	const connects = await Promise.allSettled(
		Array.from({ length: size }, async () => {
			const connectStartedAt = performance.now();
			const connection = await ctx.postgres.client.reserve();
			return { connection, durationMs: performance.now() - connectStartedAt };
		}),
	);
	const opened = connects.flatMap((connect) =>
		connect.status === "fulfilled" ? [connect.value] : [],
	);
	for (const { connection } of opened) connection.release();
	ctx.logger?.info(
		{
			event: "balance_worker.postgres_prefill",
			data: {
				size,
				opened: opened.length,
				failed: connects.length - opened.length,
				totalMs: Math.round(performance.now() - startedAt),
				connectMs: opened
					.map(({ durationMs }) => Math.round(durationMs))
					.sort((a, b) => a - b),
			},
		},
		"Balance worker Postgres prefill",
	);
}

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
					roundTrips: "single",
				}),
		}),
});

/** The flush's synchronous work shows up in the stall sections beside the request path's. */
function timeFlushSection<Value>(label: string, run: () => Value): Value {
	return timeSync({ label }, run);
}
