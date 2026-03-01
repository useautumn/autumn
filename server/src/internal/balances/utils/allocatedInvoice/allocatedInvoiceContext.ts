import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

export interface AllocatedInvoiceContext extends BillingContext {
	customerEntitlement: FullCusEntWithFullCusProduct;
	update: DeductionUpdate;

	previousUsage: number;
	newUsage: number;
	previousOverage: number;
	newOverage: number;
}
