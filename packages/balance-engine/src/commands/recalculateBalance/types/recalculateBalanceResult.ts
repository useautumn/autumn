import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

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
				.loose(),
		),
	})
	.loose();

export type RecalculateBalanceResult = z.infer<
	typeof recalculateBalanceResultSchema
>;
