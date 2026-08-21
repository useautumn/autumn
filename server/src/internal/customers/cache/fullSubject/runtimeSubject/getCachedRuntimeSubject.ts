import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type FeatureBalancesBatchOutcome,
	type FeatureBalancesBatchRead,
	parseCachedFeatureBalanceHashReads,
} from "../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import { buildRuntimeSubjectKey } from "../builders/buildRuntimeSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";
import type { CachedFullSubject } from "../fullSubjectCacheModel.js";
import {
	type CachedRuntimeSubjectCore,
	type CachedRuntimeSubjectFeature,
	mergeRuntimeSubjectProjection,
	RUNTIME_SUBJECT_CORE_FIELD,
	RUNTIME_SUBJECT_SCHEMA_VERSION,
} from "./runtimeSubjectModel.js";

export type CachedRuntimeSubjectResult =
	| {
			kind: "hit";
			cached: CachedFullSubject;
			featureBalances: Extract<
				FeatureBalancesBatchOutcome,
				{ kind: "ok" }
			>["value"];
			subjectViewEpoch: number;
	  }
	| { kind: "miss"; reason: string; subjectViewEpoch: number };

const parseSubjectViewEpoch = ({ epochRaw }: { epochRaw: string | null }) => {
	const parsed = epochRaw === null ? Number.NaN : Number.parseInt(epochRaw, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
};

const parseJson = <T>({ raw }: { raw: string | null }): T | undefined => {
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
};

const buildFeatureBalancesRead = ({
	cached,
	featureIds,
	includeAggregated,
}: {
	cached: CachedFullSubject;
	featureIds: string[];
	includeAggregated: boolean;
}): FeatureBalancesBatchRead => {
	const requestedFeatureIds = new Set(featureIds);
	const usageWindowFeatureIds = new Set(
		(cached.usageWindowFeatureIds ?? []).filter((featureId) =>
			requestedFeatureIds.has(featureId),
		),
	);
	return {
		featureIds: [
			...new Set([
				...cached.meteredFeatures.filter((featureId) =>
					requestedFeatureIds.has(featureId),
				),
				...usageWindowFeatureIds,
			]),
		],
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated,
		usageWindowFeatureIds,
	};
};

export const getCachedRuntimeSubject = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
}): Promise<CachedRuntimeSubjectResult> => {
	const { org, env, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: org.id,
		env,
		customerId,
	});
	const runtimeSubjectKey = buildRuntimeSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const uniqueFeatureIds = [...new Set(featureIds)];
	const pipelineResults = await runRedisOp({
		operation: async (redis) => {
			const pipeline = redis
				.pipeline()
				.exists(subjectKey)
				.get(epochKey)
				.hmget(
					runtimeSubjectKey,
					RUNTIME_SUBJECT_CORE_FIELD,
					...uniqueFeatureIds,
				);
			for (const featureId of uniqueFeatureIds) {
				pipeline.hgetall(
					buildSharedFullSubjectBalanceKey({
						orgId: org.id,
						env,
						customerId,
						featureId,
					}),
				);
			}
			return throwOnPipelineConnectionError(await pipeline.exec());
		},
		source: "getCachedRuntimeSubject:pipeline",
		redisInstance: redisV2,
		retryOnStandby: true,
		useReadPool: true,
		timeoutMs: REDIS_OP_TIMEOUT_MS.subjectPipeline,
	});

	const epochEntry = pipelineResults?.[1];
	if (epochEntry?.[0]) throw epochEntry[0];
	const subjectViewEpoch = parseSubjectViewEpoch({
		epochRaw: (epochEntry?.[1] ?? null) as string | null,
	});
	if (!pipelineResults) {
		return { kind: "miss", reason: "pipeline_null", subjectViewEpoch };
	}

	const subjectExistsEntry = pipelineResults[0];
	if (subjectExistsEntry?.[0]) throw subjectExistsEntry[0];
	if (Number(subjectExistsEntry?.[1] ?? 0) !== 1) {
		return { kind: "miss", reason: "subject_missing", subjectViewEpoch };
	}

	const runtimeEntry = pipelineResults[2];
	if (runtimeEntry?.[0]) throw runtimeEntry[0];
	const runtimeValues = runtimeEntry?.[1] as (string | null)[] | undefined;
	const core = parseJson<CachedRuntimeSubjectCore>({
		raw: runtimeValues?.[0] ?? null,
	});
	if (!core) {
		return { kind: "miss", reason: "runtime_core_missing", subjectViewEpoch };
	}
	if (
		core._schemaVersion !== RUNTIME_SUBJECT_SCHEMA_VERSION ||
		core.subjectViewEpoch !== subjectViewEpoch
	) {
		return { kind: "miss", reason: "runtime_core_stale", subjectViewEpoch };
	}
	const knownFeatureIds = new Set(core.knownFeatureIds);
	if (uniqueFeatureIds.some((featureId) => !knownFeatureIds.has(featureId))) {
		return {
			kind: "miss",
			reason: "runtime_feature_unknown",
			subjectViewEpoch,
		};
	}

	const features = uniqueFeatureIds.map((_, index) =>
		parseJson<CachedRuntimeSubjectFeature>({
			raw: runtimeValues?.[index + 1] ?? null,
		}),
	);
	if (features.some((feature) => !feature)) {
		return {
			kind: "miss",
			reason: "runtime_feature_missing",
			subjectViewEpoch,
		};
	}
	const cached = mergeRuntimeSubjectProjection({ core, features });
	const balanceRead = buildFeatureBalancesRead({
		cached,
		featureIds: uniqueFeatureIds,
		includeAggregated: !entityId,
	});
	const balanceResultIndexByFeatureId = new Map(
		uniqueFeatureIds.map((featureId, index) => [featureId, index + 3]),
	);
	const featureBalances = parseCachedFeatureBalanceHashReads({
		results: balanceRead.featureIds.map(
			(featureId) =>
				pipelineResults[balanceResultIndexByFeatureId.get(featureId) ?? -1],
		),
		read: balanceRead,
	});
	if (featureBalances.kind === "missing") {
		return {
			kind: "miss",
			reason: featureBalances.reason,
			subjectViewEpoch,
		};
	}

	return {
		kind: "hit",
		cached,
		featureBalances: featureBalances.value,
		subjectViewEpoch,
	};
};
