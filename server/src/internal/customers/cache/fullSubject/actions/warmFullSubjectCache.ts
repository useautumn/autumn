import { metrics } from "@opentelemetry/api";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

const meter = metrics.getMeter("autumn-server");
const warmStartedCounter = meter.createCounter("autumn.cache.warm.started", {
	description: "FullSubject cache warm attempts initiated",
});
const warmCompletedCounter = meter.createCounter(
	"autumn.cache.warm.completed",
	{ description: "FullSubject cache warms that wrote a value" },
);
const warmSkippedCounter = meter.createCounter("autumn.cache.warm.skipped", {
	description:
		"FullSubject cache warms skipped (already running, missing data, etc.)",
});
const warmFailedCounter = meter.createCounter("autumn.cache.warm.failed", {
	description: "FullSubject cache warms that threw",
});

const inflight = new Map<string, Promise<void>>();

const parseAllowlist = (): Set<string> => {
	const raw = process.env.WARM_CACHE_CUSTOMER_IDS ?? "";
	return new Set(
		raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);
};

let allowlist: Set<string> | null = null;
const getAllowlist = (): Set<string> => {
	if (allowlist === null) allowlist = parseAllowlist();
	return allowlist;
};

export const shouldWarmCache = (customerId: string | undefined): boolean => {
	if (!customerId) return false;
	return getAllowlist().has(customerId);
};

const readCurrentEpoch = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number> => {
	const { org, env, redisV2 } = ctx;
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: org.id,
		env,
		customerId,
	});
	const raw = await runRedisOp({
		operation: () => redisV2.get(epochKey),
		source: "warmFullSubjectCache:readEpoch",
		redisInstance: redisV2,
	});
	if (raw === null || raw === undefined) return 0;
	const parsed = Number.parseInt(String(raw), 10);
	return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Eagerly re-populate the customer-level FullSubject cache after invalidation.
 * Fire-and-forget — never blocks the caller, never throws.
 *
 * Gated by `WARM_CACHE_CUSTOMER_IDS` env var to limit blast radius. Uses an
 * in-process single-flight Map so a write burst against the same customer
 * doesn't fan out into N concurrent hydrations. The underlying Lua write
 * is conditional on `fetchedSubjectViewEpoch`, so a racing invalidate is
 * safe: the warm becomes a no-op when its epoch is stale.
 *
 * Scope: customer-level subject only. Entity-level keys are NOT re-warmed
 * (one warm per entity would itself be a storm). Reads for individual
 * entities still hydrate on miss.
 */
export const warmFullSubjectCache = ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string | undefined;
	source?: string;
}): void => {
	if (!shouldWarmCache(customerId)) return;
	const id = customerId as string;
	// Scope single-flight to (org, env, customer) so two orgs sharing an
	// upstream customer id don't suppress each other's warms.
	const inflightKey = `${ctx.org.id}:${ctx.env}:${id}`;

	if (inflight.has(inflightKey)) {
		warmSkippedCounter.add(1, { reason: "already_running" });
		return;
	}

	warmStartedCounter.add(1, { source: source ?? "unknown" });

	const promise = (async () => {
		try {
			const epoch = await readCurrentEpoch({ ctx, customerId: id });
			const normalizedResult = await getFullSubjectNormalized({
				ctx,
				customerId: id,
			});
			if (!normalizedResult) {
				warmSkippedCounter.add(1, { reason: "no_data" });
				return;
			}
			const writeResult = await setCachedFullSubject({
				ctx,
				normalized: normalizedResult.normalized,
				fetchedSubjectViewEpoch: epoch,
			});
			if (writeResult === "OK") {
				warmCompletedCounter.add(1, { source: source ?? "unknown" });
			} else {
				// STALE_WRITE / CACHE_EXISTS / FAILED — Lua bailed; no value written.
				warmSkippedCounter.add(1, { reason: writeResult.toLowerCase() });
			}
		} catch (error) {
			warmFailedCounter.add(1, { source: source ?? "unknown" });
			ctx.logger.warn(
				`[warmFullSubjectCache] customer=${id} source=${source} error=${error}`,
			);
		} finally {
			// Inside the try/catch scope so a throw from the metric or logger
			// above doesn't escape as an unhandled rejection.
			inflight.delete(inflightKey);
		}
	})();

	inflight.set(inflightKey, promise);
};
