import { getHeraldEnv } from "@autumn/env/herald";
import {
	createPostgresClient,
	getPostgresPools,
	type PostgresClient,
} from "@autumn/postgres";
import { getHeraldLogger } from "./getHeraldLogger.js";

let postgres: PostgresClient | undefined;

export function getPostgres(): PostgresClient {
	postgres ??= createPostgresClient({
		ctx: { logger: getHeraldLogger() },
		config: {
			databaseUrl: getHeraldEnv().HERALD_DATABASE_URL,
			...getPostgresPools().herald,
		},
	});
	return postgres;
}
