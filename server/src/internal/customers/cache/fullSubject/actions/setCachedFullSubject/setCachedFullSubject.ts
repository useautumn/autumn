import type { NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import {
	FULL_SUBJECT_CACHE_TTL_SECONDS,
	FULL_SUBJECT_EPOCH_TTL_SECONDS,
} from "../../config/fullSubjectCacheConfig.js";
import { normalizedToCachedFullSubject } from "../../fullSubjectCacheModel.js";
import type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";
import { buildSharedBalanceWrites } from "./setSharedFullSubjectBalances.js";

export type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";

export const setCachedFullSubject = async ({
	ctx,
	normalized,
	fetchedSubjectViewEpoch,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	fetchedSubjectViewEpoch: number;
}): Promise<SetCachedFullSubjectResult> => {
	const { logger, org, env, redisV2 } = ctx;
	const { customerId, entityId } = normalized;

	const cached = normalizedToCachedFullSubject({
		normalized,
		subjectViewEpoch: fetchedSubjectViewEpoch,
	});

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

	const balanceWrites = buildSharedBalanceWrites({
		orgId: org.id,
		env,
		customerId,
		customerEntitlements: normalized.customer_entitlements,
		aggregatedCustomerEntitlements:
			normalized.entity_aggregations?.aggregated_customer_entitlements ?? [],
	});

	const keys: string[] = [subjectKey, epochKey];
	for (const { balanceKey } of balanceWrites) {
		keys.push(balanceKey);
	}

	const argv: string[] = [
		String(fetchedSubjectViewEpoch),
		String(FULL_SUBJECT_CACHE_TTL_SECONDS),
		String(FULL_SUBJECT_EPOCH_TTL_SECONDS),
		JSON.stringify(cached),
		String(balanceWrites.length),
	];

	for (const { fields } of balanceWrites) {
		const fieldEntries = Object.entries(fields);
		argv.push(String(fieldEntries.length));
		for (const [fieldName, fieldValue] of fieldEntries) {
			argv.push(fieldName, fieldValue);
		}
	}

	const result = await tryRedisWrite(
		() => redisV2.setCachedFullSubject(keys.length, ...keys, ...argv),
		redisV2,
	);

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	logger.info(
		`[setCachedFullSubject] ${subjectLabel}: ${result ?? "FAILED"}, balances=${cached.meteredFeatures.length}`,
	);

	return result ?? "FAILED";
};
