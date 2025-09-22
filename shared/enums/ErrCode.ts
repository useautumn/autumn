export const ErrCode = {
	// Auth
	InvalidApiVersion: "invalid_api_version",
	NoSecretKey: "no_secret_key",
	InvalidSecretKey: "invalid_secret_key",

	NoAuthHeader: "no_auth_header",
	InvalidAuthHeader: "invalid_auth_header",
	FailedToVerifySecretKey: "failed_to_verify_secret_key",
	FailedToFetchKeyFromAutumn: "failed_to_fetch_key_from_autumn",

	NoPublishableKey: "no_publishable_key",
	InvalidPublishableKey: "invalid_publishable_key",
	GetOrgFromPublishableKeyFailed: "get_org_from_publishable_key_failed",
	EndpointNotPublic: "endpoint_not_public",
	FailedToVerifyPublishableKey: "failed_to_verify_publishable_key",

	// General
	InvalidInputs: "invalid_inputs",
	InvalidRequest: "invalid_request",
	InvalidExpand: "invalid_expand",
	InvalidOptions: "invalid_options",

	// Org
	OrgNotFound: "org_not_found",
	OrgHasCustomers: "org_has_customers",

	// Feature
	FeatureNotFound: "feature_not_found",
	InvalidFeature: "invalid_feature",
	DuplicateFeatureId: "duplicate_feature_id",
	InvalidEventName: "invalid_event_name",
	FeatureLimitReached: "feature_limit_reached",

	// Internal
	InternalError: "internal_error",
	DuplicateCustomerId: "duplicate_customer_id",
	StripeKeyNotFound: "stripe_key_not_found",
	DuplicateCustomerEmail: "duplicate_customer_email",

	// Stripe
	StripeError: "stripe_error",
	StripeKeyInvalid: "stripe_key_invalid",
	StripeConfigNotFound: "stripe_config_not_found",
	StripeDeleteCustomerFailed: "stripe_delete_customer_failed",
	StripeCreateCustomerFailed: "stripe_create_customer_failed",
	StripeCreateProductFailed: "stripe_create_product_failed",
	StripeCancelSubscriptionFailed: "stripe_cancel_subscription_failed",
	StripeGetPaymentMethodFailed: "stripe_get_payment_method_failed",
	StripeCardDeclined: "stripe_card_declined",
	StripeUpdateSubscriptionFailed: "stripe_update_subscription_failed",
	StripeCancelSubscriptionScheduleFailed:
		"stripe_cancel_subscription_schedule_failed",

	StripeCreateSubscriptionFailed: "stripe_create_subscription_failed",

	// Price
	PriceNotFound: "price_not_found",
	CreatePriceFailed: "create_price_failed",
	InvalidPrice: "invalid_price",
	InvalidPriceId: "invalid_price_id",
	InvalidPriceOptions: "invalid_price_options",
	InvalidPriceConfig: "invalid_price_config",
	CusPriceNotFound: "cus_price_not_found",

	// Customer
	InvalidCustomer: "invalid_customer",
	CreateCustomerFailed: "create_customer_failed",
	CustomerNotFound: "customer_not_found",
	CustomersNotFound: "customers_not_found",
	CustomerAlreadyHasProduct: "customer_already_has_product",
	CustomerHasNoPaymentMethod: "customer_has_no_payment_method",
	CustomerHasNoBaseProduct: "customer_has_no_base_product",
	AttachProductToCustomerFailed: "attach_product_to_customer_failed",
	CustomerEntitlementNotFound: "customer_entitlement_not_found",
	MultipleCustomersFound: "multiple_customers_found",
	InvalidUpdateCustomerParams: "invalid_update_customer_params",

	// Product
	InvalidProduct: "invalid_product",
	ProductNotFound: "product_not_found",
	ProductHasCustomers: "product_has_customers",
	ProductHasNoPrices: "product_has_no_prices",
	ProductHasDifferentRecurringIntervals:
		"product_has_different_recurring_intervals",
	CreateStripeProductFailed: "create_stripe_product_failed",
	DeleteStripeProductFailed: "delete_stripe_product_failed",
	CreateStripeSubscriptionFailed: "create_stripe_subscription_failed",
	UpdateCusProductFailed: "update_customer_product_failed",
	DefaultProductNotAllowedPrice: "default_product_not_allowed_price",
	UpgradeFailed: "upgrade_failed",
	ProductAlreadyExists: "product_already_exists",
	ProductHasRewardPrograms: "product_has_reward_programs",

	// Cus Product
	CusProductNotFound: "cus_product_not_found",

	// Entitlements
	InvalidEntitlement: "invalid_entitlement",
	CreateEntitlementFailed: "create_entitlement_failed",
	DeleteEntitlementFailed: "delete_entitlement_failed",
	InsufficientBalance: "insufficient_balance",

	// Invoice
	CreateInvoiceFailed: "create_invoice_failed",

	// Event
	InvalidEvent: "invalid_event",
	CreateEventFailed: "create_event_failed",
	DuplicateEvent: "duplicate_event",

	// Cus Product
	NoActiveCusProducts: "no_active_cus_products",
	GetCusProductsFailed: "get_cus_products_failed",

	// Cus Price
	GetCusPriceFailed: "get_cus_price_failed",

	// Pay for invoice
	PayInvoiceFailed: "invoice_payment_failed",

	// Rewards
	InvalidReward: "invalid_reward",
	PromoCodeAlreadyExistsInStripe: "promo_code_already_exists_in_stripe",

	// Entity
	EntityNotFound: "entity_not_found",
	EntityAlreadyDeleted: "entity_already_deleted",

	// Referral codes
	ReferralCodeMaxRedemptionsReached: "referral_code_max_redemptions_reached",
	ReferralNotFound: "referral_not_found",
	CustomerAlreadyRedeemedReferralCode:
		"customer_already_redeemed_referral_code",
	CustomerCannotRedeemOwnCode: "customer_cannot_redeem_own_code",

	// Product items
	InvalidProductItem: "invalid_product_item",

	// Entity
	EntityIdRequired: "entity_id_required",

	// Subscription
	InsertSubscriptionFailed: "insert_subscription_failed",
	UpdateSubscriptionFailed: "update_subscription_failed",

	// Rewards
	RewardNotFound: "reward_not_found",
	RewardProgramNotFound: "reward_program_not_found",
	InsertRewardProgramFailed: "insert_reward_program_failed",
	InsertReferralCodeFailed: "insert_referral_code_failed",
	ReferralCodeNotFound: "referral_code_not_found",
	UpdateRewardRedemptionFailed: "update_reward_redemption_failed",
	RewardRedemptionNotFound: "reward_redemption_not_found",
	InsertRewardRedemptionFailed: "insert_reward_redemption_failed",

	// Migration
	InsertMigrationJobFailed: "insert_migration_job_failed",
	InsertMigrationErrorFailed: "insert_migration_error_failed",
	MigrationJobNotFound: "migration_job_not_found",

	// Supabase
	SupabaseNotFound: "supabase_not_found",
	// Entities
	EntityBalanceNotFound: "entity_balance_not_found",

	// ClickHouse
	ClickHouseDisabled: "clickhouse_disabled",
};
