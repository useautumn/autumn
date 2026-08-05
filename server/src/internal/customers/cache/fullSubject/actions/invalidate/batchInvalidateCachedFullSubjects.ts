import type { AppEnv, Feature } from "@autumn/shared";
import type { Redis } from "ioredis";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { markCustomersUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectOrgEnvKey } from "../../builders/buildFullSubjectOrgEnvKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

const PIPELINE_BATCH_SIZE = 1000;

type BatchInvalidateCustomer = {
	orgId: string;
	env: AppEnv;
	customerId: string;
};

type FeaturesByOrgEnv = Record<string, Feature[]>;

const batchInvalidateCachedFullSubjectsOnRedis = async ({
	customers,
	featuresByOrgEnv,
	redisV2,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	redisV2: Redis;
}): Promise<void> => {
	// No not-ready guard: a dedicated org Redis is created lazily, so its very
	// first use (batch migrations inside a fresh trigger.dev runner) is always
	// mid-handshake. Dropping the unlink there is silent staleness until TTL.
	const invalidatable = customers.filter((customer) => customer.customerId);
	if (invalidatable.length === 0) return;

	for (
		let offset = 0;
		offset < invalidatable.length;
		offset += PIPELINE_BATCH_SIZE
	) {
		const batch = invalidatable.slice(offset, offset + PIPELINE_BATCH_SIZE);
		const readPipeline = redisV2.pipeline();

		for (const { orgId, env, customerId } of batch) {
			const subjectKey = buildFullSubjectKey({ orgId, env, customerId });
			readPipeline.get(subjectKey);
		}

		// Best-effort: an unavailable manifest read falls back to the org's
		// feature list below, never to skipping the invalidation.
		const readResults = await tryRedisOp({
			operation: () => readPipeline.exec(),
			source: "batchInvalidateCachedFullSubjects:manifests",
			redisInstance: redisV2,
		});

		const writePipeline = redisV2.pipeline();

		for (let index = 0; index < batch.length; index++) {
			const customer = batch[index];
			if (!customer) continue;

			const { orgId, env, customerId } = customer;
			const subjectKey = buildFullSubjectKey({ orgId, env, customerId });
			const epochKey = buildFullSubjectViewEpochKey({ orgId, env, customerId });
			const subjectTuple = readResults?.[index];
			const cachedRaw =
				(subjectTuple?.[1] as string | null | undefined) ?? null;

			let featureIds: string[] = [];
			if (cachedRaw) {
				try {
					const manifest = JSON.parse(cachedRaw) as CachedFullSubject;
					featureIds = manifest.meteredFeatures ?? [];
				} catch {
					featureIds = [];
				}
			}

			if (featureIds.length === 0) {
				const orgFeatures =
					featuresByOrgEnv[buildFullSubjectOrgEnvKey({ orgId, env })] ?? [];
				featureIds = orgFeatures.map((feature) => feature.id);
			}

			for (const featureId of new Set(featureIds)) {
				writePipeline.unlink(
					buildSharedFullSubjectBalanceKey({
						orgId,
						env,
						customerId,
						featureId,
					}),
				);
			}

			writePipeline.unlink(subjectKey);
			writePipeline.incr(epochKey);
			writePipeline.expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS);
		}

		// queueIfNotReady: ride out a handshake or reconnect blip rather than
		// dropping the invalidation — same contract as the single-subject path.
		await tryRedisOp({
			operation: () => writePipeline.exec(),
			source: "batchInvalidateCachedFullSubjects:invalidate",
			redisInstance: redisV2,
			queueIfNotReady: true,
		});
	}
};

export const batchInvalidateCachedFullSubjects = async ({
	customers,
	featuresByOrgEnv,
	getRedisTargetsForCustomer,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	getRedisTargetsForCustomer: ({
		customer,
	}: {
		customer: BatchInvalidateCustomer;
	}) => Redis[];
}): Promise<number> => {
	if (customers.length === 0) return 0;

	// Chokepoint freshness marks — a pure DB write, never gated on Redis state.
	await markCustomersUpdatedAt({ customers });

	const customersByRedis = new Map<Redis, BatchInvalidateCustomer[]>();
	for (const customer of customers) {
		for (const targetRedis of new Set(
			getRedisTargetsForCustomer({ customer }),
		)) {
			const existing = customersByRedis.get(targetRedis) ?? [];
			existing.push(customer);
			customersByRedis.set(targetRedis, existing);
		}
	}

	await Promise.all(
		[...customersByRedis.entries()].map(([targetRedis, redisCustomers]) =>
			batchInvalidateCachedFullSubjectsOnRedis({
				customers: redisCustomers,
				featuresByOrgEnv,
				redisV2: targetRedis,
			}),
		),
	);

	return customers.length;
};
