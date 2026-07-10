import { Pool } from "pg";
import {
	getArg,
	loadInfisicalEnv,
	quoteIdent,
	quoteLiteral,
} from "./helpers/roleScriptUtils";

const DEFAULT_ENV = "dev";
const DEFAULT_CRITICAL_ROLE = "autumn_critical";
const ROLE_SETTINGS = {
	statement_timeout: "2s",
	lock_timeout: "1s",
	idle_in_transaction_session_timeout: "10s",
};

const main = async () => {
	const env = getArg("--env") ?? DEFAULT_ENV;
	const criticalRole = getArg("--role") ?? DEFAULT_CRITICAL_ROLE;

	loadInfisicalEnv(env);

	const criticalDatabaseUrl = process.env.DATABASE_CRITICAL_URL;
	if (!criticalDatabaseUrl) {
		throw new Error(
			`DATABASE_CRITICAL_URL is not set in Infisical env "${env}"`,
		);
	}

	const client = new Pool({
		connectionString: criticalDatabaseUrl,
		max: 1,
	});

	try {
		for (const [key, value] of Object.entries(ROLE_SETTINGS)) {
			await client.query(
				`ALTER ROLE ${quoteIdent(criticalRole)} SET ${key} = ${quoteLiteral(
					value,
				)}`,
			);
		}

		const result = await client.query<{ rolconfig: string[] | null }>(
			"SELECT rolconfig FROM pg_roles WHERE rolname = $1",
			[criticalRole],
		);

		console.log(`Updated ${criticalRole} in ${env}:`);
		console.log(result.rows[0]?.rolconfig ?? []);

		await client.end();

		const verifyClient = new Pool({
			connectionString: criticalDatabaseUrl,
			max: 1,
		});

		try {
			console.log("Verified in a new DATABASE_CRITICAL_URL session:");
			for (const key of Object.keys(ROLE_SETTINGS)) {
				const verifyResult = await verifyClient.query<Record<string, string>>(
					`SHOW ${key}`,
				);
				console.log(`${key}=${verifyResult.rows[0]?.[key]}`);
			}
		} finally {
			await verifyClient.end();
		}

		console.log("Restart app connections for existing pools to pick this up.");
	} finally {
		await client.end().catch(() => {});
	}
};

await main();
