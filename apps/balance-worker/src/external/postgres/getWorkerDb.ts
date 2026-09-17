import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createPostgresClient,
	getCatalogRows,
	getSubjectRows,
	type PostgresClient,
} from "@autumn/postgres";
import type { WorkerDb } from "../../types/workerDb.js";

let postgresClient: PostgresClient | undefined;

/** One pool per process; its size counts against the fleet's PgBouncer client budget. */
export const getPostgresClient = ({
	env,
}: {
	env: Pick<
		BalanceWorkerEnv,
		"BALANCE_WORKER_DATABASE_URL" | "BALANCE_WORKER_DATABASE_POOL_SIZE"
	>;
}): PostgresClient => {
	postgresClient ??= createPostgresClient({
		config: {
			databaseUrl: env.BALANCE_WORKER_DATABASE_URL,
			maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
			connectTimeout: 10,
			idleTimeout: 30,
			maxLifetime: 1800,
		},
	});
	return postgresClient;
};

export const createWorkerDb = ({
	ctx,
}: {
	ctx: { postgres: Pick<PostgresClient, "db"> };
}): WorkerDb => ({
	getSubjectRows: ({ identity, asOfTimestampMs }) =>
		getSubjectRows({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			customerId: identity.customerId,
			asOfTimestampMs,
		}),
	getCatalogRows: ({ identity, ids }) =>
		getCatalogRows({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			ids,
		}),
});
