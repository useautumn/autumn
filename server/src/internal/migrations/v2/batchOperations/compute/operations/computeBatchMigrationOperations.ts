import type { EntitlementPrice } from "@autumn/shared";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { BatchMigrationAddEntitlementOp } from "../../types/index.js";

/** Lowers the diff's free added entitlement prices into batch add operations.
 * Paid pairs are skipped — the transition-eligibility guard rejects them. */
export const computeBatchMigrationOperations = ({
	addedEntitlementPrices,
}: {
	addedEntitlementPrices: EntitlementPrice[];
}): BatchMigrationAddEntitlementOp[] =>
	addedEntitlementPrices
		.filter((entitlementPrice) => !entitlementPrice.price)
		.map((entitlementPrice) => ({
			type: "add",
			entitlementPrice,
			initialState: computeCustomerEntitlementInitialState({
				entitlement: entitlementPrice.entitlement,
			}),
		}));
