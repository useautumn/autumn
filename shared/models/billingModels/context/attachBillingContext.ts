import type { FullCusProduct, FullProduct } from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext } from "./billingContext";

// Plan timing for attach operations
export const PlanTimingSchema = z.enum(["immediate", "end_of_cycle"]);
export type PlanTiming = z.infer<typeof PlanTimingSchema>;

// Checkout mode for attach operations
export const CheckoutModeSchema = z
	.enum(["stripe_checkout", "autumn_checkout"])
	.nullable();

export type CheckoutMode = z.infer<typeof CheckoutModeSchema>;

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

// export interface AttachBillingContextOverride {
// 	fullCustomer?: FullCustomer;

// 	stripeBillingContext?: StripeBillingContextOverride;

// 	productContext?: {
// 		attachProduct: FullProduct;
// 		customPrices?: Price[];
// 		customEnts?: Entitlement[];
// 	};

// 	// transitionContext?: {
// 	// 	currentCustomerProduct?: FullCusProduct;
// 	// 	scheduledCustomerProduct?: FullCusProduct;
// 	// 	planTiming: PlanTiming;
// 	// };

// 	featureQuantities?: FeatureOptions[];
// 	transitionConfigs?: TransitionConfig[];
// 	billingVersion?: BillingVersion;
// }
