import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ResetCusEntParam } from "@/internal/balances/utils/sql/client.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import type { RolloverClearingInfo } from "../resetCustomerEntitlements/applyResetResults.js";

interface SubjectBalanceUpdate {
	cus_ent_id: string;
	balance: number | null;
	additional_balance: number | null;
	adjustment: number | null;
	entities: Record<string, unknown> | null;
	next_reset_at: number | null;
	expected_next_reset_at: number | null;
	rollover_insert: unknown | null;
	rollover_overwrites: unknown[] | null;
	rollover_delete_ids: string[] | null;
	new_replaceables: unknown[] | null;
	deleted_replaceable_ids: string[] | null;
}

/**
 * Patches shared FullSubject balance hashes after a lazy reset.
 * Groups updates by feature_id and pipelines one updateSubjectBalances call per feature.
 * Fire-and-forget -- failures are logged but don't propagate.
 * Does not mutate cache_version in cache; version bumps are DB lifecycle concerns.
 */
export const resetSubjectCache = async ({
	ctx,
	customerId,
	resets,
	oldNextResetAts,
	clearingMap,
	customerEntitlementFeatureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	resets: ResetCusEntParam[];
	oldNextResetAts: Record<string, number>;
	clearingMap: Record<string, RolloverClearingInfo>;
	customerEntitlementFeatureIds: Record<string, string>;
}): Promise<void> => {
	if (resets.length === 0) return;

	try {
		const { org, env, redisV2 } = ctx;

		const updatesByFeatureId: Record<string, SubjectBalanceUpdate[]> = {};

		for (const reset of resets) {
			const featureId = customerEntitlementFeatureIds[reset.cus_ent_id];
			if (!featureId) continue;

			const clearing = clearingMap[reset.cus_ent_id];

			const update: SubjectBalanceUpdate = {
				cus_ent_id: reset.cus_ent_id,
				balance: reset.balance,
				additional_balance: reset.additional_balance,
				adjustment: reset.adjustment,
				entities: reset.entities,
				next_reset_at: reset.next_reset_at,
				expected_next_reset_at: oldNextResetAts[reset.cus_ent_id] ?? null,
				rollover_insert: reset.rollover_insert,
				rollover_overwrites:
					clearing && clearing.overwrites.length > 0
						? clearing.overwrites
						: null,
				rollover_delete_ids:
					clearing && clearing.deletedIds.length > 0
						? clearing.deletedIds
						: null,
				new_replaceables: null,
				deleted_replaceable_ids: null,
			};

			if (!updatesByFeatureId[featureId]) {
				updatesByFeatureId[featureId] = [];
			}
			updatesByFeatureId[featureId].push(update);
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

		const pipelineResults = await tryRedisWrite(() => pipeline.exec(), redisV2);

		if (pipelineResults) {
			for (const [, resultRaw] of pipelineResults) {
				if (typeof resultRaw !== "string") continue;
				try {
					const parsed = JSON.parse(resultRaw) as {
						applied?: Record<string, boolean>;
						skipped?: string[];
						logs?: string[];
					};
					if (parsed.logs && parsed.logs.length > 0) {
						ctx.logger.debug(
							`[resetSubjectCache] Lua logs:\n${parsed.logs.join("\n")}`,
						);
					}
				} catch {}
			}
		}
	} catch (error) {
		ctx.logger.error(
			`[resetSubjectCache] customer=${customerId}, failed: ${error}`,
		);
	}
};
