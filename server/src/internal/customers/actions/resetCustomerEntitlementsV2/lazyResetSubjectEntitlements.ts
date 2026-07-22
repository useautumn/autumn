import {
	CusProductStatus,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	type NormalizedFullSubject,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { getDbHealth, PgHealth } from "@/db/pgHealthMonitor.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resetCusEnts } from "@/internal/balances/utils/sql/client.js";
import type { ProcessResetResult } from "../resetCustomerEntitlements/processReset.js";
import { processReset } from "../resetCustomerEntitlements/processReset.js";
import { processResetResultToResetCusEntParam } from "../resetCustomerEntitlements/processResetResultToResetCusEntParam.js";
import {
	applyResetResultsToFullSubject,
	applyResetResultsToNormalized,
} from "./applyResetResultsToFullSubject.js";
import { getResettableCustomerEntitlements } from "./getResettableCustomerEntitlements.js";
import { resetSubjectCache } from "./resetSubjectCache.js";

/**
 * Lazily resets overdue customer entitlements from a FullSubject.
 * Same DB semantics as resetCustomerEntitlements but works on FullSubject.
 * Mutates the FullSubject in-memory and patches shared balance hashes.
 * Returns true if any entitlements were reset.
 */
export const lazyResetSubjectEntitlements = async ({
	ctx,
	fullSubject,
	normalized,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	normalized?: NormalizedFullSubject;
}): Promise<boolean> => {
	if (getDbHealth() === PgHealth.Degraded) return false;

	const now = Date.now();
	const { logger } = ctx;
	const customerId = fullSubject.customerId;

	const allCustomerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	const customerEntitlementsNeedingReset = getResettableCustomerEntitlements({
		customerEntitlements: allCustomerEntitlements,
		now,
	});

	if (customerEntitlementsNeedingReset.length === 0) return false;

	try {
		logger.info(
			`[lazyResetSubjectEntitlements] customer: ${customerId}, needing reset: ${customerEntitlementsNeedingReset.length}`,
		);

		const computed: Array<{
			customerEntitlementId: string;
			result: ProcessResetResult;
		}> = [];

		for (const customerEntitlement of customerEntitlementsNeedingReset) {
			const result = await processReset({
				cusEnt: customerEntitlement,
				ctx,
			});
			if (!result) continue;
			computed.push({
				customerEntitlementId: customerEntitlement.id,
				result,
			});
		}

		if (computed.length === 0) return false;

		const resets = computed.map(({ customerEntitlementId, result }) =>
			processResetResultToResetCusEntParam({
				customerEntitlementId,
				result,
			}),
		);

		const { applied, skipped } = await resetCusEnts({ ctx, resets });

		logger.info(
			`[lazyResetSubjectEntitlements] customer: ${customerId}, applied: ${Object.keys(applied).length}, skipped: ${skipped.length}`,
		);

		const clearingMap = await applyResetResultsToFullSubject({
			ctx,
			fullSubject,
			computed,
			skipped,
		});

		if (normalized) {
			applyResetResultsToNormalized({ normalized, computed });
		}

		if (Object.keys(applied).length > 0) {
			const oldNextResetAts: Record<string, number> = {};
			const customerEntitlementFeatureIds: Record<string, string> = {};

			for (const customerEntitlement of customerEntitlementsNeedingReset) {
				if (customerEntitlement.next_reset_at) {
					oldNextResetAts[customerEntitlement.id] =
						customerEntitlement.next_reset_at;
				}
				customerEntitlementFeatureIds[customerEntitlement.id] =
					customerEntitlement.feature_id;
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
				`[lazyResetSubjectEntitlements] customer: ${customerId}, subject cache updated`,
			);
		}

		return true;
	} catch (error) {
		logger.error(
			`[lazyResetSubjectEntitlements] customer: ${customerId}, failed: ${error}`,
		);
		Sentry.captureException(error);
		return false;
	}
};
