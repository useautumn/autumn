import type { FullCustomer } from "@autumn/shared";
import type { RolloverUpdate } from "../types/redisDeductionResult.js";

/**
 * Apply rollover updates to the in-memory FullCustomer object.
 * Updates balance, usage, and entities for each modified rollover.
 */
export const applyRolloverUpdatesToFullCustomer = ({
	fullCus,
	rolloverUpdates,
}: {
	fullCus: FullCustomer;
	rolloverUpdates: Record<string, RolloverUpdate>;
}) => {
	if (!rolloverUpdates || Object.keys(rolloverUpdates).length === 0) {
		return;
	}

	for (const cusProduct of fullCus.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (!cusEnt.rollovers) continue;

			for (const rollover of cusEnt.rollovers) {
				const update = rolloverUpdates[rollover.id];
				if (!update) continue;

				rollover.balance = update.balance;
				rollover.usage = update.usage;
				rollover.entities = update.entities;
			}
		}
	}
};
