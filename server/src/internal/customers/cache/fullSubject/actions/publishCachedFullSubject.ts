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

export type PublishCachedFullSubjectResult =
	| "OK"
	| "CACHE_MISSING"
	| "UNSUPPORTED"
	| "FAILED";

type BalanceHashPublication = {
	balanceKey: string;
	deletes: string[];
	writes: Record<string, string>;
};

export const publishCachedFullSubject = async ({
	ctx,
	normalized,
	outgoingCustomerEntitlements,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	outgoingCustomerEntitlements: FullCustomerEntitlement[];
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
	if (hasFeatureScopedRuntimeState) return "UNSUPPORTED";

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
		};
		if (!(outgoingCustomerEntitlement.id in publication.writes)) {
			publication.deletes.push(outgoingCustomerEntitlement.id);
		}
		publicationsByKey.set(balanceKey, publication);
	}

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
					balance_hashes: publications.map(({ deletes, writes }) => ({
						deletes,
						writes,
					})),
				}),
			),
		ctx.redisV2,
	);

	return result ?? "FAILED";
};
