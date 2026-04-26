import { Pool } from "pg";

const DEFAULT_ENV = "dev";
const DEFAULT_CRITICAL_ROLE = "autumn_critical";
const ROLE_SETTINGS = {
	statement_timeout: "2s",
	lock_timeout: "1s",
	idle_in_transaction_session_timeout: "10s",
};

const quoteIdent = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const getArg = (name: string) => {
	const prefix = `${name}=`;
	const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);

	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
};

type InfisicalSecret = {
	key?: string;
	value?: string;
	secretKey?: string;
	secretValue?: string;
};

const setEnvFromInfisicalExport = (value: unknown) => {
	if (Array.isArray(value)) {
		for (const secret of value as InfisicalSecret[]) {
			const key = secret.key ?? secret.secretKey;
			const secretValue = secret.value ?? secret.secretValue;
			if (key && secretValue) {
				process.env[key] = secretValue;
			}
		}
		return;
	}

	for (const [key, secretValue] of Object.entries(value as Record<string, string>)) {
		process.env[key] = secretValue;
	}
};

const loadInfisicalEnv = (env: string) => {
	const result = Bun.spawnSync([
		"infisical",
		"secrets",
		"--env",
		env,
		"--output",
		"json",
		"--recursive",
		"--silent",
	]);

	if (!result.success) {
		throw new Error(
			`Failed to load Infisical env "${env}": ${result.stderr.toString()}`,
		);
	}

	setEnvFromInfisicalExport(JSON.parse(result.stdout.toString()));
};

const main = async () => {
	const env = getArg("--env") ?? DEFAULT_ENV;
	const criticalRole = getArg("--role") ?? DEFAULT_CRITICAL_ROLE;

	loadInfisicalEnv(env);

	const criticalDatabaseUrl = process.env.DATABASE_V2_CRITICAL_URL;
	if (!criticalDatabaseUrl) {
		throw new Error(`DATABASE_V2_CRITICAL_URL is not set in Infisical env "${env}"`);
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
			console.log("Verified in a new DATABASE_V2_CRITICAL_URL session:");
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
