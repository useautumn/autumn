import { CusProductStatus } from "@autumn/shared";
import { z } from "zod/v4";

/** What SQL read about a row's product and owner, so the worker can tell whether it holds the row and check it. */
export const HeldRowSchema = z.object({
	internalCustomerId: z.string(),
	ownerInternalEntityId: z.string().nullable(),
	ownerEntityId: z.string().nullable(),
	status: z.enum(CusProductStatus),
	internalProductId: z.string(),
	productIsCustom: z.boolean(),
	customerPriceIds: z.array(z.string()),
	productLoadedByWorker: z.boolean(),
});

export type HeldRow = z.infer<typeof HeldRowSchema>;
