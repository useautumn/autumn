/**
 * Pure REST fetcher for Infisical secrets. Used at trigger.dev DEPLOY
 * time via `syncEnvVars` to push secrets to the cloud env. Kept SDK-free
 * so trigger.config.ts can import it without bloating the build.
 *
 * Runtime code uses `initInfisical` (SDK-based, populates process.env).
 */

export type InfisicalSyncEnvVar = { name: string; value: string };

export type FetchInfisicalSecretsArgs = {
	clientId?: string | null;
	clientSecret?: string | null;
	projectId?: string | null;
	/** Defaults to "prod" if not set. */
	environment?: string | null;
	secretPath?: string;
	recursive?: boolean;
	includeImports?: boolean;
};

/**
 * Authenticate via Universal Auth, fetch secrets at the given path, and
 * return them as `{ name, value }[]`. Imported groups are flattened in
 * after primary secrets, with first-write-wins de-duplication.
 */
export const fetchInfisicalSecrets = async ({
	clientId,
	clientSecret,
	projectId,
	environment,
	secretPath = "/",
	recursive = true,
	includeImports = true,
}: FetchInfisicalSecretsArgs): Promise<InfisicalSyncEnvVar[]> => {
	const env = environment ?? "prod";

	if (!clientId || !clientSecret || !projectId) {
		throw new Error(
			"Missing Infisical credentials. Set INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID.",
		);
	}

	const authRes = await fetch(
		"https://app.infisical.com/api/v1/auth/universal-auth/login",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ clientId, clientSecret }),
		},
	);
	if (!authRes.ok)
		throw new Error(
			`Infisical auth failed: ${authRes.status} ${await authRes.text()}`,
		);
	const { accessToken } = (await authRes.json()) as { accessToken: string };

	const params = new URLSearchParams({
		environment: env,
		workspaceId: projectId,
		secretPath,
		recursive: String(recursive),
		includeImports: String(includeImports),
	});
	const secretsRes = await fetch(
		`https://app.infisical.com/api/v3/secrets/raw?${params}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);
	if (!secretsRes.ok)
		throw new Error(
			`Infisical secrets failed: ${secretsRes.status} ${await secretsRes.text()}`,
		);
	const data = (await secretsRes.json()) as {
		secrets: Array<{ secretKey: string; secretValue: string }>;
		imports?: Array<{
			secrets: Array<{ secretKey: string; secretValue: string }>;
		}>;
	};

	const envVars: InfisicalSyncEnvVar[] = [];
	const seen = new Set<string>();

	const push = (key: string, value: string) => {
		if (!key || !value || seen.has(key)) return;
		envVars.push({ name: key, value });
		seen.add(key);
	};

	for (const secret of data.secrets) push(secret.secretKey, secret.secretValue);
	for (const importGroup of data.imports ?? [])
		for (const secret of importGroup.secrets)
			push(secret.secretKey, secret.secretValue);

	console.log(
		`[fetchInfisicalSecrets] Synced ${envVars.length} secrets from Infisical (env=${env}, path=${secretPath})`,
	);
	return envVars;
};

/**
 * Read the four credential vars (`INFISICAL_CLIENT_ID`, `_SECRET`,
 * `_PROJECT_ID`, `_ENVIRONMENT`) from the local process env first then
 * trigger.dev's deploy-time `ctx.env`. Convenience for `syncEnvVars`.
 */
export const fetchInfisicalSecretsFromEnv = (
	ctxEnv: Record<string, string | undefined> = {},
): Promise<InfisicalSyncEnvVar[]> =>
	fetchInfisicalSecrets({
		clientId: process.env.INFISICAL_CLIENT_ID ?? ctxEnv.INFISICAL_CLIENT_ID,
		clientSecret:
			process.env.INFISICAL_CLIENT_SECRET ?? ctxEnv.INFISICAL_CLIENT_SECRET,
		projectId: process.env.INFISICAL_PROJECT_ID ?? ctxEnv.INFISICAL_PROJECT_ID,
		environment:
			process.env.INFISICAL_ENVIRONMENT ?? ctxEnv.INFISICAL_ENVIRONMENT,
	});
