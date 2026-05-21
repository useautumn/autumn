import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { metrics } from "@opentelemetry/api";
import { z } from "zod/v4";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { setCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
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

const ENTITY_BATCH_SIZE = 10;

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

		const customer = await CusService.get({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: customerId,
		});
		if (!customer) {
			warmSkippedCounter.add(1, { reason: "customer_not_found" });
			logger.warn(
				`warm-full-subject-cache: customer not found id=${customerId}`,
			);
			return { warmed_customer: 0, warmed_entities: 0 };
		}

		const epochKey = buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		});
		const epochRaw = await runRedisOp({
			operation: () => ctx.redisV2.get(epochKey),
			source: "warm-full-subject-cache:read-epoch",
			redisInstance: ctx.redisV2,
		});
		const parsed = epochRaw == null ? 0 : Number.parseInt(String(epochRaw), 10);
		const epoch = Number.isNaN(parsed) ? 0 : parsed;

		let warmedCustomer = 0;
		try {
			const customerSubject = await getFullSubjectNormalized({
				ctx,
				customerId,
			});
			if (customerSubject) {
				const result = await setCachedFullSubject({
					ctx,
					normalized: customerSubject.normalized,
					fetchedSubjectViewEpoch: epoch,
				});
				if (result === "OK") {
					warmCustomerCounter.add(1, { source: source ?? "unknown" });
					warmedCustomer = 1;
				} else {
					warmSkippedCounter.add(1, { reason: result.toLowerCase() });
				}
			} else {
				warmSkippedCounter.add(1, { reason: "no_customer_data" });
			}
		} catch (error) {
			warmFailedCounter.add(1, { reason: "customer_hydrate" });
			logger.warn(
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
					const entitySubject = await getFullSubjectNormalized({
						ctx,
						customerId,
						entityId,
					});
					if (!entitySubject) return false;
					const result = await setCachedFullSubject({
						ctx,
						normalized: entitySubject.normalized,
						fetchedSubjectViewEpoch: epoch,
					});
					return result === "OK";
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
		}

		warmEntityCounter.add(warmedEntities, { source: source ?? "unknown" });
		logger.info(
			`warm-full-subject-cache: customer=${customerId} warmed_customer=${warmedCustomer} warmed_entities=${warmedEntities}/${entities.length} source=${source}`,
		);

		return {
			warmed_customer: warmedCustomer,
			warmed_entities: warmedEntities,
			total_entities: entities.length,
		};
	},
});
