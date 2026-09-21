import { CusProductStatus } from "@autumn/shared";
import { z } from "zod/v4";

export const AddBatchResultSchema = z.object({
	candidates: z.array(z.object({ customerProductId: z.string() })),
	excludedInternalCustomerIds: z.array(z.string()),
	insertedItems: z.array(
		z.object({
			internalCustomerId: z.string(),
			customerProductId: z.string(),
			entityId: z.string().nullable(),
			planId: z.string(),
			featureId: z.string(),
			granted: z.number().nullable(),
			remaining: z.number().nullable().optional(),
			unlimited: z.boolean(),
			nextResetAt: z.number().nullable(),
			status: z.enum(CusProductStatus),
			startsAt: z.number().nullable(),
			canceledAt: z.number().nullable(),
			endedAt: z.number().nullable(),
			trialEndsAt: z.number().nullable(),
		}),
	),
});
