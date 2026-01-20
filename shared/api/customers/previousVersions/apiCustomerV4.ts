import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusExpandSchema } from "../components/apiCusExpand.js";
import { ApiBalanceV0Schema } from "../cusFeatures/previousVersions/apiBalanceV0.js";
import { ApiSubscriptionV0Schema } from "../cusPlans/previousVersions/apiSubscriptionV0.js";

export const BaseApiCustomerV4Schema = z.object({
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
	subscriptions: z.array(ApiSubscriptionV0Schema),
	scheduled_subscriptions: z.array(ApiSubscriptionV0Schema),
	balances: z.record(z.string(), ApiBalanceV0Schema),
});

export const ApiCustomerV4Schema = BaseApiCustomerV4Schema.extend(
	ApiCusExpandSchema.shape,
);

export type ApiCustomer = z.infer<typeof ApiCustomerV4Schema>;
export type BaseApiCustomerV4 = z.infer<typeof BaseApiCustomerV4Schema>;
