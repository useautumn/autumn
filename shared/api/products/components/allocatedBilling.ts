import { AllocatedBillingBehavior } from "@models/productV2Models/productItemModels/productItemEnums.js";
import { z } from "zod/v4";

export enum AllocatedBilling {
	Arrear = "arrear",
	ProratedLegacy = "prorated_legacy",
}

export const AllocatedBillingFieldSchema = z
	.enum(AllocatedBilling)
	.optional()
	.meta({
		internal: true,
		description:
			"How an allocated usage_based price bills mid-cycle quantity changes. 'arrear' (default) bills at period end. 'prorated_legacy' is only returned for prices still on the legacy immediate-proration behavior; omit it to migrate the price to 'arrear'.",
	});

const TO_BEHAVIOR: Record<AllocatedBilling, AllocatedBillingBehavior> = {
	[AllocatedBilling.Arrear]: AllocatedBillingBehavior.Arrear,
	[AllocatedBilling.ProratedLegacy]: AllocatedBillingBehavior.Prorated,
};

export const allocatedBillingToBehavior = (
	value: AllocatedBilling | undefined,
): AllocatedBillingBehavior | undefined =>
	value === undefined ? undefined : TO_BEHAVIOR[value];

export const behaviorToAllocatedBilling = (
	value: AllocatedBillingBehavior | null | undefined,
): AllocatedBilling | undefined =>
	value === AllocatedBillingBehavior.Prorated
		? AllocatedBilling.ProratedLegacy
		: undefined;
