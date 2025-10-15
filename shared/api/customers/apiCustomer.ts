import { ApiCusReferralSchema } from "@api/customers/components/apiCusReferral.js";
import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiBaseEntitySchema } from "@api/entities/apiEntity.js";
import { ApiCusRewardsSchema } from "@api/others/apiDiscount.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusUpcomingInvoiceSchema } from "./components/apiCusUpcomingInvoice.js";
import { ApiCusProductSchema } from "./cusProducts/apiCusProduct.js";

export const ApiTrialsUsedSchema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export const ApiCusExpandSchema = z.object({
	invoices: z.array(ApiInvoiceSchema).optional(),
	entities: z.array(ApiBaseEntitySchema).optional(),
	trials_used: z.array(ApiTrialsUsedSchema).optional(),
	rewards: ApiCusRewardsSchema.nullish(),
	referrals: z.array(ApiCusReferralSchema).optional(),
	upcoming_invoice: ApiCusUpcomingInvoiceSchema.nullish(),
	payment_method: z.any().nullish(),
});

export const ApiCustomerSchema = z.object({
	// Internal fields
	id: z.string().nullable().meta({
		description: "Your internal ID for the customer",
		example: "cus_123",
	}),
	created_at: z.number().meta({
		description: "Timestamp of customer creation in milliseconds since epoch",
		example: 1717000000,
	}),
	name: z.string().nullable().meta({
		description: "Customer’s name",
		example: "John Doe",
	}),
	email: z.string().nullable().meta({
		description: "Customer’s email address",
		example: "john@doe.com",
	}),
	fingerprint: z.string().nullable().meta({
		description:
			"Unique identifier (eg. serial number) to detect duplicate customers and prevent key leaks",
		example: "fp_9184And92839123hda",
	}),
	stripe_id: z.string().nullable().default(null).meta({
		description: "Stripe customer ID",
		example: "cus_J8A5c31A8tlpwN",
	}),
	env: z.enum(AppEnv).meta({
		description: "Environment the customer is in",
		example: "production",
	}),
	metadata: z.record(z.any(), z.any()).default({}),
	products: z.array(ApiCusProductSchema).meta({
		description: "List of products the customer has access to",
		example: [],
	}),
	features: z.record(z.string(), ApiCusFeatureSchema).meta({
		description: "List of features the customer has access to",
		example: {},
	}),
	...ApiCusExpandSchema.shape,
});

export type ApiCustomer = z.infer<typeof ApiCustomerSchema>;
export type ApiCustomerExpand = z.infer<typeof ApiCusExpandSchema>;
