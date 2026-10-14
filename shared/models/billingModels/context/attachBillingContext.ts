import type {
	FullCusProduct,
	FullProduct,
	InsertPlanLicenseSpec,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext } from "./billingContext";

export const PlanTimingSchema = z.enum(["immediate", "end_of_cycle"]).meta({
	title: "PlanSchedule",
	description:
		"When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle.",
});
export type PlanTiming = z.infer<typeof PlanTimingSchema>;

export const CheckoutModeSchema = z
	.enum(["stripe_checkout", "autumn_checkout"])
	.nullable();

export type CheckoutMode = z.infer<typeof CheckoutModeSchema>;

export interface AttachBillingContext extends BillingContext {
	attachProduct: FullProduct;

	currency?: string;

	currentCustomerProduct?: FullCusProduct;
	scheduledCustomerProduct?: FullCusProduct;
	carryOverSourceCustomerProduct?: FullCusProduct;

	licenseTransitionSourceCustomerProduct?: FullCusProduct;

	planTiming: PlanTiming;
	endOfCycleMs?: number;
	checkoutMode: CheckoutMode;

	externalId?: string;

	insertPlanLicenses?: InsertPlanLicenseSpec[];
}
