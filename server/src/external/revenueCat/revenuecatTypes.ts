// RevenueCat Webhook Event Types

type RevCatExperiment = {
	experiment_id: string;
	experiment_variant: string;
	enrolled_at_ms: number;
};

type RevCatSubscriberAttribute = {
	updated_at_ms: number;
	value: string;
};

type RevCatEvent = {
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

type RevCatWebhookPayload = {
	event: RevCatEvent;
	api_version: string;
};

type RevenueCatOfferings = {
	object: "list";
	items: RevenueCatOffering[];
	next_page: string | null;
	url: string;
};

type RevenueCatOffering = {
	object: "offering";
	id: string;
	lookup_key: string | null;
	display_name: string;
	is_current: boolean;
	created_at: number;
	project_id: string;
	metadata: {
		[key: string]: string;
	};
	packages: RevenueCatOfferingPackageList;
};

type RevenueCatOfferingPackageList = {
	object: "list";
	items: RevenueCatOfferingPackage[];
	next_page: string | null;
	url: string;
};

type RevenueCatOfferingPackage = {
	object: "package";
	id: string;
	lookup_key: string | null;
	display_name: string;
	position: number;
	created_at: number;
	products: RevenueCatOfferingProductList;
};

type RevenueCatOfferingProductList = {
	object: "list";
	items: RevenueCatOfferingProductItem[];
	next_page: string | null;
	url: string;
};

type RevenueCatOfferingProductItem = {
	product: Record<string, unknown>;
	eligibility_criteria: string;
};

// RevenueCat Products API Types

type RevenueCatProductSubscription = {
	duration: string;
	grace_period_duration?: string;
	trial_duration?: string;
};

type RevenueCatProductOneTime = {
	is_consumable: boolean;
};

export type RevenueCatProduct = {
	object: "product";
	id: string;
	store_identifier: string;
	type: "subscription" | "one_time";
	subscription?: RevenueCatProductSubscription;
	one_time?: RevenueCatProductOneTime;
	created_at: number;
	app_id: string;
	display_name: string;
	state?: string;
};

export type RevenueCatProductsResponse = {
	object: "list";
	items: RevenueCatProduct[];
	next_page: string | null;
	url: string;
};

// Field names + enums mirror the RevenueCat OpenAPI v2 spec (Subscription/Purchase schemas).
export type RevenueCatStore =
	| "amazon"
	| "app_store"
	| "mac_app_store"
	| "play_store"
	| "promotional"
	| "stripe"
	| "rc_billing"
	| "external"
	| "roku"
	| "paddle"
	| "paypal"
	| "galaxy"
	| "test_store";

export type RevenueCatSubscriptionStatus =
	| "trialing"
	| "active"
	| "expired"
	| "in_grace_period"
	| "in_billing_retry"
	| "paused"
	| "unknown"
	| "incomplete";

export type RevenueCatAutoRenewalStatus =
	| "will_renew"
	| "will_not_renew"
	| "will_change_product"
	| "will_pause"
	| "requires_price_increase_consent"
	| "has_already_renewed";

export type RevenueCatSubscription = {
	object: "subscription";
	id: string;
	// RevenueCat-internal product id (null for promotional). Bridge to store via listAllProducts.
	product_id: string | null;
	store: RevenueCatStore;
	store_subscription_identifier: string;
	status: RevenueCatSubscriptionStatus;
	starts_at: number;
	current_period_starts_at: number;
	current_period_ends_at: number | null;
	ends_at?: number | null;
	auto_renewal_status: RevenueCatAutoRenewalStatus;
	gives_access?: boolean;
};

export type RevenueCatSubscriptionsResponse = {
	object: "list";
	items: RevenueCatSubscription[];
	next_page: string | null;
	url: string;
};

export type RevenueCatPurchaseStatus = "owned" | "refunded";

export type RevenueCatPurchase = {
	object: "purchase";
	id: string;
	product_id: string;
	store: RevenueCatStore;
	purchased_at: number;
	status?: RevenueCatPurchaseStatus;
};

export type RevenueCatPurchasesResponse = {
	object: "list";
	items: RevenueCatPurchase[];
	next_page: string | null;
	url: string;
};

export type RevenueCatPrice = {
	id: string;
	amount_micros: number;
	currency: string;
};

export type RevenueCatPublicApiKey = {
	object?: string;
	id: string;
	key: string;
	environment?: string;
	app_id?: string;
	created_at?: number;
};

export type RevenueCatPublicApiKeysResponse = {
	object: "list";
	items: RevenueCatPublicApiKey[];
	next_page: string | null;
	url: string;
};

export type RevenueCatWebhookEnvironment = "production" | "sandbox";

export type RevenueCatWebhookIntegration = {
	object?: string;
	id: string;
	project_id?: string;
	name: string;
	url: string;
	environment?: RevenueCatWebhookEnvironment | null;
	event_types?: string[] | null;
	app_id?: string | null;
	created_at?: number;
};

export type RevenueCatCreateWebhookBody = {
	name: string;
	url: string;
	authorization_header?: string;
	environment?: RevenueCatWebhookEnvironment | null;
	event_types?: string[] | null;
	app_id?: string | null;
};

export type RevenueCatWebhooksResponse = {
	object: "list";
	items: RevenueCatWebhookIntegration[];
	next_page: string | null;
	url: string;
};

export type RevenueCatProductType = "subscription" | "one_time";

export type RevenueCatCreateProductBody = {
	store_identifier: string;
	app_id: string;
	type: RevenueCatProductType;
	display_name: string;
	// Required by Test Store apps ("user-facing title"); harmless for store apps.
	title?: string;
	// ISO-8601 duration (e.g. "P1M", "P1Y"). Required when type is "subscription".
	subscription?: { duration: string };
	one_time?: { is_consumable?: boolean };
};

export type RevenueCatUpdateProductBody = {
	display_name?: string;
};

// create_in_store uses an enum duration (NOT the ISO-8601 one createProduct uses).
export type RevenueCatStoreDuration =
	| "ONE_WEEK"
	| "ONE_MONTH"
	| "TWO_MONTHS"
	| "THREE_MONTHS"
	| "SIX_MONTHS"
	| "ONE_YEAR";

export type RevenueCatCreateInStoreBody = {
	store_information?: {
		duration: RevenueCatStoreDuration;
		subscription_group_name: string;
		subscription_group_id?: string;
	};
};

export type RevenueCatAppStoreType =
	| "app_store"
	| "mac_app_store"
	| "play_store"
	| "amazon"
	| "roku"
	| "stripe"
	| "paddle"
	| "rc_billing"
	| "test_store";

export type RevenueCatApp = {
	object: "app";
	id: string;
	name: string;
	type: RevenueCatAppStoreType;
	project_id: string;
	created_at: number;
};

export type RevenueCatAppsResponse = {
	object: "list";
	items: RevenueCatApp[];
	next_page: string | null;
	url: string;
};

export type RevenueCatProject = {
	object: "project";
	id: string;
	name: string;
	created_at: number;
};

export type RevenueCatCreateProjectBody = {
	name: string;
};

export type RevenueCatProjectsResponse = {
	object: "list";
	items: RevenueCatProject[];
	next_page: string | null;
	url: string;
};
