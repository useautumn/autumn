import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

export const initDrizzle = (params?: {
	maxConnections?: number;
	replica?: boolean;
}) => {
	const maxConnections = params?.maxConnections || 10;
	const dbUrl =
		(params?.replica
			? process.env.DATABASE_REPLICA_URL
			: process.env.DATABASE_URL) ?? "";
	const client = postgres(dbUrl, {
		max: maxConnections,
	});

	const dbMain = drizzle(client, {
		schema,
	});

	// if (process.env.DATABASE_REPLICA_URL !== undefined) {
	// 	const clientReplica = postgres(process.env.DATABASE_REPLICA_URL, {
	// 		max: maxConnections,
	// 	});

	// 	const dbReplica = drizzle(clientReplica, {
	// 		schema,
	// 	});

	// 	const db = withReplicas(dbMain, [dbMain, dbReplica], (replicas) => {
	// 		const probabilityWeights = [0.7, 0.3];
	// 		let cumulativeProbability = 0;
	// 		const randomValue = Math.random();

	// 		for (const [index, replica] of replicas.entries()) {
	// 			cumulativeProbability += probabilityWeights[index] ?? 0;
	// 			if (randomValue < cumulativeProbability) {
	// 				return replica;
	// 			}
	// 		}
	// 		return replicas[1] ?? replicas[0]!;
	// 	});

	// 	return { db, client, clientReplica };
	// }

	return { db: dbMain, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
