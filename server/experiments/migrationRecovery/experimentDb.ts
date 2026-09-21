import pg from "pg";

let pool: pg.Pool | undefined;

export const getExperimentPool = () => {
	if (process.env.NODE_ENV === "production")
		throw new Error("Development only");
	const databaseUrl = process.env.MIGRATION_RECOVERY_DATABASE_URL;
	if (!databaseUrl) throw new Error("Missing isolated worktree database");
	pool ??= new pg.Pool({
		connectionString: databaseUrl,
		max: 4,
		connectionTimeoutMillis: 5_000,
	});
	return pool;
};

export const experimentRedisUrl = () => {
	const redisUrl = process.env.MIGRATION_RECOVERY_REDIS_URL;
	if (!redisUrl) throw new Error("Missing experiment Redis");
	const url = new URL(redisUrl);
	if (!["localhost", "127.0.0.1"].includes(url.hostname))
		throw new Error("Experiment requires local Redis");
	return redisUrl;
};
