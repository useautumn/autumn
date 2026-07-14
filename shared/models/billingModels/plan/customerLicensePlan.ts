import { z } from "zod/v4";
import { FullCustomerLicenseSchema } from "../../licenseModels/fullCustomerLicense.js";

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

export const LicenseOpSchema = z.object({
	op: z.enum(["take", "release"]),
	internalCustomerId: z.string(),
	parentCustomerProductId: z.string(),
	licenseInternalProductId: z.string(),
	// The plan_license the pool instantiates, stamped when the pool is upserted.
	planLicenseId: z.string().optional(),
	granted: z.number(),
	entityId: z.string().optional(),
	// take: the provisioned seat row to stamp with the pool link at execute time.
	customerProductId: z.string().optional(),
	// release: the seat's link anchor — survives plan transitions, the parent
	// pair does not.
	customerLicenseLinkId: z.string().nullish(),
});
export type LicenseOp = z.infer<typeof LicenseOpSchema>;
