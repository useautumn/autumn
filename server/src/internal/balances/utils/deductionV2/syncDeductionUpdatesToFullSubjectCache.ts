import type { EntityRolloverBalance, FullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

interface RolloverOverwrite {
	id: string;
	cus_ent_id: string;
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance>;
}

interface SubjectBalanceUpdate {
	cus_ent_id: string;
	balance: number | null;
	additional_balance: number | null;
	adjustment: number | null;
	entities: Record<string, unknown> | null;
	next_reset_at: number | null;
	expected_next_reset_at: number | null;
	rollover_insert: unknown | null;
	rollover_overwrites: RolloverOverwrite[] | null;
	rollover_delete_ids: string[] | null;
	new_replaceables: unknown[] | null;
	deleted_replaceable_ids: string[] | null;
}

/**
 * Syncs deduction updates to the V2 FullSubject balance hashes.
 * Groups updates by featureId and pipelines one Lua call per feature.
 * Fire-and-forget — failures are logged but don't propagate.
 * Intentionally does not mutate cache_version; DB-side flows own version bumps.
 */
export const syncDeductionUpdatesToFullSubjectCache = async ({
	ctx,
	customerId,
	fullSubject,
	cusEntUpdates,
	rolloverOverwrites,
	modifiedCusEntIdsByFeatureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	fullSubject: FullSubject;
	cusEntUpdates: Record<string, DeductionUpdate>;
	rolloverOverwrites: RolloverOverwrite[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
}): Promise<void> => {
	try {
		const rolloverOverwritesByCusEnt: Record<string, RolloverOverwrite[]> = {};
		for (const rolloverOverwrite of rolloverOverwrites) {
			if (!rolloverOverwritesByCusEnt[rolloverOverwrite.cus_ent_id]) {
				rolloverOverwritesByCusEnt[rolloverOverwrite.cus_ent_id] = [];
			}
			rolloverOverwritesByCusEnt[rolloverOverwrite.cus_ent_id].push(
				rolloverOverwrite,
			);
		}

		// Build a lookup of cusEntId -> next_reset_at from the fullSubject
		const cusEntNextResetAts: Record<string, number | null> = {};
		for (const customerProduct of fullSubject.customer_products) {
			for (const customerEntitlement of customerProduct.customer_entitlements) {
				cusEntNextResetAts[customerEntitlement.id] =
					customerEntitlement.next_reset_at ?? null;
			}
		}
		for (const customerEntitlement of fullSubject.extra_customer_entitlements ??
			[]) {
			cusEntNextResetAts[customerEntitlement.id] =
				customerEntitlement.next_reset_at ?? null;
		}

		const { org, env } = ctx;

		// Group updates by featureId and build per-feature update arrays
		const updatesByFeatureId: Record<string, SubjectBalanceUpdate[]> = {};

		for (const [featureId, cusEntIds] of Object.entries(
			modifiedCusEntIdsByFeatureId,
		)) {
			const featureUpdates: SubjectBalanceUpdate[] = [];

			for (const cusEntId of cusEntIds) {
				const update = cusEntUpdates[cusEntId];
				if (!update) continue;

				featureUpdates.push({
					cus_ent_id: cusEntId,
					balance: update.balance ?? null,
					additional_balance: update.additional_balance ?? null,
					adjustment: update.adjustment ?? null,
					entities: update.entities ?? null,
					next_reset_at: null,
					expected_next_reset_at: cusEntNextResetAts[cusEntId] ?? null,
					rollover_insert: null,
					rollover_overwrites: rolloverOverwritesByCusEnt[cusEntId] ?? null,
					rollover_delete_ids: null,
					new_replaceables: update.newReplaceables ?? null,
					deleted_replaceable_ids:
						update.deletedReplaceables?.map((r) => r.id) ?? null,
				});
			}

			if (featureUpdates.length > 0) {
				updatesByFeatureId[featureId] = featureUpdates;
			}
		}

		if (Object.keys(updatesByFeatureId).length === 0) return;

		const pipeline = redisV2.pipeline();
		for (const [featureId, updates] of Object.entries(updatesByFeatureId)) {
			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				featureId,
			});
			pipeline.updateSubjectBalances(
				balanceKey,
				JSON.stringify({
					ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					updates,
				}),
			);
		}

		await tryRedisWrite(() => pipeline.exec(), redisV2);
	} catch (error) {
		ctx.logger.error(
			`[syncDeductionUpdatesToFullSubjectCache] Failed to sync updates to cache: ${error}`,
		);
	}
};
