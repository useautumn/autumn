import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	advancePartitionProgress,
	applySubjectRowUpdates,
	createPostgresClient,
	getCatalogRows,
	getSubjectRows,
	insertPartitionProgress,
	type PostgresClient,
	type PostgresExecutor,
	readNextOffset,
} from "@autumn/postgres";
import type {
	CommitterDb,
	CommitterTransaction,
} from "../../types/committerDb.js";
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
	if (postgresClient) return postgresClient;
	const client = createPostgresClient({
		config: {
			databaseUrl: env.BALANCE_WORKER_DATABASE_URL,
			maxConnections: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
			connectTimeout: 10,
			idleTimeout: 30,
			maxLifetime: 1800,
		},
	});
	// A closed pool must not be handed to the next worker in this process (tests restart workers).
	postgresClient = {
		...client,
		close: async () => {
			postgresClient = undefined;
			await client.close();
		},
	};
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
			entityId: identity.entityId,
			asOfTimestampMs,
		}),
	getCatalogRows: ({ identity, ids }) =>
		getCatalogRows({
			ctx: { db: ctx.postgres.db, orgId: identity.orgId, env: identity.env },
			ids,
		}),
});

const bindCommitterTransaction = ({
	db,
}: {
	db: PostgresExecutor;
}): CommitterTransaction => ({
	applySubjectRowUpdates: ({ updates }) =>
		applySubjectRowUpdates({ ctx: { db }, updates }),
	advancePartitionProgress: (params) =>
		advancePartitionProgress({ ctx: { db }, ...params }),
});

export const createCommitterDb = ({
	ctx,
}: {
	ctx: { postgres: Pick<PostgresClient, "db"> };
}): CommitterDb => ({
	readNextOffset: (params) =>
		readNextOffset({ ctx: { db: ctx.postgres.db }, ...params }),
	insertPartitionProgress: (params) =>
		insertPartitionProgress({ ctx: { db: ctx.postgres.db }, ...params }),
	transaction: (run) =>
		ctx.postgres.db.transaction((tx) =>
			run(bindCommitterTransaction({ db: tx })),
		),
});
