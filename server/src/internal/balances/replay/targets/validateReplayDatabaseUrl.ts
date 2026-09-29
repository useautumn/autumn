import {
	REPLAY_DATABASE_ALLOWED_QUERY_KEYS,
	REPLAY_DATABASE_ROUTING_QUERY_KEYS,
	REPLAY_DATABASE_SUPPORTED_SCHEMES,
	REPLAY_STAGING_DEFAULT_DATABASE_PORT,
	type ReplayStagingDatabasePolicy,
	type ReplayStagingDatabaseTarget,
	ReplayStagingTargetError,
} from "./replayStagingTargetContracts.js";

const MULTI_HOST_SEPARATOR = ",";
const MINIMUM_TCP_PORT = 1;
const MAXIMUM_TCP_PORT = 65_535;

const parseDatabaseUrl = ({ databaseUrl }: { databaseUrl: string }): URL => {
	try {
		return new URL(databaseUrl);
	} catch {
		throw new ReplayStagingTargetError({
			message: "replay database url is not a parsable connection url",
		});
	}
};

const assertSupportedScheme = ({ url }: { url: URL }): void => {
	if (!REPLAY_DATABASE_SUPPORTED_SCHEMES.has(url.protocol)) {
		throw new ReplayStagingTargetError({
			message: `replay database url scheme "${url.protocol.replace(":", "")}" is not a supported postgres scheme`,
		});
	}
};

const assertSingleTcpHost = ({ url }: { url: URL }): void => {
	if (url.hostname.length === 0) {
		throw new ReplayStagingTargetError({
			message: "replay database url must address a single tcp host",
		});
	}
	if (url.hostname.includes(MULTI_HOST_SEPARATOR)) {
		throw new ReplayStagingTargetError({
			message: "replay database url must not list multiple hosts",
		});
	}
};

const assertDatabaseUser = ({ url }: { url: URL }): void => {
	if (url.username.length === 0) {
		throw new ReplayStagingTargetError({
			message: "replay database url must supply a database user",
		});
	}
};

const assertSupportedQueryParameters = ({ url }: { url: URL }): void => {
	for (const key of url.searchParams.keys()) {
		const normalizedKey = key.toLowerCase();
		if (REPLAY_DATABASE_ROUTING_QUERY_KEYS.has(normalizedKey)) {
			throw new ReplayStagingTargetError({
				message: `replay database url carries the routing override query parameter "${normalizedKey}"`,
			});
		}
		if (!REPLAY_DATABASE_ALLOWED_QUERY_KEYS.has(key)) {
			throw new ReplayStagingTargetError({
				message: `replay database url carries an unsupported query parameter "${key}"`,
			});
		}
	}
};

const assertNoUrlFragment = ({ url }: { url: URL }): void => {
	if (url.hash.length > 0) {
		throw new ReplayStagingTargetError({
			message: "replay database url must not carry a fragment",
		});
	}
};

const decodeDatabaseSegment = ({ segment }: { segment: string }): string => {
	try {
		return decodeURIComponent(segment);
	} catch {
		throw new ReplayStagingTargetError({
			message: "replay database url has an undecodable database path",
		});
	}
};

const resolveDatabaseName = ({ url }: { url: URL }): string => {
	const path = url.pathname.startsWith("/")
		? url.pathname.slice(1)
		: url.pathname;
	const segments = path.split("/");
	if (segments.length !== 1 || segments[0].length === 0) {
		throw new ReplayStagingTargetError({
			message: "replay database url must address exactly one database",
		});
	}
	return decodeDatabaseSegment({ segment: segments[0] });
};

const resolveDatabasePort = ({ url }: { url: URL }): number => {
	if (url.port.length === 0) {
		return REPLAY_STAGING_DEFAULT_DATABASE_PORT;
	}
	const port = Number(url.port);
	const isUsablePort =
		Number.isInteger(port) &&
		port >= MINIMUM_TCP_PORT &&
		port <= MAXIMUM_TCP_PORT;
	if (!isUsablePort) {
		throw new ReplayStagingTargetError({
			message: "replay database url carries an invalid tcp port",
		});
	}
	return port;
};

const assertMatchesDatabasePolicy = ({
	resolved,
	policy,
}: {
	resolved: ReplayStagingDatabaseTarget;
	policy: ReplayStagingDatabasePolicy;
}): void => {
	if (resolved.hostname !== policy.hostname.toLowerCase()) {
		throw new ReplayStagingTargetError({
			message: `replay database host "${resolved.hostname}" is not the trusted replay database host`,
		});
	}
	if (resolved.port !== policy.port) {
		throw new ReplayStagingTargetError({
			message: `replay database port ${resolved.port} is not the trusted replay database port ${policy.port}`,
		});
	}
	if (resolved.database !== policy.database) {
		throw new ReplayStagingTargetError({
			message: `replay database "${resolved.database}" is not the trusted replay database "${policy.database}"`,
		});
	}
};

export const validateReplayDatabaseUrl = ({
	databaseUrl,
	policy,
}: {
	databaseUrl: string;
	policy: ReplayStagingDatabasePolicy;
}): ReplayStagingDatabaseTarget => {
	const url = parseDatabaseUrl({ databaseUrl });
	assertSupportedScheme({ url });
	assertSingleTcpHost({ url });
	assertDatabaseUser({ url });
	assertSupportedQueryParameters({ url });
	assertNoUrlFragment({ url });
	const resolved = Object.freeze({
		hostname: url.hostname.toLowerCase(),
		port: resolveDatabasePort({ url }),
		database: resolveDatabaseName({ url }),
	});
	assertMatchesDatabasePolicy({ resolved, policy });
	return resolved;
};
