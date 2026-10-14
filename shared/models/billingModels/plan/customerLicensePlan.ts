import { z } from "zod/v4";
import { CarryOverUsagesSchema } from "../../../api/billing/common/carryOverUsages.js";
import { FullCustomerLicenseSchema } from "../../licenseModels/fullCustomerLicense.js";
import type { DbPlanLicense } from "../../licenseModels/planLicenseTable.js";
import { EntitlementSchema } from "../../productModels/entModels/entModels.js";
import { PriceSchema } from "../../productModels/priceModels/priceModels.js";

export const InsertPlanLicenseSpecSchema = z.object({
	row: z.custom<DbPlanLicense>(),
	customPrices: z.array(PriceSchema),
	customEntitlements: z.array(EntitlementSchema),
	items: z.array(
		z.object({
			priceId: z.string().optional(),
			entitlementId: z.string().optional(),
		}),
	),
});
export type InsertPlanLicenseSpec = z.infer<typeof InsertPlanLicenseSpecSchema>;

export const CustomerLicenseTransitionSchema = z.object({
	outgoingCustomerLicense: FullCustomerLicenseSchema,
	incomingCustomerLicense: FullCustomerLicenseSchema,
	updates: z.object({
		linkId: z.string(),
		granted: z.number(),
		remaining: z.number(),
		paidQuantity: z.number(),
	}),
	carryOverUsages: CarryOverUsagesSchema,
	billingCycleAnchorMs: z.number().optional(),
});
export type CustomerLicenseTransition = z.infer<
	typeof CustomerLicenseTransitionSchema
>;

export const CustomerLicenseUpdateSchema = z.object({
	customerLicenseId: z.string().optional(),
	customerLicenseLinkId: z.string().nullish(),
	remainingChange: z.number(),
	paidQuantity: z.number().optional(),
});
export type CustomerLicenseUpdate = z.infer<typeof CustomerLicenseUpdateSchema>;
