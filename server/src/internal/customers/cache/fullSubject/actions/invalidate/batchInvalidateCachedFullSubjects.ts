import type { AppEnv, Feature } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
	logger as baseLogger,
	type Logger,
} from "@/external/logtail/logtailUtils.js";
import { createRedisPipeline } from "@/external/redis/utils/createRedisPipeline.js";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
import { markCustomersUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { timeout } from "@/utils/genUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectOrgEnvKey } from "../../builders/buildFullSubjectOrgEnvKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

const PIPELINE_BATCH_SIZE = 250;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2000;

type BatchInvalidateCustomer = {
	orgId: string;
	env: AppEnv;
	customerId: string;
};

type FeaturesByOrgEnv = Record<string, Feature[]>;

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

const throwOnAnyPipelineError = <T extends [Error | null, unknown][] | null>(
	results: T,
): T => {
	const failed = results?.find((entry) => entry[0]);
	if (failed?.[0]) throw failed[0];
	return results;
};

const execInvalidationPipeline = ({
	redisV2,
	invalidations,
	strict,
	commandTimeoutMs,
}: {
	redisV2: Redis;
	invalidations: SubjectInvalidation[];
	strict: boolean;
	commandTimeoutMs?: number;
}) => {
	const pipeline = createRedisPipeline({ redis: redisV2, commandTimeoutMs });

	for (const { subjectKey, epochKey, balanceKeys } of invalidations) {
		for (const balanceKey of balanceKeys) pipeline.unlink(balanceKey);
		pipeline.unlink(subjectKey);
		pipeline.incr(epochKey);
		pipeline.expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS);
	}

	return pipeline
		.exec()
		.then(strict ? throwOnAnyPipelineError : throwOnPipelineConnectionError);
};

const writeInvalidations = async ({
	redisV2,
	invalidations,
	maxAttempts,
	strict,
	commandTimeoutMs,
}: {
	redisV2: Redis;
	invalidations: SubjectInvalidation[];
	maxAttempts: number;
	strict: boolean;
	commandTimeoutMs?: number;
}): Promise<boolean> => {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const result = await tryRedisOp({
			operation: () =>
				execInvalidationPipeline({
					redisV2,
					invalidations,
					strict,
					commandTimeoutMs,
				}),
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
	strict,
	commandTimeoutMs,
	logger,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	redisV2: Redis;
	maxAttempts: number;
	strict: boolean;
	commandTimeoutMs?: number;
	logger: Logger;
}): Promise<BatchInvalidateCustomer[]> => {
	const dropped: BatchInvalidateCustomer[] = [];
	const invalidatable = customers.filter((customer) => customer.customerId);
	if (invalidatable.length === 0) return dropped;

	for (
		let offset = 0;
		offset < invalidatable.length;
		offset += PIPELINE_BATCH_SIZE
	) {
		const batch = invalidatable.slice(offset, offset + PIPELINE_BATCH_SIZE);
		const readPipeline = createRedisPipeline({
			redis: redisV2,
			commandTimeoutMs,
		});

		for (const { orgId, env, customerId } of batch) {
			readPipeline.get(buildFullSubjectKey({ orgId, env, customerId }));
		}

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
			strict,
			commandTimeoutMs,
		});

		if (!invalidated) {
			dropped.push(...batch);
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
	return dropped;
};

export const batchInvalidateCachedFullSubjects = async ({
	customers,
	featuresByOrgEnv,
	getRedisTargetsForCustomer,
	maxAttempts = 1,
	phases,
	throwWhenExhausted = false,
	commandTimeoutMs,
	logger = baseLogger,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
	getRedisTargetsForCustomer: ({
		customer,
	}: {
		customer: BatchInvalidateCustomer;
	}) => Redis[];
	maxAttempts?: number;
	phases?: Record<string, number>;
	throwWhenExhausted?: boolean;
	commandTimeoutMs?: number;
	logger?: Logger;
}): Promise<number> => {
	if (customers.length === 0) return 0;

	const addPhase = ({
		phase,
		startedAt,
	}: {
		phase: string;
		startedAt: number;
	}) => {
		if (!phases) return;
		phases[phase] = (phases[phase] ?? 0) + (Date.now() - startedAt);
	};

	const marksStartedAt = Date.now();
	await markCustomersUpdatedAt({ customers });
	addPhase({ phase: "invalidate_marks_db", startedAt: marksStartedAt });

	await queueBalanceWorkerEvicts({ customers });

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

	const redisStartedAt = Date.now();
	const dropped = (
		await Promise.all(
			[...customersByRedis.entries()].map(([targetRedis, redisCustomers]) =>
				batchInvalidateCachedFullSubjectsOnRedis({
					customers: redisCustomers,
					featuresByOrgEnv,
					redisV2: targetRedis,
					maxAttempts,
					strict: throwWhenExhausted,
					commandTimeoutMs,
					logger,
				}),
			),
		)
	).flat();
	addPhase({ phase: "invalidate_redis", startedAt: redisStartedAt });

	if (throwWhenExhausted && dropped.length > 0) {
		const droppedIds = new Set(dropped.map((customer) => customer.customerId));
		throw new Error(
			`FullSubject batch invalidation dropped ${droppedIds.size} of ${customers.length} subjects after ${maxAttempts} attempts`,
		);
	}

	return customers.length;
};
