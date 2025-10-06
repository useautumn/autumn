/**
 * General application error codes
 */
export const GeneralErrorCode = {
	// Request validation
	InvalidInputs: "invalid_inputs",
	InvalidRequest: "invalid_request",
	InvalidExpand: "invalid_expand",
	InvalidOptions: "invalid_options",

	// Internal errors
	InternalError: "internal_error",

	// Organization
	OrgNotFound: "org_not_found",
	OrgHasCustomers: "org_has_customers",

	// Features
	FeatureNotFound: "feature_not_found",
	InvalidFeature: "invalid_feature",
	DuplicateFeatureId: "duplicate_feature_id",
	InvalidEventName: "invalid_event_name",
	FeatureLimitReached: "feature_limit_reached",

	// Entitlements
	InvalidEntitlement: "invalid_entitlement",
	CreateEntitlementFailed: "create_entitlement_failed",
	DeleteEntitlementFailed: "delete_entitlement_failed",
	InsufficientBalance: "insufficient_balance",

	// Invoices
	CreateInvoiceFailed: "create_invoice_failed",
	PayInvoiceFailed: "invoice_payment_failed",

	// Events
	InvalidEvent: "invalid_event",
	CreateEventFailed: "create_event_failed",
	DuplicateEvent: "duplicate_event",

	// Customer Products
	CusProductNotFound: "cus_product_not_found",
	NoActiveCusProducts: "no_active_cus_products",
	GetCusProductsFailed: "get_cus_products_failed",

	// Entities
	EntityNotFound: "entity_not_found",
	EntityAlreadyDeleted: "entity_already_deleted",
	EntityIdRequired: "entity_id_required",
	EntityBalanceNotFound: "entity_balance_not_found",

	// Subscriptions
	InsertSubscriptionFailed: "insert_subscription_failed",
	UpdateSubscriptionFailed: "update_subscription_failed",

	// Rewards
	InvalidReward: "invalid_reward",
	PromoCodeAlreadyExistsInStripe: "promo_code_already_exists_in_stripe",
	RewardNotFound: "reward_not_found",
	RewardProgramNotFound: "reward_program_not_found",
	InsertRewardProgramFailed: "insert_reward_program_failed",
	InsertReferralCodeFailed: "insert_referral_code_failed",
	ReferralCodeNotFound: "referral_code_not_found",
	UpdateRewardRedemptionFailed: "update_reward_redemption_failed",
	RewardRedemptionNotFound: "reward_redemption_not_found",
	InsertRewardRedemptionFailed: "insert_reward_redemption_failed",

	// Referral codes
	ReferralCodeMaxRedemptionsReached: "referral_code_max_redemptions_reached",
	ReferralNotFound: "referral_not_found",
	CustomerAlreadyRedeemedReferralCode:
		"customer_already_redeemed_referral_code",
	CustomerCannotRedeemOwnCode: "customer_cannot_redeem_own_code",

	// Migration
	InsertMigrationJobFailed: "insert_migration_job_failed",
	InsertMigrationErrorFailed: "insert_migration_error_failed",
	MigrationJobNotFound: "migration_job_not_found",

	// External services
	SupabaseNotFound: "supabase_not_found",
	ClickHouseDisabled: "clickhouse_disabled",
} as const;

export type GeneralErrorCode =
	(typeof GeneralErrorCode)[keyof typeof GeneralErrorCode];
