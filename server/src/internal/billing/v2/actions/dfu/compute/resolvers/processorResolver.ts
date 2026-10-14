import { type FlashBillable, ProcessorType } from "@autumn/shared";

export const resolveProcessorType = (
	processor: FlashBillable["processor"],
): ProcessorType | undefined =>
	processor === "revenuecat" ? ProcessorType.RevenueCat : undefined;
