import type { FullCustomer, FullCustomerEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import type { ProcessResetResult } from "./processReset.js";

/** Find a cusEnt on the FullCustomer by ID. */
const findCusEnt = ({
	fullCus,
	cusEntId,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
}): FullCustomerEntitlement | null => {
	for (const cusProduct of fullCus.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (cusEnt.id === cusEntId) return cusEnt;
		}
	}
	for (const cusEnt of fullCus.extra_customer_entitlements || []) {
		if (cusEnt.id === cusEntId) return cusEnt;
	}
	return null;
};

/**
 * Applies computed reset values to in-memory FullCustomer for all cusEnts,
 * and runs rollover max-clearing only for DB-applied (non-skipped) ones.
 * For skipped entries (another request won the race), re-reads rollovers from DB.
 */
export const applyResetResults = async ({
	ctx,
	fullCus,
	computed,
	skipped,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	computed: Array<{ cusEntId: string; result: ProcessResetResult }>;
	skipped: string[];
}): Promise<void> => {
	const { db } = ctx;
	const skippedSet = new Set(skipped);

	for (const { cusEntId, result } of computed) {
		const original = findCusEnt({ fullCus, cusEntId });
		if (!original) continue;

		const { updates } = result;
		if (updates.balance !== null) original.balance = updates.balance;
		if (updates.additional_balance !== null)
			original.additional_balance = updates.additional_balance;
		original.adjustment = updates.adjustment;
		if (updates.entities !== null) original.entities = updates.entities;
		original.next_reset_at = updates.next_reset_at;

		if (!result.rolloverInsert) continue;

		if (!skippedSet.has(cusEntId)) {
			// Winner: we inserted the rollover into DB. Clear excess and
			// update the in-memory array to include the new rollovers.
			const clearedRollovers = await RolloverService.clearExcessRollovers({
				db,
				newRows: result.rolloverInsert.rows,
				fullCusEnt: original,
			});
			original.rollovers = clearedRollovers;
		} else {
			// Loser: the winning request already inserted the rollover and
			// cleared excess. Re-read from DB to get the authoritative state.
			original.rollovers = await RolloverService.getCurrentRollovers({
				db,
				cusEntID: cusEntId,
			});
		}
	}
};
