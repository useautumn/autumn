import { ApiCusExpandSchema } from "@api/customers/apiCustomer.js";
import { ApiSubscriptionV1Schema } from "@api/customers/cusPlans/apiSubscriptionV1.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "./cusFeatures/apiBalanceV1.js";

export const BaseApiCustomerV5Schema = z
	.object({
		autumn_id: z.string().optional().meta({
			internal: true,
		}),
		id: z.string().nullable(),
		name: z.string().nullable(),
		email: z.string().nullable(),
		created_at: z.number(),
		fingerprint: z.string().nullable(),
		stripe_id: z.string().nullable(),
		env: z.enum(AppEnv),
		metadata: z.record(z.any(), z.any()),
		subscriptions: z.array(ApiSubscriptionV1Schema),
		purchases: z.record(z.any(), z.any()),
		balances: z.record(z.string(), ApiBalanceV1Schema),
	})
	.meta({
		id: "BaseCustomer",
	});

export const ApiCustomerV5Schema = BaseApiCustomerV5Schema.extend(
	ApiCusExpandSchema.shape,
);

export type ApiCustomerV5 = z.infer<typeof ApiCustomerV5Schema>;
export type BaseApiCustomerV5 = z.infer<typeof BaseApiCustomerV5Schema>;
