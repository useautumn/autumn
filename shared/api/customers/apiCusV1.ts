import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
// import { AppEnv } from "../genModels/genEnums.js";
// import { RewardResponseSchema } from "../rewardModels/rewardModels/rewardResponseModels.js";
// import { CusProductResponseSchema } from "./cusResModels/cusProductResponse.js";
// import { CusReferralResponseSchema } from "./cusResModels/cusReferralsResponse.js";
// import { UpcomingInvoiceResponseSchema } from "./cusResModels/upcomingInvoiceResponse.js";
// import { EntityResponseSchema } from "./entityModels/entityResModels.js";
// import { InvoiceResponseSchema } from "./invoiceModels/invoiceResponseModels.js";

// export const TrialUsedResponseSchema = z.object({
// 	product_id: z.string().meta({
// 		description: "The ID of the product for which the trial was used",
// 		example: "prod_123",
// 	}),
// 	customer_id: z.string().meta({
// 		description: "The ID of the customer who used the trial",
// 		example: "cus_123",
// 	}),
// 	fingerprint: z.string().nullish().meta({
// 		description: "Device/browser fingerprint when the trial was used",
// 		example: "fp_1234567890abcdef",
// 	}),
// });

export const APICustomerSchema = z.object({
	id: z.string().nullable().meta({
		description: "Your internal ID for the customer",
		example: "cus_123",
	}),

	name: z.string().nullable().meta({
		description: "The customer's full name",
		example: "John Doe",
	}),

	email: z.string().nullable().meta({
		description: "The customer's email address",
		example: "john.doe@example.com",
	}),

	fingerprint: z.string().nullable().meta({
		description: "Unique device/browser fingerprint for the customer",
		example: "fp_1234567890abcdef",
	}),

	stripe_id: z.string().nullable().meta({
		description: "The customer's Stripe customer ID",
		example: "cus_1234567890abcdef",
	}),

	created_at: z.number().meta({
		description:
			"The date and time the customer was created in milliseconds since epoch",
		example: 1717000000,
	}),

	env: z.enum(AppEnv),

	// products: z.array(CusProductResponseSchema),
	// features: z.any(),
	// invoices: z.array(InvoiceResponseSchema).optional(),
	// trials_used: z.array(TrialUsedResponseSchema).optional(),
	// rewards: RewardResponseSchema.nullish(),
	// metadata: z.record(z.any(), z.any()).default({}),
	// entities: z.array(EntityResponseSchema).optional(),
	// referrals: z.array(CusReferralResponseSchema).optional(),
	// payment_method: z.any().nullish(),
	// upcoming_invoice: UpcomingInvoiceResponseSchema.nullish(),
});

// export const IntAPICustomer = CusResponseV2Schema.extend({
// 	autumn_id: z.string().nullish().meta({
// 		description: "Internal Autumn system ID for the customer",
// 		example: "autumn_cus_1234567890",
// 	}),
// });

export type APICustomer = z.infer<typeof APICustomerSchema>;
// export type CusProductResponse = z.infer<typeof CusProductResponseSchema>;
