import { ApiTrialsUsedV1Schema } from "@api/customers/components/apiTrialsUsed/apiTrialsUsedV1";
import {
	ApiBaseEntitySchema,
	ApiCusReferralSchema,
	ApiCusRewardsSchema,
	ApiInvoiceV1Schema,
} from "@api/models";
import z from "zod/v4";

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceV1Schema).optional(),
	entities: z.array(ApiBaseEntitySchema).optional(),
	trials_used: z.array(ApiTrialsUsedV1Schema).optional(),
	rewards: ApiCusRewardsSchema.nullish(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	payment_method: z.any().nullish(),
});

export type ApiCusExpand = z.infer<typeof ApiCusExpandSchema>;
