import {
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	type PgDeductionUpdate,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService";

export const rollbackDeduction = async ({
	ctx,
	oldFullCus,
	updates,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	updates: Record<string, PgDeductionUpdate>;
}) => {
	const { db, logger } = ctx;

	logger.warn(
		`[ROLLBACK] Starting rollback for ${Object.keys(updates).length} entitlements`,
	);

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: oldFullCus,
	});

	// For each updated entitlement, restore to original state from oldFullCus
	for (const cusEntId of Object.keys(updates)) {
		try {
			// Find the original cusEnt from oldFullCus
			const originalCusEnt = cusEnts.find((ce) => ce.id === cusEntId);

			if (!originalCusEnt) {
				logger.error(
					`[ROLLBACK] Could not find original cusEnt ${cusEntId} in oldFullCus`,
				);
				continue;
			}

			// Restore the entitlement to original values
			await CusEntService.update({
				db,
				id: cusEntId,
				updates: {
					balance: originalCusEnt.balance,
					additional_balance: originalCusEnt.additional_balance,
					adjustment: originalCusEnt.adjustment,
					entities: originalCusEnt.entities,
				},
			});

			logger.info(
				`[ROLLBACK] Successfully restored cusEnt ${cusEntId} to original state`,
			);
		} catch (error) {
			// Best effort - log error but continue with other rollbacks
			logger.error(
				`[ROLLBACK] Failed to rollback cusEnt ${cusEntId}: ${error}`,
			);
		}
	}

	logger.warn("[ROLLBACK] Rollback completed");
};
