import { metrics } from "@opentelemetry/api";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
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
	description: "FullSubject cache warms that threw or failed to write",
});

const inflight = new Map<string, Promise<void>>();

const WARM_CACHE_CUSTOMER_IDS = new Set<string>([
	"64138004cce3c9e82a7083d9",
]);

export const shouldWarmCache = (customerId: string | undefined): boolean => {
	if (!customerId) return false;
	return WARM_CACHE_CUSTOMER_IDS.has(customerId);
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

export const warmFullSubjectCache = ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string | undefined;
	source?: string;
}): Promise<void> | undefined => {
	if (!shouldWarmCache(customerId)) return undefined;
	const id = customerId as string;
	const inflightKey = `${ctx.org.id}:${ctx.env}:${id}`;

	const existingPromise = inflight.get(inflightKey);
	if (existingPromise) {
		warmSkippedCounter.add(1, { reason: "already_running" });
		return existingPromise;
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
			} else if (writeResult === "FAILED") {
				warmFailedCounter.add(1, {
					source: source ?? "unknown",
					reason: "write_failed",
				});
				ctx.logger.error(
					`[warmFullSubjectCache] Cache warm write FAILED for customer=${id} source=${source}`,
				);
			} else {
				warmSkippedCounter.add(1, { reason: writeResult.toLowerCase() });
			}
		} catch (error) {
			warmFailedCounter.add(1, {
				source: source ?? "unknown",
				reason: "exception",
			});
			ctx.logger.warn(
				`[warmFullSubjectCache] customer=${id} source=${source} error=${error}`,
			);
		} finally {
			inflight.delete(inflightKey);
		}
	})();

	inflight.set(inflightKey, promise);
	return promise;
};
