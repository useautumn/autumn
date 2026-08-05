import type { AppEnv, Feature } from "@autumn/shared";
import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { markCustomersUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { timeout } from "@/utils/genUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectOrgEnvKey } from "../../builders/buildFullSubjectOrgEnvKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

const PIPELINE_BATCH_SIZE = 1000;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2000;

type BatchInvalidateCustomer = {
	orgId: string;
	env: AppEnv;
	customerId: string;
};

type FeaturesByOrgEnv = Record<string, Feature[]>;

/** Keys one subject's invalidation must touch, resolved before any write so a
 *  retry replays the same set without re-reading the manifest. */
type SubjectInvalidation = {
	subjectKey: string;
	epochKey: string;
	balanceKeys: string[];
};

const resolveSubjectInvalidations = ({
	batch,
	manifests,
	featuresByOrgEnv,
}: {
	batch: BatchInvalidateCustomer[];
	manifests: unknown[] | undefined;
	featuresByOrgEnv: FeaturesByOrgEnv;
}): SubjectInvalidation[] =>
	batch.map(({ orgId, env, customerId }, index) => {
		const manifestTuple = manifests?.[index] as
			| [unknown, string | null | undefined]
			| undefined;
		const cachedRaw = manifestTuple?.[1] ?? null;

		let featureIds: string[] = [];
		if (cachedRaw) {
			try {
				const manifest = JSON.parse(cachedRaw) as CachedFullSubject;
				featureIds = manifest.meteredFeatures ?? [];
			} catch {
				featureIds = [];
			}
		}

		// No manifest (miss, corrupt, or an unavailable read) — fall back to the
		// org's whole feature list rather than skipping the subject.
		if (featureIds.length === 0) {
			const orgFeatures =
				featuresByOrgEnv[buildFullSubjectOrgEnvKey({ orgId, env })] ?? [];
			featureIds = orgFeatures.map((feature) => feature.id);
		}

		return {
			subjectKey: buildFullSubjectKey({ orgId, env, customerId }),
			epochKey: buildFullSubjectViewEpochKey({ orgId, env, customerId }),
			balanceKeys: [...new Set(featureIds)].map((featureId) =>
				buildSharedFullSubjectBalanceKey({
					orgId,
					env,
					customerId,
					featureId,
				}),
			),
		};
	});

// A pipeline is single-use, so each attempt builds its own.
const execInvalidationPipeline = ({
	redisV2,
	invalidations,
}: {
	redisV2: Redis;
	invalidations: SubjectInvalidation[];
}) => {
	const pipeline = redisV2.pipeline();

	for (const { subjectKey, epochKey, balanceKeys } of invalidations) {
		for (const balanceKey of balanceKeys) pipeline.unlink(balanceKey);
		pipeline.unlink(subjectKey);
		pipeline.incr(epochKey);
		pipeline.expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS);
	}

	return pipeline.exec();
};

/**
 * Runs the invalidation pipeline, retrying with exponential backoff up to
 * `maxAttempts`. `queueIfNotReady` rides out a handshake or reconnect blip;
 * retries cover the longer case where the client is down past its command
 * timeout. Returns false once every attempt is spent — the caller's caches
 * stay stale until TTL, so that outcome is logged, never silent.
 */
const writeInvalidations = async ({
	redisV2,
	invalidations,
	maxAttempts,
}: {
	redisV2: Redis;
	invalidations: SubjectInvalidation[];
	maxAttempts: number;
}): Promise<boolean> => {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const result = await tryRedisOp({
			operation: () => execInvalidationPipeline({ redisV2, invalidations }),
			source: "batchInvalidateCachedFullSubjects:invalidate",
			redisInstance: redisV2,
			queueIfNotReady: true,
		});

		if (result !== undefined) return true;
		if (attempt === maxAttempts) break;

		await timeout(
			Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS),
		);
	}

	return false;
};

const batchInvalidateCachedFullSubjectsOnRedis = async ({
	customers,
	featuresByOrgEnv,
	redisV2,
	maxAttempts,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	redisV2: Redis;
	maxAttempts: number;
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
			readPipeline.get(buildFullSubjectKey({ orgId, env, customerId }));
		}

		// Best-effort: an unavailable manifest read falls back to the org's
		// feature list, never to skipping the invalidation.
		const manifests = await tryRedisOp({
			operation: () => readPipeline.exec(),
			source: "batchInvalidateCachedFullSubjects:manifests",
			redisInstance: redisV2,
		});

		const invalidated = await writeInvalidations({
			redisV2,
			invalidations: resolveSubjectInvalidations({
				batch,
				manifests: manifests ?? undefined,
				featuresByOrgEnv,
			}),
			maxAttempts,
		});

		if (!invalidated) {
			const first = batch[0];
			logger.error(
				{
					type: "batch_invalidate_full_subjects_dropped",
					data: {
						org_id: first?.orgId,
						env: first?.env,
						customer_count: batch.length,
						attempts: maxAttempts,
						sample_customer_ids: batch
							.slice(0, 5)
							.map((customer) => customer.customerId),
					},
				},
				"FullSubject batch invalidation exhausted its attempts — these subjects stay stale until TTL",
			);
		}
	}
};

export const batchInvalidateCachedFullSubjects = async ({
	customers,
	featuresByOrgEnv,
	getRedisTargetsForCustomer,
	maxAttempts = 1,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	getRedisTargetsForCustomer: ({
		customer,
	}: {
		customer: BatchInvalidateCustomer;
	}) => Redis[];
	/** Attempts per pipeline, including the first. Callers whose writes are
	 *  already committed (migrations) opt into retries; best-effort callers
	 *  keep the single fail-open attempt. */
	maxAttempts?: number;
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
				maxAttempts,
			}),
		),
	);

	return customers.length;
};
