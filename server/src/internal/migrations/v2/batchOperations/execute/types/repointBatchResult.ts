import { CusProductStatus } from "@autumn/shared";
import { z } from "zod/v4";

export const RepointBatchResultSchema = z.object({
	rows: z.array(
		z.object({
			customerProductId: z.string(),
			internalCustomerId: z.string(),
			entityId: z.string().nullable(),
			status: z.enum(CusProductStatus),
			startsAt: z.number().nullable(),
			canceledAt: z.number().nullable(),
			endedAt: z.number().nullable(),
			trialEndsAt: z.number().nullable(),
		}),
	),
});
