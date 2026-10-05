const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

/** These fault tests create and drop scratch tables, so they only ever run
 * against a loopback PostgreSQL (MIGRATION_TEST_DATABASE_URL, else DATABASE_URL). */
export const loopbackDatabaseUrl = (): string | undefined => {
	const url =
		process.env.MIGRATION_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
	if (!url) return undefined;
	return LOOPBACK_HOSTS.includes(new URL(url).hostname) ? url : undefined;
};
