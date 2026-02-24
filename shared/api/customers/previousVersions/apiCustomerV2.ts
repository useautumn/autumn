import { ApiCusReferralSchema } from "@api/customers/components/apiCusReferral";
import { ApiCusUpcomingInvoiceSchema } from "@api/customers/components/apiCusUpcomingInvoice";
import { ApiTrialsUsedV0Schema } from "@api/customers/components/apiTrialsUsed/prevVersions/apiTrialsUsedV0";
import { ApiCusFeatureV2Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV2";
import { ApiCusProductV2Schema } from "@api/customers/cusPlans/previousVersions/apiCusProductV2";
import { ApiBaseEntitySchema } from "@api/entities/apiBaseEntity";
import { ApiInvoiceV0Schema } from "@api/others/apiInvoice/prevVersions/apiInvoiceV0";
import { AppEnv } from "@models/genModels/genEnums";

import { z } from "zod/v4";
import { ApiCusRewardsSchema } from "../../others/apiDiscount";

/**
 * ApiCustomerV2Schema - Customer response format for API V1.1+ (merged format)
 *
 *
 * Key differences from V1:
 * - Merged structure (everything in one object)
 * - Uses "features" instead of "entitlements"
 * - Features are ApiCusFeatureV2 (with usage/included_usage fields)
 * - Products are ApiCusProductV2 (with items field)
 * - Invoices require explicit expand parameter
 */
export const ApiCustomerV2Schema = z.object({
	// Internal fields
	autumn_id: z.string().nullish(),

	id: z.string().nullable().meta({
		description: "Your internal ID for the customer",
		example: "cus_123",
	}),

	created_at: z.number().meta({
		description:
			"The date and time the customer was created in milliseconds since epoch",
		example: 1717000000,
	}),

	name: z.string().nullable(),
	email: z.string().nullable(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable().default(null),
	env: z.enum(AppEnv),

	products: z.array(ApiCusProductV2Schema),
	features: z.array(ApiCusFeatureV2Schema),
	invoices: z.array(ApiInvoiceV0Schema).optional(),
	trials_used: z.array(ApiTrialsUsedV0Schema).optional(),

	rewards: ApiCusRewardsSchema.nullish(),
	metadata: z.record(z.any(), z.any()).default({}),
	entities: z.array(ApiBaseEntitySchema).optional(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	upcoming_invoice: ApiCusUpcomingInvoiceSchema.nullish(),
	payment_method: z.any().nullish(),
});

export type ApiCustomerV2 = z.infer<typeof ApiCustomerV2Schema>;
