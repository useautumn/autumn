import type { AppEnv, Feature } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { batchDeleteCachedFullCustomers } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/batchDeleteCachedFullCustomers.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
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

export const batchInvalidateCachedFullSubjects = async ({
	customers,
	featuresByOrgEnv,
}: {
	customers: BatchInvalidateCustomer[];
	featuresByOrgEnv: FeaturesByOrgEnv;
}): Promise<number> => {
	if (customers.length === 0) return 0;

	const deleted = await batchDeleteCachedFullCustomers({ customers });
	if (redisV2.status !== "ready") return deleted;

	for (
		let offset = 0;
		offset < customers.length;
		offset += PIPELINE_BATCH_SIZE
	) {
		const batch = customers.slice(offset, offset + PIPELINE_BATCH_SIZE);
		const readPipeline = redisV2.pipeline();

		for (const { orgId, env, customerId } of batch) {
			if (!customerId) continue;

			const subjectKey = buildFullSubjectKey({ orgId, env, customerId });
			readPipeline.get(subjectKey);
		}

		const readResults = await tryRedisRead(() => readPipeline.exec(), redisV2);
		if (!readResults) continue;

		const writePipeline = redisV2.pipeline();

		for (let index = 0; index < batch.length; index++) {
			const customer = batch[index];
			if (!customer?.customerId) continue;

			const { orgId, env, customerId } = customer;
			const subjectKey = buildFullSubjectKey({ orgId, env, customerId });
			const epochKey = buildFullSubjectViewEpochKey({ orgId, env, customerId });
			const subjectTuple = readResults[index];
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

		await tryRedisWrite(() => writePipeline.exec(), redisV2);
	}

	return deleted;
};
