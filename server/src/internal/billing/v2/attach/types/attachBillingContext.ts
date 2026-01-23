import type {
	CheckoutMode,
	FullCusProduct,
	FullProduct,
	PlanTiming,
} from "@autumn/shared";
import type { BillingContext } from "../../billingContext";

export interface AttachBillingContext extends BillingContext {
	// The product being attached
	attachProduct: FullProduct;

	// Transition context (only for main recurring products)
	currentCustomerProduct?: FullCusProduct; // To transition from
	scheduledCustomerProduct?: FullCusProduct; // To delete

	// Timing
	planTiming: PlanTiming;
	endOfCycleMs?: number; // Only needed if planTiming === "end_of_cycle"

	// Checkout
	checkoutMode: CheckoutMode;
}
