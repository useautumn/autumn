import type {
	FullCustomer,
	FullCustomerEntitlement,
	Rollover,
} from "@autumn/shared";
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
	const clearingPromises: Promise<Rollover[]>[] = [];

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

		// Only run rollover clearing for DB-applied entries.
		// Skipped entries were already cleared by the winning request.
		if (!skippedSet.has(cusEntId) && result.rolloverInsert) {
			clearingPromises.push(
				RolloverService.clearExcessRollovers({
					db,
					newRows: result.rolloverInsert.rows,
					fullCusEnt: original,
				}),
			);
		}
	}

	if (clearingPromises.length > 0) {
		await Promise.all(clearingPromises);
	}
};
