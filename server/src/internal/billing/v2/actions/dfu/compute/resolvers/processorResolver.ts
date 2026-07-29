import { type FlashBillable, ProcessorType } from "@autumn/shared";

/**
 * Maps a billable's processor tag to the customer_product `processor.type`
 * override. Stripe leaves the default (unwritten), RevenueCat stamps explicitly.
 */
export const resolveProcessorType = (
	processor: FlashBillable["processor"],
): ProcessorType | undefined =>
	processor === "revenuecat" ? ProcessorType.RevenueCat : undefined;
