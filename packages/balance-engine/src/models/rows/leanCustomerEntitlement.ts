import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../common/primitives.js";

const balanceResetSchema = z
	.object({
		interval: z.enum([
			"one_off",
			"minute",
			"hour",
			"day",
			"week",
			"month",
			"quarter",
			"semi_annual",
			"year",
		]),
		intervalCount: z.number().int().positive(),
		nextResetAt: timestampSchema.nullable(),
	})
	.strict();

export const leanCustomerEntitlementSchema = z
	.object({
		id: nonEmptyStringSchema,
		externalId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		balance: finiteNumberSchema,
		usage: finiteNumberSchema.nonnegative(),
		granted: finiteNumberSchema,
		planId: nonEmptyStringSchema.nullable(),
		reset: balanceResetSchema.nullable(),
		expiresAt: timestampSchema.nullable(),
	})
	.strict();

export type LeanCustomerEntitlement = z.infer<
	typeof leanCustomerEntitlementSchema
>;
