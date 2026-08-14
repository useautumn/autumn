import { ceBalancesCache } from "@autumn/shared";
import {
	type DuckDBDatabase,
	drizzle,
	isPool,
} from "@duckdbfan/drizzle-duckdb";
import { logger } from "../logtail/logtailUtils.js";
import { registerMdPool, startMdPoolMonitor } from "./mdPoolMonitor.js";

const mdSchema = { ceBalancesCache };

export type MotherDuckDb = DuckDBDatabase<typeof mdSchema>;

const DEFAULT_POOL_SIZE = 4;
const DEFAULT_DATABASE = "lake_cache";
/** Shed to the caller's unavailable-path instead of queueing behind a
 * saturated pool — a lesson from the PgBouncer era. */
const ACQUIRE_TIMEOUT_MS = 2_000;
const MAX_WAITING_REQUESTS = 50;
/** Also the backstop that reaps connections whose query outlived the
 * wall-clock race in `runMdWithTimeout` (node-api has no clean interrupt). */
const CONNECTION_MAX_LIFETIME_MS = 10 * 60_000;
const IDLE_TIMEOUT_MS = 60_000;

export const MOTHERDUCK_QUERY_TIMEOUT_MS = 5_000;

const poolSizeFromEnv = (): number => {
	const parsed = Number(process.env.MOTHERDUCK_POOL_MAX);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_SIZE;
};

/** MotherDuck meters concurrent queries account-wide; DuckDB runs one query
 * per pooled connection, so fleet ceiling = processes x pool size. */
const MD_ACCOUNT_CONCURRENCY_CEILING = Number(
	process.env.MOTHERDUCK_MAX_CONCURRENT ?? 32,
);

export const computeMotherDuckPoolWarning = ({
	poolSize,
	fleetProcesses,
}: {
	poolSize: number;
	fleetProcesses: number;
}): string | null => {
	const fleetConnections = fleetProcesses * poolSize;
	if (fleetConnections <= MD_ACCOUNT_CONCURRENCY_CEILING) return null;
	return `[initMotherDuck] potential fleet concurrency (${fleetConnections}) exceeds MOTHERDUCK_MAX_CONCURRENT (${MD_ACCOUNT_CONCURRENCY_CEILING}) — pools are lazy so this only bites if every process serves balance sorts; lower MOTHERDUCK_POOL_MAX or raise the ceiling to match the MotherDuck plan.`;
};

export const initMotherDuck = async ({
	token,
	poolSize = poolSizeFromEnv(),
	database = DEFAULT_DATABASE,
}: {
	token: string;
	poolSize?: number;
	database?: string;
}): Promise<MotherDuckDb> => {
	// attach_mode=single skips attaching the rest of the workspace (cuts cold
	// start); the TTL keeps the cached instance reusable across idle gaps.
	// No session_name on purpose: unnamed connections spread across read
	// replicas; a shared name would pin the whole pool to one duckling.
	return await drizzle({
		connection: {
			path: `md:${database}?attach_mode=single&dbinstance_inactivity_ttl=1h`,
			options: { motherduck_token: token },
		},
		pool: {
			size: poolSize,
			acquireTimeout: ACQUIRE_TIMEOUT_MS,
			maxWaitingRequests: MAX_WAITING_REQUESTS,
			maxLifetimeMs: CONNECTION_MAX_LIFETIME_MS,
			idleTimeoutMs: IDLE_TIMEOUT_MS,
		},
		schema: mdSchema,
	});
};

/** Lake-backed sorts/filters (feature_balance, balance > x) are unavailable
 * without a token — dev/staging without MotherDuck keeps every PG-only sort. */
export const isMotherDuckConfigured = (): boolean =>
	Boolean(process.env.MOTHERDUCK_TOKEN);

let resolverDbPromise: Promise<MotherDuckDb> | null = null;

/** Lazy pooled singleton on the read-only token: only processes that actually
 * serve balance sorts open MotherDuck connections. */
export const getMotherDuckResolverDb = (): Promise<MotherDuckDb> => {
	const token = process.env.MOTHERDUCK_TOKEN;
	if (!token) {
		return Promise.reject(
			new Error("[initMotherDuck] MOTHERDUCK_TOKEN is not configured"),
		);
	}

	if (!resolverDbPromise) {
		const poolSize = poolSizeFromEnv();
		const warning = computeMotherDuckPoolWarning({
			poolSize,
			fleetProcesses: Number(process.env.MOTHERDUCK_FLEET_PROCESSES ?? 20),
		});
		if (warning) logger.warn(warning);

		resolverDbPromise = initMotherDuck({ token, poolSize })
			.then((db) => {
				if (isPool(db.$client)) {
					registerMdPool({
						pool: db.$client,
						name: "md-resolver",
						max: poolSize,
					});
					startMdPoolMonitor();
				}
				return db;
			})
			.catch((error) => {
				// Failed init must not poison the singleton — next request retries.
				resolverDbPromise = null;
				throw error;
			});
	}
	return resolverDbPromise;
};

export const closeMotherDuckResolverDb = async (): Promise<void> => {
	const pending = resolverDbPromise;
	resolverDbPromise = null;
	if (!pending) return;
	const db = await pending.catch(() => null);
	await db?.close();
};

/** One-shot RW session for the cache refresh cron: single connection,
 * created per run and always closed — the writer holds no standing pool. */
export const withMotherDuckRw = async <T>({
	run,
	database = DEFAULT_DATABASE,
}: {
	run: (db: MotherDuckDb) => Promise<T>;
	database?: string;
}): Promise<T> => {
	const token = process.env.MOTHERDUCK_RW_TOKEN;
	if (!token) {
		throw new Error("[initMotherDuck] MOTHERDUCK_RW_TOKEN is not configured");
	}

	const db = await initMotherDuck({ token, poolSize: 1, database });
	try {
		return await run(db);
	} finally {
		await db.close();
	}
};

/** Wall-clock guard for resolver queries: node-api can't interrupt a running
 * query, so a loser keeps its connection busy until maxLifetime reaps it. */
export const runMdWithTimeout = async <T>({
	run,
	timeoutMs = MOTHERDUCK_QUERY_TIMEOUT_MS,
	label,
}: {
	run: () => Promise<T>;
	timeoutMs?: number;
	label: string;
}): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error(`[motherduck] ${label} exceeded ${timeoutMs}ms timeout`),
				),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([run(), timeout]);
	} finally {
		clearTimeout(timer);
	}
};
