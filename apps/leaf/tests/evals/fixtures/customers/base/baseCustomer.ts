import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiBalanceV1 } from "@api/customers/cusFeatures/apiBalanceV1.js";
import type { ApiSubscriptionV1 } from "@api/customers/cusPlans/apiSubscriptionV1.js";
import { AppEnv } from "@models/genModels/genEnums.js";

const defaultCreatedAt = new Date("2026-01-01T00:00:00.000Z");

/** Base customer API fixture; prefer presets unless you need direct shape control. */
export const baseCustomer = ({
	balances = {},
	createdAt = defaultCreatedAt,
	email = "billing@example.com",
	id = "customer_active",
	name = "Active Customer",
	subscriptions = [],
}: {
	id?: string | null;
	name?: string | null;
	email?: string | null;
	createdAt?: Date;
	subscriptions?: ApiSubscriptionV1[];
	balances?: Record<string, ApiBalanceV1>;
} = {}): BaseApiCustomerV5 => ({
	balances,
	billing_controls: {},
	config: { disable_pooled_balance: false },
	created_at: createdAt.getTime(),
	env: AppEnv.Sandbox,
	id,
	email,
	fingerprint: null,
	flags: {},
	metadata: {},
	name,
	purchases: [],
	send_email_receipts: false,
	stripe_id: null,
	subscriptions,
});
