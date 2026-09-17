import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import type { ThresholdCharge } from "./compute/computeThresholdCharge.js";

export interface ThresholdSettlementContext extends BillingContext {
	customerEntitlement: FullCusEntWithFullCusProduct;
	charge: ThresholdCharge;
}
