import { z } from "zod/v4";
import { ApiCusExpandSchema } from "./apiCustomer.js";
import { BaseApiCustomerSchema } from "./baseApiCustomer.js";
import { ApiBalanceV1Schema } from "./cusFeatures/apiBalanceV1.js";
import {
	ApiPurchaseV0Schema,
	ApiSubscriptionV1Schema,
} from "./cusPlans/apiSubscriptionV1.js";

// V5 base customer - uses V1 subscriptions (single array with status field) and V1 balances
export const BaseApiCustomerV5Schema = BaseApiCustomerSchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema),
	purchases: z.record(z.string(), ApiPurchaseV0Schema),
	balances: z.record(z.string(), ApiBalanceV1Schema),
});

export const ApiCustomerV5Schema = BaseApiCustomerV5Schema.extend(
	ApiCusExpandSchema.shape,
);

export type ApiCustomerV5 = z.infer<typeof ApiCustomerV5Schema>;
export type BaseApiCustomerV5 = z.infer<typeof BaseApiCustomerV5Schema>;
