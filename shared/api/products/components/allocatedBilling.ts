import { AllocatedBillingBehavior } from "@models/productV2Models/productItemModels/productItemEnums.js";
import { z } from "zod/v4";

/** Wire names for AllocatedBillingBehavior; the legacy value says so in its name. */
export enum AllocatedBilling {
	Arrear = "arrear",
	ProratedLegacy = "prorated_legacy",
}

/**
 * Only meaningful on an allocated (non-consumable) usage_based price. Responses
 * carry it only for the legacy shape; new prices default to `arrear`, so
 * omitting it on an update is how a legacy price is migrated. Internal: atmn
 * needs it to round-trip legacy catalogs, but it is not a public knob.
 */
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

/** Only the legacy shape is surfaced; `arrear` is the default and stays implicit. */
export const behaviorToAllocatedBilling = (
	value: AllocatedBillingBehavior | null | undefined,
): AllocatedBilling | undefined =>
	value === AllocatedBillingBehavior.Prorated
		? AllocatedBilling.ProratedLegacy
		: undefined;
