const trimmed = (value: string | undefined): string | undefined =>
	value?.trim() || undefined;

const withHost = ({ url, host }: { url: string; host: string }): string => {
	const parsed = new URL(url);
	if (parsed.hostname === host) return url;
	parsed.hostname = host;
	return parsed.toString();
};

export const resolveDatabaseUrl = ({
	url,
	runtimeEnv,
}: {
	url: string | undefined;
	runtimeEnv: Record<string, string | undefined>;
}): string | undefined => {
	const onEcs = Boolean(runtimeEnv.ECS_CONTAINER_METADATA_URI_V4);
	const privateHost = onEcs
		? trimmed(runtimeEnv.DATABASE_PRIVATE_HOST)
		: undefined;
	const value = trimmed(url);
	return privateHost && value
		? withHost({ url: value, host: privateHost })
		: value;
};

export function createDatabaseEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	const onEcs = Boolean(runtimeEnv.ECS_CONTAINER_METADATA_URI_V4);
	const resolve = (url: string | undefined) =>
		resolveDatabaseUrl({ url, runtimeEnv });
	return {
		DATABASE_PRIVATE_HOST:
			(onEcs && trimmed(runtimeEnv.DATABASE_PRIVATE_HOST)) || null,
		DATABASE_URL: resolve(runtimeEnv.DATABASE_URL),
		DATABASE_CRITICAL_URL: resolve(runtimeEnv.DATABASE_CRITICAL_URL),
		DATABASE_REPLICA_URL: resolve(runtimeEnv.DATABASE_REPLICA_URL),
	};
}

export type DatabaseEnv = ReturnType<typeof createDatabaseEnv>;
