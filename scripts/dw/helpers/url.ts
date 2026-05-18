export function forceSslVerifyFull(url: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set("sslmode", "verify-full");
		return u.toString();
	} catch {
		return url;
	}
}

export function rewriteDbEnv(
	env: Record<string, string>,
	branchUrl: string,
): Record<string, string> {
	const out = { ...env };
	const dbUrl = forceSslVerifyFull(branchUrl);
	out.DATABASE_URL = dbUrl;
	out.DATABASE_CRITICAL_URL = dbUrl;
	// Replica URL stays unset for agent branches (read from primary).
	delete out.DATABASE_REPLICA_URL;
	return out;
}
