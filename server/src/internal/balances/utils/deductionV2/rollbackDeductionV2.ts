import {
	type FullSubject,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "@/internal/balances/utils/types/deductionUpdate.js";
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

	logger.warn("[ROLLBACK] Rollback completed");
};
