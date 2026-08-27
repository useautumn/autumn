import {
	AllowanceType,
	cusEntToCurrentBalance,
	type FullCustomerEntitlement,
	type NormalizedFullSubject,
	type SubjectBalance,
	sumValues,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { shadowTapSet } from "@/internal/metering/shadow/shadowTap.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import {
	FULL_SUBJECT_CACHE_TTL_SECONDS,
	FULL_SUBJECT_EPOCH_TTL_SECONDS,
} from "../../config/fullSubjectCacheConfig.js";
import { normalizedToCachedFullSubject } from "../../fullSubjectCacheModel.js";
import { assertPrimarySourced } from "../../subjectProvenance.js";
import type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";
import { buildSharedBalanceWrites } from "./setSharedFullSubjectBalances.js";

export type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";

/** Shadow only: this refill is the shadow's state-seeding mechanism. A fresh
 *  attach never writes its included allowance into the balance cache — it
 *  invalidates and lets the next read repopulate from Postgres — so this is the
 *  only point where the mirror ever sees the seed balance, and without it the
 *  metering worker's meter for that customer/feature stays at zero while the
 *  serving path reads the full grant.
 *
 *  This installs by feature, not by entitlement: the fold keys one meter per
 *  (customer, feature), so a feature's entitlements are summed into a single
 *  post-state. The value is the balance the API reports as `remaining`, taken
 *  from the same helper the API uses, so a seeded meter and a live check agree
 *  before any deduct lands. Unlimited features are skipped — the v1 event has
 *  no way to say "unbounded", and seeding their zero would make every later
 *  deduct fold as insufficient. An overdrawn feature seeds the zero the API
 *  reports rather than a negative, because that helper already clamps; the
 *  guard below only catches a value the helper could never produce today.
 *
 *  A refill can transiently overwrite a mirrored deduct that raced it, since
 *  the set installs whatever Postgres held when the read hydrated. That is
 *  accepted for the shadow phase: the next refill re-seeds from the same source
 *  of truth, so the drift is self-healing rather than cumulative.
 *
 *  The mutation id is the post-state, and `buildShadowEventId` already scopes
 *  the digest per (org, env, customer, feature): two refills that install the
 *  same balance are the same seed and fold as a duplicate, while a refill after
 *  real usage lands on a different balance and re-seeds. Fire-and-forget; it
 *  cannot fail the cache write. */
/** `SubjectBalance` widens `cache_version` to nullable; the balance helpers
 *  take the stricter row type and never read that field. */
const toCustomerEntitlement = (
	subjectBalance: SubjectBalance,
): FullCustomerEntitlement => ({
	...subjectBalance,
	cache_version: subjectBalance.cache_version ?? 0,
});

const mirrorFillToMeteringShadow = ({
	ctx,
	normalized,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
}): void => {
	const balancesByFeatureId = new Map<string, SubjectBalance[]>();
	for (const customerEntitlement of normalized.customer_entitlements) {
		const featureBalances =
			balancesByFeatureId.get(customerEntitlement.feature_id) ?? [];
		featureBalances.push(customerEntitlement);
		balancesByFeatureId.set(customerEntitlement.feature_id, featureBalances);
	}

	for (const [featureId, featureBalances] of balancesByFeatureId) {
		const isUnlimited = featureBalances.some(
			(customerEntitlement) =>
				customerEntitlement.entitlement.allowance_type ===
				AllowanceType.Unlimited,
		);
		if (isUnlimited) continue;

		const balance = sumValues(
			featureBalances.map((customerEntitlement) =>
				cusEntToCurrentBalance({
					cusEnt: toCustomerEntitlement(customerEntitlement),
					withRollovers: true,
				}),
			),
		);
		if (!Number.isFinite(balance) || balance < 0) continue;

		shadowTapSet({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: normalized.customerId,
			featureId,
			value: balance,
			idempotencyKey: `full_subject_fill:set:${balance}`,
		});
	}
};

export const setCachedFullSubject = async ({
	ctx,
	normalized,
	fetchedSubjectViewEpoch,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	fetchedSubjectViewEpoch: number;
}): Promise<SetCachedFullSubjectResult> => {
	assertPrimarySourced(normalized, "setCachedFullSubject");
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
		usageWindows: normalized.usage_windows ?? [],
		usageWindowFeatureIds: cached.usageWindowFeatureIds,
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

	// "OK" is the only outcome that wrote the balance hashes: CACHE_EXISTS and
	// STALE_WRITE both leave the cache untouched, so nothing was installed.
	if (result === "OK") {
		mirrorFillToMeteringShadow({ ctx, normalized });
	}

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	logger.info(
		`[setCachedFullSubject] ${subjectLabel}: ${result ?? "FAILED"}, balances=${cached.meteredFeatures.length}`,
	);

	return result ?? "FAILED";
};
