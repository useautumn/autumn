import {
	type FullSubject,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "@/internal/balances/utils/types/deductionUpdate.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

/** Rolls back deduction updates by restoring original entitlement values (FullSubject version). */
export const rollbackDeductionV2 = async ({
	ctx,
	oldFullSubject,
	updates,
}: {
	ctx: AutumnContext;
	oldFullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
}) => {
	const { logger } = ctx;

	logger.warn(
		`[ROLLBACK] Starting rollback for ${Object.keys(updates).length} entitlements`,
	);

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject: oldFullSubject,
	});

	for (const customerEntitlementId of Object.keys(updates)) {
		try {
			const originalCustomerEntitlement = customerEntitlements.find(
				(customerEntitlement) =>
					customerEntitlement.id === customerEntitlementId,
			);

			if (!originalCustomerEntitlement) {
				logger.error(
					`[ROLLBACK] Could not find original cusEnt ${customerEntitlementId} in oldFullSubject`,
				);
				continue;
			}

			await CusEntService.update({
				ctx,
				id: customerEntitlementId,
				updates: {
					balance: originalCustomerEntitlement.balance ?? 0,
					additional_balance: originalCustomerEntitlement.additional_balance,
					adjustment: originalCustomerEntitlement.adjustment,
					entities: originalCustomerEntitlement.entities,
				},
			});

			logger.info(
				`[ROLLBACK] Successfully restored cusEnt ${customerEntitlementId} to original state`,
			);
		} catch (error) {
			logger.error(
				`[ROLLBACK] Failed to rollback cusEnt ${customerEntitlementId}: ${error}`,
			);
		}
	}

	// Postgres is authoritative again, so the cached balances — which still hold
	// the rolled-back deduction (the Redis path deducted in the cache; the
	// Postgres path publishes to it before its allocated-invoice round trip) —
	// must be dropped. Left in place they would be flushed back into Postgres by
	// the next invalidation, resurrecting a deduction that was undone.
	// flushBalances stays false: flushing here is precisely what must not happen.
	// Never let this mask the error the caller is about to rethrow.
	try {
		await invalidateCachedFullSubject({
			ctx,
			customerId: oldFullSubject.customerId,
			entityId: oldFullSubject.entityId,
			source: "rollbackDeductionV2",
			flushBalances: false,
		});
	} catch (error) {
		logger.error(
			`[ROLLBACK] Failed to invalidate cached balances after rollback: ${error}`,
		);
	}

	logger.warn("[ROLLBACK] Rollback completed");
};
