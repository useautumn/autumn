import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	claimCustomerByEmail,
	commitFlush,
	createPostgresClient,
	getBillingCycleAnchors,
	getCatalogRows,
	getSubjectRows,
	insertPartitionProgress,
	listPooledBalancesWithoutOtherContributions,
	type PostgresClient,
	readPartitionProgress,
	sumPooledContributionGrants,
} from "@autumn/postgres";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import type { CommitterDb } from "../../types/committerDb.js";
import type { WorkerDb } from "../../types/workerDb.js";

/** One pool per worker, closed with it; its size counts against the fleet's PgBouncer client budget. */
export const createWorkerPostgresClient = ({
	env,
}: {
	env: Pick<
		BalanceWorkerEnv,
		"DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
	>;
}): PostgresClient =>
	createPostgresClient({
		config: {
			databaseUrl: env.DATABASE_URL,
			maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
			connectTimeout: 10,
			idleTimeout: 30,
			maxLifetime: 1800,
		},
	});

export const createWorkerDb = ({
	ctx,
}: {
	ctx: { postgres: Pick<PostgresClient, "db"> };
}): WorkerDb => ({
	getSubjectRows: ({ identity, asOfTimestampMs }) =>
		getSubjectRows({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			customerId: identity.customerId,
			entityId: identity.entityId,
			asOfTimestampMs,
		}),
	getCatalogRows: ({ identity, ids }) =>
		getCatalogRows({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			ids,
		}),
	getBillingCycleAnchors: ({ identity, customerProductIds }) =>
		getBillingCycleAnchors({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			customerProductIds,
		}),
	claimCustomerByEmail: ({ identity, email }) =>
		claimCustomerByEmail({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			customerId: identity.customerId,
			email,
		}),
	sumPooledContributionGrants: ({ pooledBalanceIds, dueBy }) =>
		sumPooledContributionGrants({
			ctx: { db: ctx.postgres.db },
			pooledBalanceIds,
			dueBy,
		}),
	listPooledBalancesWithoutOtherContributions: ({
		pooledBalanceIds,
		removedContributionIds,
	}) =>
		listPooledBalancesWithoutOtherContributions({
			ctx: { db: ctx.postgres.db },
			pooledBalanceIds,
			removedContributionIds,
		}),
});

/** A flush must be quick or fail: the server cancels it past this, and the committer retries. */
const FLUSH_STATEMENT_TIMEOUT_MS = 2_000;

export const createCommitterDb = ({
	ctx,
}: {
	ctx: { postgres: Pick<PostgresClient, "db"> };
}): CommitterDb => ({
	readPartitionProgress: (params) =>
		readPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
	insertPartitionProgress: (params) =>
		insertPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
	flush: (request) =>
		commitFlush({
			ctx: { db: ctx.postgres.db, timing: timeFlushSection },
			request,
			statementTimeoutMs: FLUSH_STATEMENT_TIMEOUT_MS,
		}),
});

/** The flush's synchronous work shows up in the stall sections beside the request path's. */
function timeFlushSection<Value>(label: string, run: () => Value): Value {
	return timeSync({ label }, run);
}
