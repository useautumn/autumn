import type {
	BalanceTransitionPlan,
	BalanceTransitionUnsupportedReason,
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
import {
	type BalanceCandidate,
	type BalanceTransitionPairUnsupportedReason,
	classifyBalanceTransitionPair,
} from "./classifyBalanceTransitionPair.js";
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
	| { status: "CACHE_MISSING" | "FAILED" }
	| {
			status: "UNSUPPORTED";
			reason: PublishCachedFullSubjectUnsupportedReason;
	  };

export type PublishCachedFullSubjectUnsupportedReason =
	| BalanceTransitionUnsupportedReason
	| BalanceTransitionPairUnsupportedReason
	| "feature_scoped_runtime_state"
	| "target_already_cached"
	| "target_balance_write_missing";

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
	balanceTransitionPlan,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	balanceTransitionPlan: BalanceTransitionPlan;
}): Promise<PublishCachedFullSubjectResult> => {
	assertPrimarySourced(normalized, "publishCachedFullSubject");
	const {
		id: balanceTransitionId,
		outgoingCustomerEntitlements,
		transitions: balanceTransitions,
	} = balanceTransitionPlan;
	if (balanceTransitionPlan.unsupportedReason) {
		return {
			status: "UNSUPPORTED",
			reason: balanceTransitionPlan.unsupportedReason,
		};
	}
	const { customerId, entityId } = normalized;
	const cached = normalizedToCachedFullSubject({
		normalized,
		subjectViewEpoch: 0,
	});
	const hasFeatureScopedRuntimeState =
		(normalized.entity_aggregations?.aggregated_customer_entitlements.length ??
			0) > 0 || (cached.usageWindowFeatureIds?.length ?? 0) > 0;
	if (hasFeatureScopedRuntimeState) {
		return { status: "UNSUPPORTED", reason: "feature_scoped_runtime_state" };
	}

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
		const unsupportedReason = classifyBalanceTransitionPair({
			transition: balanceTransition,
			sourceCustomerEntitlement,
			targetCustomerEntitlement,
			sourceAlreadyUsed: sourceCustomerEntitlement
				? usedSourceIds.has(sourceCustomerEntitlement.id)
				: false,
			targetAlreadyUsed: targetCustomerEntitlement
				? usedTargetIds.has(targetCustomerEntitlement.id)
				: false,
		});
		if (unsupportedReason) {
			return { status: "UNSUPPORTED", reason: unsupportedReason };
		}
		if (!sourceCustomerEntitlement || !targetCustomerEntitlement) {
			return { status: "FAILED" };
		}

		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: sourceCustomerEntitlement.feature_id,
		});
		const publication = publicationsByKey.get(balanceKey);
		if (!publication || !(targetCustomerEntitlement.id in publication.writes)) {
			return {
				status: "UNSUPPORTED",
				reason: "target_balance_write_missing",
			};
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
	if (hasUnmappedRuntimeBalance) {
		return { status: "UNSUPPORTED", reason: "unmapped_runtime_balance" };
	}

	const publications = [...publicationsByKey.values()];
	const subjectKey = buildFullSubjectKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		entityId,
	});
	const keys = [
		subjectKey,
		buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		`${subjectKey}:balance_transition:${balanceTransitionId}`,
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
	if (result.startsWith("UNSUPPORTED:")) {
		return {
			status: "UNSUPPORTED",
			reason: result.slice("UNSUPPORTED:".length) as
				| "complex_runtime_state"
				| "target_already_cached",
		};
	}
	if (result !== "OK" && !result.startsWith("{")) {
		return {
			status: result === "CACHE_MISSING" ? result : "FAILED",
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
