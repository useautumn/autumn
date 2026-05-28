import { metrics } from "@opentelemetry/api";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { warmFullSubjectCacheTask } from "@/trigger/cache/warmFullSubjectCacheTask.js";

const meter = metrics.getMeter("autumn-server");
const warmEnqueuedCounter = meter.createCounter("autumn.cache.warm.enqueued", {
	description: "FullSubject cache warm enqueues",
});
const warmEnqueueFailedCounter = meter.createCounter(
	"autumn.cache.warm.enqueue_failed",
	{ description: "FullSubject cache warm enqueue failures" },
);

const WARM_CACHE_CUSTOMER_IDS = new Set<string>([
	"64138004cce3c9e82a7083d9",
	"698fb72e4c5fa12c1cd11ddc",
	"cache-warmer-feature-test-cus",
]);

export const shouldWarmCache = (customerId: string | undefined): boolean => {
	if (!customerId) return false;
	return WARM_CACHE_CUSTOMER_IDS.has(customerId);
};

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

	void warmFullSubjectCacheTask
		.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: id,
				source,
			},
			{
				concurrencyKey: `${ctx.org.id}:${ctx.env}:${id}`,
			},
		)
		.then(() => {
			warmEnqueuedCounter.add(1, { source: source ?? "unknown" });
		})
		.catch((error) => {
			warmEnqueueFailedCounter.add(1, { source: source ?? "unknown" });
			ctx.logger.warn(
				`[warmFullSubjectCache] enqueue failed customer=${id} source=${source} error=${error}`,
			);
		});
};
