import { AppEnv } from "@autumn/shared";
import { metrics } from "@opentelemetry/api";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const meter = metrics.getMeter("autumn-server");
const warmCustomerCounter = meter.createCounter("autumn.cache.warm.customer", {
	description: "Customer-level FullSubject warms",
});
const warmEntityCounter = meter.createCounter("autumn.cache.warm.entity", {
	description: "Entity-level FullSubject warms",
});
const warmSkippedCounter = meter.createCounter("autumn.cache.warm.skipped", {
	description: "FullSubject warms skipped",
});
const warmFailedCounter = meter.createCounter("autumn.cache.warm.failed", {
	description: "FullSubject warm failures",
});

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	customerId: z.string(),
	source: z.string().optional(),
});

export type WarmFullSubjectCachePayload = z.infer<typeof PayloadSchema>;

const ENTITY_BATCH_SIZE = 25;
const BATCH_PAUSE_MS = 100;

export type WarmFullSubjectResult = {
	warmed_customer: number;
	warmed_entities: number;
	total_entities: number;
};

export const runWarmFullSubjectCache = async ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	source?: string;
}): Promise<WarmFullSubjectResult> => {
	const customer = await CusService.get({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: customerId,
	});
	if (!customer) {
		warmSkippedCounter.add(1, { reason: "customer_not_found" });
		ctx.logger.warn(
			`warm-full-subject-cache: customer not found id=${customerId}`,
		);
		return { warmed_customer: 0, warmed_entities: 0, total_entities: 0 };
	}

	let warmedCustomer = 0;
	try {
		await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: source ?? "warm-full-subject-cache",
		});
		warmCustomerCounter.add(1, { source: source ?? "unknown" });
		warmedCustomer = 1;
	} catch (error) {
		warmFailedCounter.add(1, { reason: "customer_hydrate" });
		ctx.logger.warn(
			`warm-full-subject-cache: customer-level warm failed customer=${customerId} error=${error}`,
		);
	}

	const entities = await EntityService.list({
		db: ctx.db,
		internalCustomerId: customer.internal_id,
		isDeleted: false,
	});

	let warmedEntities = 0;
	for (let i = 0; i < entities.length; i += ENTITY_BATCH_SIZE) {
		const batch = entities.slice(i, i + ENTITY_BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(async (entity) => {
				const entityId = entity.id ?? entity.internal_id;
				if (!entityId) return false;
				await getOrSetCachedFullSubject({
					ctx,
					customerId,
					entityId,
					source: source ?? "warm-full-subject-cache",
				});
				return true;
			}),
		);
		for (const r of results) {
			if (r.status === "fulfilled" && r.value === true) warmedEntities++;
			else if (r.status === "rejected") {
				warmFailedCounter.add(1, { reason: "entity_hydrate" });
			} else {
				warmSkippedCounter.add(1, { reason: "entity_write_skipped" });
			}
		}

		// Pace successive batches so DB+Redis don't see a burst when a
		// customer has many entities.
		if (i + ENTITY_BATCH_SIZE < entities.length) {
			await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
		}
	}

	warmEntityCounter.add(warmedEntities, { source: source ?? "unknown" });
	ctx.logger.info(
		`warm-full-subject-cache: customer=${customerId} warmed_customer=${warmedCustomer} warmed_entities=${warmedEntities}/${entities.length} source=${source}`,
	);

	return {
		warmed_customer: warmedCustomer,
		warmed_entities: warmedEntities,
		total_entities: entities.length,
	};
};

export const warmFullSubjectCacheTask = task({
	id: "warm-full-subject-cache",
	maxDuration: 120,
	run: async (raw: unknown, { ctx: triggerCtx }) => {
		const { orgId, env, customerId, source } = PayloadSchema.parse(raw);

		const { ctx, logger } = await createTriggerContext({
			orgId,
			env,
			triggerCtx,
			customerId,
		});

		await warmupRegionalRedis().catch((error) =>
			logger.warn("warm-full-subject-cache: redis warmup failed", {
				data: { error: error instanceof Error ? error.message : String(error) },
			}),
		);

		return runWarmFullSubjectCache({ ctx, customerId, source });
	},
});
