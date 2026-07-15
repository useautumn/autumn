import { z } from "zod/v4";
import { FullCustomerLicenseSchema } from "../../licenseModels/fullCustomerLicense.js";
import type { DbPlanLicense } from "../../licenseModels/planLicenseTable.js";
import { EntitlementSchema } from "../../productModels/entModels/entModels.js";
import { PriceSchema } from "../../productModels/priceModels/priceModels.js";

/** Everything one custom plan_license definition needs written. */
export const InsertPlanLicenseSpecSchema = z.object({
	row: z.custom<DbPlanLicense>(),
	// Only the rows the customize changed; unchanged items reuse stock rows.
	customPrices: z.array(PriceSchema),
	customEntitlements: z.array(EntitlementSchema),
	// Becomes the license_prices/license_entitlements junction rows: the row's
	// COMPLETE item set (stock refs included), non-empty only when customized.
	items: z.array(
		z.object({
			priceId: z.string().optional(),
			entitlementId: z.string().optional(),
		}),
	),
});
export type InsertPlanLicenseSpec = z.infer<typeof InsertPlanLicenseSpecSchema>;

/**
 * Everything a customer product transition means for one customer license:
 * the planted successor row adopts the outgoing pool's link and carried
 * counters (seats never repoint), and seats move onto the successor
 * definition's prices/entitlements.
 */
export const CustomerLicenseTransitionSchema = z.object({
	outgoingCustomerLicense: FullCustomerLicenseSchema,
	// The successor row planted under the incoming parent by init.
	incomingCustomerLicense: FullCustomerLicenseSchema,
	updates: z.object({
		linkId: z.string(),
		granted: z.number(),
		remaining: z.number(),
		paidQuantity: z.number(),
	}),
	priceTransitions: z.array(
		z.object({ fromPriceId: z.string(), toPriceId: z.string() }),
	),
	entitlementTransitions: z.array(
		z.object({ fromEntitlementId: z.string(), toEntitlementId: z.string() }),
	),
});
export type CustomerLicenseTransition = z.infer<
	typeof CustomerLicenseTransitionSchema
>;

/** An atomic capacity move on a pool: negative consumes (guarded at zero),
 * positive releases (capped at granted). Takes key the pool row; releases key
 * the seat's link anchor, which survives plan transitions. */
export const CustomerLicenseUpdateSchema = z.object({
	customerLicenseId: z.string().optional(),
	customerLicenseLinkId: z.string().nullish(),
	remainingChange: z.number(),
});
export type CustomerLicenseUpdate = z.infer<typeof CustomerLicenseUpdateSchema>;
