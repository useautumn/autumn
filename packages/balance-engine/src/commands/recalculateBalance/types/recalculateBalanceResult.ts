import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

/** Each grant's remaining before and after; the total usage moved between them. The preview answers with it too. */
export const recalculateBalanceResultSchema = z
	.object({
		type: z.literal("recalculateBalance"),
		totalUsage: finiteNumberSchema,
		customerEntitlements: z.array(
			z
				.object({
					customerEntitlementId: nonEmptyStringSchema,
					beforeRemaining: finiteNumberSchema,
					afterRemaining: finiteNumberSchema,
				})
				.strict(),
		),
	})
	.loose();

export type RecalculateBalanceResult = z.infer<
	typeof recalculateBalanceResultSchema
>;
