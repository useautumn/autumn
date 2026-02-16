import { z } from "zod/v4";
import { ApiCusExpandSchema } from "./apiCustomer.js";
import { BaseApiCustomerSchema } from "./baseApiCustomer.js";
import { ApiBalanceV1Schema } from "./cusFeatures/apiBalanceV1.js";
import {
	ApiPurchaseV0Schema,
	ApiSubscriptionV1Schema,
} from "./cusPlans/apiSubscriptionV1.js";

export const API_CUSTOMER_V5_EXAMPLE = {
	id: "cus_123",
	created_at: 1717000000,
	name: "John Doe",
	email: "john@example.com",
	fingerprint: "1234567890",
	stripe_id: "cus_123",
	env: "sandbox",
	metadata: {},
	subscriptions: [
		{
			id: "sub_123",
			created_at: 1717000000,
			plan_id: "plan_123",
			status: "active",
			quantity: 1,
			interval: "month",
			interval_count: 1,
		},
	],
	purchases: [],
	balances: {
		balance_1: {
			id: "balance_1",
			amount: 100,
			currency: "USD",
			created_at: 1717000000,
			updated_at: 1717000000,
		},
	},
};

// V5 base customer - uses V1 subscriptions (single array with status field) and V1 balances
export const BaseApiCustomerV5Schema = BaseApiCustomerSchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema),
	purchases: z.array(ApiPurchaseV0Schema),
	balances: z.record(z.string(), ApiBalanceV1Schema),
});

export const ApiCustomerV5Schema = BaseApiCustomerV5Schema.extend(
	ApiCusExpandSchema.shape,
).meta({
	examples: [API_CUSTOMER_V5_EXAMPLE],
});

export type ApiCustomerV5 = z.infer<typeof ApiCustomerV5Schema>;
export type BaseApiCustomerV5 = z.infer<typeof BaseApiCustomerV5Schema>;
