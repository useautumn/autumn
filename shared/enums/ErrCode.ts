export const ErrCode = {
	PlanAlreadyAttached: "plan_already_attached",
	PendingPlanConflict: "pending_plan_conflict",

	IdempotencyKeyAlreadyExists: "idempotency_key_already_exists",
	IdempotencyKeyNotFound: "idempotency_key_not_found",
	DuplicateIdempotencyKey: "duplicate_idempotency_key",

	InvalidApiVersion: "invalid_api_version",
	NoSecretKey: "no_secret_key",
	InvalidSecretKey: "invalid_secret_key",

	NoAuthHeader: "no_auth_header",
	InvalidAuthHeader: "invalid_auth_header",
	FailedToVerifySecretKey: "failed_to_verify_secret_key",
	FailedToFetchKeyFromAutumn: "failed_to_fetch_key_from_autumn",
	InsufficientScopes: "insufficient_scopes",

	NoPublishableKey: "no_publishable_key",
	InvalidPublishableKey: "invalid_publishable_key",
	GetOrgFromPublishableKeyFailed: "get_org_from_publishable_key_failed",
	EndpointNotPublic: "endpoint_not_public",
	FailedToVerifyPublishableKey: "failed_to_verify_publishable_key",

	InvalidInputs: "invalid_inputs",
	InvalidRequest: "invalid_request",
	InvalidExpand: "invalid_expand",
	InvalidOptions: "invalid_options",
	InvalidCursor: "invalid_cursor",
	RequestTemporarilyDisabled: "request_temporarily_disabled",
	RequestTimeout: "request_timeout",

	OrgNotFound: "org_not_found",
	OrgHasCustomers: "org_has_customers",

	MigrationNotFound: "migration_not_found",

	FeatureNotFound: "feature_not_found",
	InvalidFeature: "invalid_feature",
	DuplicateFeatureId: "duplicate_feature_id",
	InvalidEventName: "invalid_event_name",
	FeatureLimitReached: "feature_limit_reached",

	WebhookNotFound: "webhook_not_found",
	DuplicateWebhookId: "duplicate_webhook_id",
	AmbiguousWebhookUrl: "ambiguous_webhook_url",
	WebhooksUnavailable: "webhooks_unavailable",

	ByocUnavailable: "byoc_unavailable",
	ByocCacheNotReady: "byoc_cache_not_ready",

	InternalError: "internal_error",
	DuplicateCustomerId: "duplicate_customer_id",
	StripeKeyNotFound: "stripe_key_not_found",
	DuplicateCustomerEmail: "duplicate_customer_email",

	StripeError: "stripe_error",
	StripeKeyInvalid: "stripe_key_invalid",
	StripeAccountMismatch: "stripe_account_mismatch",
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

	PriceNotFound: "price_not_found",
	CreatePriceFailed: "create_price_failed",
	InvalidPrice: "invalid_price",
	InvalidPriceId: "invalid_price_id",
	InvalidPriceOptions: "invalid_price_options",
	InvalidPriceConfig: "invalid_price_config",
	CusPriceNotFound: "cus_price_not_found",
	StripePriceNotLinked: "stripe_price_not_linked",

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
	CurrencyMismatch: "currency_mismatch",

	CreateStripeProductFailed: "create_stripe_product_failed",
	DeleteStripeProductFailed: "delete_stripe_product_failed",
	CreateStripeSubscriptionFailed: "create_stripe_subscription_failed",

	CusProductNotFound: "cus_product_not_found",
	DuplicateSubscriptionId: "duplicate_subscription_id",

	InvalidEntitlement: "invalid_entitlement",
	CreateEntitlementFailed: "create_entitlement_failed",
	DeleteEntitlementFailed: "delete_entitlement_failed",
	InsufficientBalance: "insufficient_balance",

	CreateInvoiceFailed: "create_invoice_failed",

	InvalidEvent: "invalid_event",
	CreateEventFailed: "create_event_failed",
	DuplicateEvent: "duplicate_event",

	NoActiveCusProducts: "no_active_cus_products",
	GetCusProductsFailed: "get_cus_products_failed",

	GetCusPriceFailed: "get_cus_price_failed",

	PayInvoiceFailed: "invoice_payment_failed",

	InvalidReward: "invalid_reward",
	ProductNotInStripe: "product_not_in_stripe",
	DuplicateRewardId: "duplicate_reward_id",
	DuplicatePromoCode: "duplicate_promo_code",
	PromoCodeAlreadyExistsInStripe: "promo_code_already_exists_in_stripe",
	PromoCodeFirstTimeOnly: "promo_code_first_time_only",

	EntityNotFound: "entity_not_found",
	EntityAlreadyDeleted: "entity_already_deleted",

	ReferralCodeMaxRedemptionsReached: "referral_code_max_redemptions_reached",
	ReferralNotFound: "referral_not_found",
	CustomerAlreadyRedeemedReferralCode:
		"customer_already_redeemed_referral_code",
	CustomerCannotRedeemOwnCode: "customer_cannot_redeem_own_code",

	InvalidProductItem: "invalid_product_item",

	EntityIdRequired: "entity_id_required",

	LockAlreadyExists: "lock_already_exists",

	InsertSubscriptionFailed: "insert_subscription_failed",
	UpdateSubscriptionFailed: "update_subscription_failed",

	RewardNotFound: "reward_not_found",
	RewardProgramNotFound: "reward_program_not_found",
	InsertRewardProgramFailed: "insert_reward_program_failed",
	InsertReferralCodeFailed: "insert_referral_code_failed",
	ReferralCodeNotFound: "referral_code_not_found",
	UpdateRewardRedemptionFailed: "update_reward_redemption_failed",
	RewardRedemptionNotFound: "reward_redemption_not_found",
	InsertRewardRedemptionFailed: "insert_reward_redemption_failed",

	InsertMigrationJobFailed: "insert_migration_job_failed",
	InsertMigrationErrorFailed: "insert_migration_error_failed",
	MigrationJobNotFound: "migration_job_not_found",
	MigrationAlreadyInProgress: "migration_already_in_progress",

	CustomerExportInProgress: "customer_export_in_progress",

	SupabaseNotFound: "supabase_not_found",
	EntityBalanceNotFound: "entity_balance_not_found",

	TinybirdDisabled: "tinybird_disabled",
	/** @deprecated Use TinybirdDisabled instead — kept for frontend compat */
	ClickHouseDisabled: "tinybird_disabled",

	PaymentMethodNotFound: "payment_method_not_found",

	VercelSubscriptionAlreadyExists: "vercel_subscription_already_exists",
	VercelSubscriptionNotFound: "vercel_subscription_not_found",
	VercelResourceNotFound: "vercel_resource_not_found",

	ProductNotFound: "product_not_found",

	NestedVariantNotAllowed: "nested_variant_not_allowed",
	CannotForkArchivedBase: "cannot_fork_archived_base",
	ProductIdAlreadyExists: "product_id_already_exists",
	DuplicateVersionSlug: "duplicate_version_slug",
	CannotPreviewOnVariant: "cannot_preview_on_variant",
	InvalidPropagationTarget: "invalid_propagation_target",
	ConflictingVariantAnchor: "conflicting_variant_anchor",
	VariantCrossPlanAnchor: "variant_cross_plan_anchor",
	TooManyVariants: "too_many_variants",
	ConflictingVersionFlags: "conflicting_version_flags",
	VariantCannotBeDefault: "variant_cannot_be_default",
	HistoricalPlanVersionCannotBeDefault:
		"historical_plan_version_cannot_be_default",

	UnderMaintenance: "under_maintenance",
};
