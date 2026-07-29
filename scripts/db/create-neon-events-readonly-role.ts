// Creates/refreshes the read-only role on the Neon events DB (CI schema validation).
// Usage: bun scripts/db/create-neon-events-readonly-role.ts --env dev|prod [--role name] [--password pw]
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import {
	getArg,
	loadInfisicalEnv,
	quoteIdent,
	quoteLiteral,
} from "./helpers/roleScriptUtils";

const DEFAULT_ENV = "dev";
const DEFAULT_ROLE = "neon_events_readonly";

const main = async () => {
	const env = getArg("--env") ?? DEFAULT_ENV;
	const role = getArg("--role") ?? DEFAULT_ROLE;
	const password = getArg("--password") ?? randomBytes(24).toString("base64url");

	loadInfisicalEnv(env);

	const adminUrl = process.env.NEON_EVENTS_DATABASE_URL;
	if (!adminUrl) {
		throw new Error(
			`NEON_EVENTS_DATABASE_URL is not set in Infisical env "${env}"`,
		);
	}

	const client = new Pool({ connectionString: adminUrl, max: 1 });

	try {
		const existing = await client.query(
			"SELECT 1 FROM pg_roles WHERE rolname = $1",
			[role],
		);

		if (existing.rowCount) {
			await client.query(
				`ALTER ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`,
			);
			console.log(`Role ${role} exists — password rotated.`);
		} else {
			await client.query(
				`CREATE ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`,
			);
			console.log(`Role ${role} created.`);
		}

		const { rows } = await client.query<{ db: string }>(
			"SELECT current_database() AS db",
		);
		const dbName = rows[0].db;

		await client.query(
			`GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(role)}`,
		);
		await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(role)}`);
		await client.query(
			`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdent(role)}`,
		);
		// Future tables (e.g. events created later via db:events:push) stay readable.
		await client.query(
			`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdent(role)}`,
		);
		// Real protection is the ABSENCE of write grants; this default is a soft belt only
		// (session-overridable), which is why verification below flips it off first.
		await client.query(
			`ALTER ROLE ${quoteIdent(role)} SET default_transaction_read_only = on`,
		);
		await client.query(
			`ALTER ROLE ${quoteIdent(role)} SET statement_timeout = '30s'`,
		);

		const readOnlyUrl = new URL(adminUrl);
		readOnlyUrl.username = role;
		readOnlyUrl.password = password;

		const verifyPool = new Pool({
			connectionString: readOnlyUrl.toString(),
			max: 1,
		});

		try {
			// One held connection: the SET below is session-scoped and must apply to the probes.
			const conn = await verifyPool.connect();
			try {
				await conn.query("SELECT 1");
				console.log("Verified: role can connect and read.");

				// Bypass the role default the way a compromised credential would — probes must
				// fail on missing PRIVILEGES, not on the soft read-only default.
				await conn.query("SET default_transaction_read_only = off");

				const canCreate = await conn
					.query("CREATE TABLE _readonly_probe (id int)")
					.then(() => true)
					.catch(() => false);
				if (canCreate) {
					await conn.query("DROP TABLE _readonly_probe");
					throw new Error(`Role ${role} can CREATE TABLE — grants are wrong.`);
				}

				const eventsExists = (
					await conn.query<{ exists: boolean }>(
						"SELECT to_regclass('public.events') IS NOT NULL AS exists",
					)
				).rows[0].exists;
				if (eventsExists) {
					const canInsert = await conn
						.query(
							"INSERT INTO events (id, org_id, org_slug, env, event_name, customer_id) VALUES ('_ro_probe','_ro_probe','','live','_ro_probe','_ro_probe')",
						)
						.then(() => true)
						.catch(() => false);
					if (canInsert) {
						await conn.query("DELETE FROM events WHERE id = '_ro_probe'");
						throw new Error(
							`Role ${role} can INSERT INTO events — grants are wrong.`,
						);
					}
				}
				console.log(
					"Verified: role cannot write (even with read-only default disabled).",
				);
			} finally {
				conn.release();
			}
		} finally {
			await verifyPool.end();
		}

		// Intentional local-only output: this is an operator tool (never CI); printing the
		// URL IS the delivery mechanism for pasting into Infisical / GH secrets.
		console.log(
			`\nRead-only URL for env "${env}" (store as NEON_EVENTS_READ_ONLY_URL in Infisical + GH secret):`,
		);
		console.log(readOnlyUrl.toString());
	} finally {
		await client.end().catch(() => {});
	}
};

await main();
