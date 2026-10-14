import { z } from "zod/v4";
import { openEnum } from "../../models/common/openSchema.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../models/common/primitives.js";

export const deductionDeltaSchema = z
	.object({
		table: openEnum({
			name: "deductionDelta.table",
			values: ["customerEntitlements", "rollovers"],
		}),
		id: nonEmptyStringSchema,
		entityKey: nonEmptyStringSchema.nullable(),
		balanceDelta: finiteNumberSchema,
		usageDelta: finiteNumberSchema,
		valueDelta: finiteNumberSchema,
		creditCost: finiteNumberSchema,
		usageAttributionDelta: z
			.object({
				customerEntitlementId: nonEmptyStringSchema,
				key: nonEmptyStringSchema,
				units: finiteNumberSchema,
				credits: finiteNumberSchema,
			})
			.loose()
			.optional(),
	})
	.loose();

export type DeductionDelta = z.infer<typeof deductionDeltaSchema>;
