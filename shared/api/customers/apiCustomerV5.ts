import { z } from "zod/v4";
import { ApiCusExpandSchema } from "./apiCustomer.js";
import { BaseApiCustomerSchema } from "./baseApiCustomer.js";
import { ApiBalanceSchema } from "./cusFeatures/apiBalance.js";
import { ApiSubscriptionV1Schema } from "./cusPlans/apiSubscriptionV1.js";

// V5 base customer - uses V1 subscriptions (single array with status field)
export const BaseApiCustomerV5Schema = BaseApiCustomerSchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema),
	balances: z.record(z.string(), ApiBalanceSchema),
});

export const ApiCustomerV5Schema = BaseApiCustomerV5Schema.extend(
	ApiCusExpandSchema.shape,
);

export type ApiCustomerV5 = z.infer<typeof ApiCustomerV5Schema>;
export type BaseApiCustomerV5 = z.infer<typeof BaseApiCustomerV5Schema>;
