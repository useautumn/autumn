import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshAllocationScaleAfterWrite } from "@/internal/balances/allocate/actions/refreshAllocationScale.js";
import { resetCusEnts } from "@/internal/balances/utils/sql/client.js";
import { resetSubjectCache } from "../resetCustomerEntitlementsV2/resetSubjectCache.js";
import { applyResetResults } from "./applyResetResults.js";
import { getCusEntsNeedingReset } from "./getCusEntsNeedingReset.js";
import { type ProcessResetResult, processReset } from "./processReset.js";
import { processResetResultToResetCusEntParam } from "./processResetResultToResetCusEntParam.js";

export const resetCustomerEntitlements = async ({
	ctx,
	fullCus,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	now?: number;
}): Promise<boolean> => {
	const { logger } = ctx;
	const customerId = fullCus.id || fullCus.internal_id;

	const cusEntsNeedingReset = getCusEntsNeedingReset({ fullCus, now });

	if (cusEntsNeedingReset.length === 0) return false;

	try {
		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, cusEnts needing reset: ${cusEntsNeedingReset.length}`,
		);

		const computed: Array<{
			cusEntId: string;
			result: ProcessResetResult;
		}> = [];

		for (const cusEnt of cusEntsNeedingReset) {
			const result = await processReset({ cusEnt, ctx });
			if (!result) continue;
			computed.push({ cusEntId: cusEnt.id, result });
		}

		if (computed.length === 0) return false;

		const resets = computed.map(({ cusEntId, result }) =>
			processResetResultToResetCusEntParam({
				customerEntitlementId: cusEntId,
				result,
			}),
		);

		const { applied, skipped } = await resetCusEnts({ ctx, resets });

		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, applied: ${Object.keys(applied).length}, skipped: ${skipped.length}`,
		);

		const clearingMap = await applyResetResults({
			ctx,
			fullCus,
			computed,
			skipped,
		});

		if (Object.keys(applied).length > 0) {
			const oldNextResetAts: Record<string, number> = {};
			const customerEntitlementFeatureIds: Record<string, string> = {};
			for (const cusEnt of cusEntsNeedingReset) {
				if (cusEnt.next_reset_at) {
					oldNextResetAts[cusEnt.id] = cusEnt.next_reset_at;
				}
				customerEntitlementFeatureIds[cusEnt.id] = cusEnt.feature_id;
			}

			await resetSubjectCache({
				ctx,
				customerId,
				resets,
				oldNextResetAts,
				clearingMap,
				customerEntitlementFeatureIds,
			});

			logger.info(
				`[resetCustomerEntitlements] customer=${customerId}, Redis cache updated`,
			);

			if (fullCus.balance_allocations) {
				const { written } = await refreshAllocationScaleAfterWrite({
					ctx,
					customerId,
				});
				if (written) fullCus.balance_allocations = written;
			}
		}

		return true;
	} catch (error) {
		logger.error(
			`[resetCustomerEntitlements] customer=${customerId}, failed: ${error}`,
			{ error },
		);
		return false;
	}
};
