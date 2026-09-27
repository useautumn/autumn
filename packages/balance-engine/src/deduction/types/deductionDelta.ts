import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../models/common/primitives.js";

/** One balance moved once. Negative balanceDelta is a deduction, positive a refund. On the log as part of a track's result. */
export const deductionDeltaSchema = z
	.object({
		table: z.enum(["customerEntitlements", "rollovers"]),
		id: nonEmptyStringSchema,
		/** Which balance on the row moved: the key in its `entities` map, or null for the `balance` column. */
		entityKey: nonEmptyStringSchema.nullable(),
		/** In the row's own units: what its balance column moved. */
		balanceDelta: finiteNumberSchema,
		/** Rollovers count usage as they drain; rows derive usage from balance. */
		usageDelta: finiteNumberSchema,
		/** In the tracked feature's units: what of the caller's value this delta covered. */
		valueDelta: finiteNumberSchema,
		creditCost: finiteNumberSchema,
		/** Units and credits this delta charged to the owning row's rate card, when it has one. */
		usageAttributionDelta: z
			.object({
				customerEntitlementId: nonEmptyStringSchema,
				key: nonEmptyStringSchema,
				units: finiteNumberSchema,
				credits: finiteNumberSchema,
			})
			.strict()
			.optional(),
	})
	.strict();

export type DeductionDelta = z.infer<typeof deductionDeltaSchema>;
