import type {
	FullCustomerEntitlement,
	NormalizedFullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";
import {
	FULL_SUBJECT_CACHE_TTL_SECONDS,
	FULL_SUBJECT_EPOCH_TTL_SECONDS,
} from "../config/fullSubjectCacheConfig.js";
import { normalizedToCachedFullSubject } from "../fullSubjectCacheModel.js";
import { assertPrimarySourced } from "../subjectProvenance.js";
import { buildSharedBalanceWrites } from "./setCachedFullSubject/setSharedFullSubjectBalances.js";

type ScalarBalanceState = {
	balance: number;
	adjustment: number;
	additionalBalance: number;
	cacheVersion: number;
	nextResetAt: number | null;
};

export type PublishedBalanceTransition = {
	customerEntitlementId: string;
	expected: ScalarBalanceState;
	published: ScalarBalanceState;
};

export type PublishCachedFullSubjectResult =
	| {
			status: "OK";
			balanceTransitions: PublishedBalanceTransition[];
	  }
	| { status: "CACHE_MISSING" | "UNSUPPORTED" | "FAILED" };

export type SimpleBalanceTransition = {
	sourceCustomerEntitlementId: string;
	targetCustomerEntitlementId: string;
	sourceBalance: number;
	sourceAdjustment: number;
};

type CacheBalanceTransition = {
	sourceField: string;
	targetField: string;
	sourceBalance: number;
	sourceAdjustment: number;
};

type BalanceHashPublication = {
	balanceKey: string;
	deletes: string[];
	writes: Record<string, string>;
	balanceTransitions: CacheBalanceTransition[];
};

type BalanceCandidate =
	| FullCustomerEntitlement
	| NormalizedFullSubject["customer_entitlements"][number];

const isSimpleScalarBalance = (
	customerEntitlement: BalanceCandidate,
): boolean =>
	typeof customerEntitlement.balance === "number" &&
	Number.isFinite(customerEntitlement.balance) &&
	Number.isFinite(customerEntitlement.adjustment ?? 0) &&
	(customerEntitlement.additional_balance ?? 0) === 0 &&
	!customerEntitlement.is_pooled_balance &&
	!customerEntitlement.pooled_balance_id &&
	!customerEntitlement.pooled_contribution_id &&
	!customerEntitlement.internal_entity_id &&
	!customerEntitlement.entitlement?.entity_feature_id &&
	Object.keys(customerEntitlement.entities ?? {}).length === 0 &&
	(customerEntitlement.rollovers?.length ?? 0) === 0 &&
	(customerEntitlement.replaceables?.length ?? 0) === 0;

const toScalarBalanceState = ({
	balance,
	adjustment,
	additional_balance: additionalBalance,
	cache_version: cacheVersion,
	next_reset_at: nextResetAt,
}: {
	balance?: number | null;
	adjustment?: number | null;
	additional_balance?: number | null;
	cache_version?: number | null;
	next_reset_at?: number | null;
}): ScalarBalanceState => ({
	balance: balance ?? 0,
	adjustment: adjustment ?? 0,
	additionalBalance: additionalBalance ?? 0,
	cacheVersion: cacheVersion ?? 0,
	nextResetAt: nextResetAt ?? null,
});

export const publishCachedFullSubject = async ({
	ctx,
	normalized,
	outgoingCustomerEntitlements,
	balanceTransitions = [],
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	outgoingCustomerEntitlements: FullCustomerEntitlement[];
	balanceTransitions?: SimpleBalanceTransition[];
}): Promise<PublishCachedFullSubjectResult> => {
	assertPrimarySourced(normalized, "publishCachedFullSubject");
	const { customerId, entityId } = normalized;
	const cached = normalizedToCachedFullSubject({
		normalized,
		subjectViewEpoch: 0,
	});
	const hasFeatureScopedRuntimeState =
		(normalized.entity_aggregations?.aggregated_customer_entitlements.length ??
			0) > 0 || (cached.usageWindowFeatureIds?.length ?? 0) > 0;
	if (hasFeatureScopedRuntimeState) return { status: "UNSUPPORTED" };

	const targetWrites = buildSharedBalanceWrites({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		customerEntitlements: normalized.customer_entitlements,
		aggregatedCustomerEntitlements:
			normalized.entity_aggregations?.aggregated_customer_entitlements ?? [],
		usageWindows: normalized.usage_windows ?? [],
		usageWindowFeatureIds: cached.usageWindowFeatureIds,
	});
	const publicationsByKey = new Map<string, BalanceHashPublication>();

	for (const targetWrite of targetWrites) {
		publicationsByKey.set(targetWrite.balanceKey, {
			balanceKey: targetWrite.balanceKey,
			deletes: [],
			writes: targetWrite.fields,
			balanceTransitions: [],
		});
	}

	for (const outgoingCustomerEntitlement of outgoingCustomerEntitlements) {
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: outgoingCustomerEntitlement.feature_id,
		});
		const publication = publicationsByKey.get(balanceKey) ?? {
			balanceKey,
			deletes: [],
			writes: {},
			balanceTransitions: [],
		};
		if (!(outgoingCustomerEntitlement.id in publication.writes)) {
			publication.deletes.push(outgoingCustomerEntitlement.id);
		}
		publicationsByKey.set(balanceKey, publication);
	}

	const outgoingById = new Map(
		outgoingCustomerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const targetById = new Map(
		normalized.customer_entitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const usedSourceIds = new Set<string>();
	const usedTargetIds = new Set<string>();

	for (const balanceTransition of balanceTransitions) {
		const sourceCustomerEntitlement = outgoingById.get(
			balanceTransition.sourceCustomerEntitlementId,
		);
		const targetCustomerEntitlement = targetById.get(
			balanceTransition.targetCustomerEntitlementId,
		);
		if (
			!sourceCustomerEntitlement ||
			!targetCustomerEntitlement ||
			usedSourceIds.has(sourceCustomerEntitlement.id) ||
			usedTargetIds.has(targetCustomerEntitlement.id) ||
			sourceCustomerEntitlement.feature_id !==
				targetCustomerEntitlement.feature_id ||
			(sourceCustomerEntitlement.internal_feature_id &&
				targetCustomerEntitlement.internal_feature_id &&
				sourceCustomerEntitlement.internal_feature_id !==
					targetCustomerEntitlement.internal_feature_id) ||
			!isSimpleScalarBalance(sourceCustomerEntitlement) ||
			!isSimpleScalarBalance(targetCustomerEntitlement) ||
			balanceTransition.sourceBalance !== sourceCustomerEntitlement.balance ||
			balanceTransition.sourceAdjustment !==
				(sourceCustomerEntitlement.adjustment ?? 0)
		) {
			return { status: "UNSUPPORTED" };
		}

		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: sourceCustomerEntitlement.feature_id,
		});
		const publication = publicationsByKey.get(balanceKey);
		if (!publication || !(targetCustomerEntitlement.id in publication.writes)) {
			return { status: "UNSUPPORTED" };
		}

		publication.balanceTransitions.push({
			sourceField: sourceCustomerEntitlement.id,
			targetField: targetCustomerEntitlement.id,
			sourceBalance: balanceTransition.sourceBalance,
			sourceAdjustment: balanceTransition.sourceAdjustment,
		});
		usedSourceIds.add(sourceCustomerEntitlement.id);
		usedTargetIds.add(targetCustomerEntitlement.id);
	}

	const hasUnmappedRuntimeBalance = outgoingCustomerEntitlements.some(
		(customerEntitlement) =>
			typeof customerEntitlement.balance === "number" &&
			!usedSourceIds.has(customerEntitlement.id),
	);
	if (hasUnmappedRuntimeBalance) return { status: "UNSUPPORTED" };

	const publications = [...publicationsByKey.values()];
	const keys = [
		buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			entityId,
		}),
		buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		...publications.map((publication) => publication.balanceKey),
	];
	const result = await tryRedisWrite(
		() =>
			ctx.redisV2.publishCachedFullSubject(
				keys.length,
				...keys,
				JSON.stringify({
					ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					epoch_ttl_seconds: FULL_SUBJECT_EPOCH_TTL_SECONDS,
					subject: cached,
					balance_hashes: publications.map(
						({ deletes, writes, balanceTransitions }) => ({
							deletes,
							writes,
							balance_transitions: balanceTransitions.map(
								({
									sourceField,
									targetField,
									sourceBalance,
									sourceAdjustment,
								}) => ({
									source_field: sourceField,
									target_field: targetField,
									source_balance: sourceBalance,
									source_adjustment: sourceAdjustment,
								}),
							),
						}),
					),
				}),
			),
		ctx.redisV2,
	);

	if (!result) return { status: "FAILED" };
	if (result !== "OK" && !result.startsWith("{")) {
		return {
			status:
				result === "CACHE_MISSING" || result === "UNSUPPORTED"
					? result
					: "FAILED",
		};
	}

	try {
		const parsed = JSON.parse(result) as {
			status: "OK";
			target_fields?: Record<string, string>;
		};
		return {
			status: "OK",
			balanceTransitions: balanceTransitions.flatMap((transition) => {
				const target = targetById.get(transition.targetCustomerEntitlementId);
				const publishedRaw = parsed.target_fields?.[target?.id ?? ""];
				if (!target || !publishedRaw) return [];
				const published = JSON.parse(publishedRaw) as BalanceCandidate;
				return [
					{
						customerEntitlementId: target.id,
						expected: toScalarBalanceState(target),
						published: toScalarBalanceState(published),
					},
				];
			}),
		};
	} catch (error) {
		ctx.logger.error(
			{ error },
			"[publishCachedFullSubject] Published cache but could not parse transition result",
		);
		return { status: "OK", balanceTransitions: [] };
	}
};
