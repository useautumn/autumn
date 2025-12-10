// RevenueCat Webhook Event Types

export type RevCatExperiment = {
	experiment_id: string;
	experiment_variant: string;
	enrolled_at_ms: number;
};

export type RevCatSubscriberAttribute = {
	updated_at_ms: number;
	value: string;
};

export type RevCatEvent = {
	event_timestamp_ms: number;
	product_id: string;
	period_type: "NORMAL" | "INTRO" | "TRIAL";
	purchased_at_ms: number;
	expiration_at_ms: number;
	environment: "PRODUCTION" | "SANDBOX";
	entitlement_id: string | null;
	entitlement_ids: string[];
	presented_offering_id: string | null;
	transaction_id: string;
	original_transaction_id: string;
	is_family_share: boolean;
	country_code: string;
	app_user_id: string;
	aliases: string[];
	original_app_user_id: string;
	currency: string;
	price: number;
	price_in_purchased_currency: number;
	subscriber_attributes: {
		[key: string]: RevCatSubscriberAttribute;
	};
	store:
		| "APP_STORE"
		| "PLAY_STORE"
		| "STRIPE"
		| "MAC_APP_STORE"
		| "AMAZON"
		| "PROMOTIONAL"
		| "UNKNOWN_STORE";
	takehome_percentage: number;
	tax_percentage: number;
	commission_percentage: number;
	offer_code: string | null;
	type:
		| "INITIAL_PURCHASE"
		| "RENEWAL"
		| "NON_RENEWING_PURCHASE"
		| "PRODUCT_CHANGE"
		| "CANCELLATION"
		| "UNCANCELLATION"
		| "BILLING_ISSUE"
		| "SUBSCRIPTION_PAUSED"
		| "SUBSCRIPTION_PAUSED_DENIED"
		| "SUBSCRIPTION_REACTIVATED"
		| "REFUND"
		| "RENEWAL_EXTENDED"
		| "EXPIRATION"
		| "RENEWAL_OVERRIDE"
		| "REVENUE_RECOGNITION"
		| "TRANSFER"
		| "UNKNOWN";
	id: string;
	app_id: string;
	experiments: RevCatExperiment[];
};

export type RevCatWebhookPayload = {
	event: RevCatEvent;
	api_version: string;
};
