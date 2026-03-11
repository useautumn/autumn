import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const isPostgresProtocol = ({ protocol }: { protocol: string }) =>
	protocol === "postgresql:" || protocol === "postgres:";

const isLocalHost = ({ host }: { host: string }) =>
	LOCAL_HOSTS.has(host.toLowerCase());

const getDbName = ({ url }: { url: URL }) => {
	const dbName = decodeURIComponent(url.pathname).replace(/^\/+/, "");
	return dbName;
};

const escapeIdentifier = ({ value }: { value: string }) =>
	`"${value.replaceAll('"', '""')}"`;

const buildAdminUrl = ({ rawUrl }: { rawUrl: string }) => {
	const adminUrl = new URL(rawUrl);
	adminUrl.pathname = "/postgres";
	return adminUrl.toString();
};

const ensureDatabaseExists = async ({ rawUrl }: { rawUrl: string }) => {
	const parsedUrl = new URL(rawUrl);

	if (!isPostgresProtocol({ protocol: parsedUrl.protocol })) {
		throw new Error("DATABASE_URL must use postgres:// or postgresql://");
	}

	if (!isLocalHost({ host: parsedUrl.hostname })) {
		console.log(
			`Skipping database creation for non-local host "${parsedUrl.hostname}"`,
		);
		return;
	}

	const dbName = getDbName({ url: parsedUrl });
	if (!dbName) {
		throw new Error("DATABASE_URL must include a database name");
	}

	const sql = postgres(buildAdminUrl({ rawUrl }), {
		max: 1,
		connect_timeout: 10,
		idle_timeout: 5,
	});

	try {
		const [result] = await sql<{ exists: boolean }[]>`
			SELECT EXISTS(
				SELECT 1 FROM pg_database WHERE datname = ${dbName}
			) AS exists
		`;

		if (result?.exists) {
			console.log(`Database "${dbName}" already exists`);
			return;
		}

		await sql.unsafe(`CREATE DATABASE ${escapeIdentifier({ value: dbName })}`);
		console.log(`Created database "${dbName}"`);
	} finally {
		await sql.end();
	}
};

const main = async () => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	await ensureDatabaseExists({ rawUrl: databaseUrl });
};

main().catch((error: unknown) => {
	const code =
		typeof error === "object" && error
			? (error as { code?: string }).code
			: undefined;
	if (code === "ECONNREFUSED") {
		console.error(
			"Could not connect to local Postgres. Start your DB first, then run bun db:init again.",
		);
		process.exit(1);
	}

	if (error instanceof Error) {
		console.error(error.message);
		process.exit(1);
	}

	console.error("Database initialization failed:", error);
});
