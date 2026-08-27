import type { NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import { buildRuntimeSubjectKey } from "../builders/buildRuntimeSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../config/fullSubjectCacheConfig.js";
import {
	buildRuntimeSubjectProjection,
	runtimeSubjectProjectionToHashFields,
} from "./runtimeSubjectModel.js";

export const setCachedRuntimeSubject = async ({
	ctx,
	normalized,
	subjectViewEpoch,
	featureIds,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	subjectViewEpoch: number;
	featureIds: string[];
}): Promise<void> => {
	const { org, env, redisV2 } = ctx;
	const { customerId, entityId } = normalized;
	const fields = runtimeSubjectProjectionToHashFields({
		projection: buildRuntimeSubjectProjection({
			normalized,
			subjectViewEpoch,
			knownFeatureIds: ctx.features.map((feature) => feature.id),
			projectedFeatureIds: featureIds,
		}),
	});
	const fieldEntries = Object.entries(fields);
	await tryRedisWrite(
		() =>
			redisV2.setRuntimeSubjectIfCurrent(
				buildFullSubjectKey({
					orgId: org.id,
					env,
					customerId,
					entityId,
				}),
				buildFullSubjectViewEpochKey({
					orgId: org.id,
					env,
					customerId,
				}),
				buildRuntimeSubjectKey({
					orgId: org.id,
					env,
					customerId,
					entityId,
				}),
				String(subjectViewEpoch),
				String(FULL_SUBJECT_CACHE_TTL_SECONDS),
				String(fieldEntries.length),
				...fieldEntries.flat(),
			),
		redisV2,
	);
};
