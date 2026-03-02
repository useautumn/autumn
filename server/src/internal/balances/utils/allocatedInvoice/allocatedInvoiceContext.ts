import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

export interface AllocatedInvoiceContext extends BillingContext {
	customerEntitlement: FullCusEntWithFullCusProduct; // Contains OLD customer entitlement (no balance changes, from before track)
	updatedCustomerEntitlement: FullCusEntWithFullCusProduct; // Contains NEW customer entitlement (with balance changes, from after track)
	update: DeductionUpdate;

	previousUsage: number;
	newUsage: number;
	previousOverage: number;
	newOverage: number;
}
