export enum JobName {
	UpdateBalance = "update-balance",
	UpdateUsage = "update-usage",

	RewardMigration = "reward-migration",

	TriggerCheckoutReward = "trigger-checkout-reward",
	GrantCheckoutReward = "grant-checkout-reward",
	GenerateFeatureDisplay = "generate-feature-display",
	DetectBaseVariant = "detect-base-variant",

	HandleProductsUpdated = "handle-products-updated",
	SendProductsUpdated = "send-products-updated",
	HandleCustomerCreated = "handle-customer-created",

	SyncBalanceBatchV4 = "sync-balance-batch-v4",
	SyncCustomerDirty = "sync-customer-dirty",
	PersistPublishedBalanceTransitions = "persist-published-balance-transitions",
	RefreshEntityAggregate = "refresh-entity-aggregate",
	InsertEventBatch = "insert-event-batch",
	Track = "track",
	CustomerCreationRecovery = "customer-creation-recovery",
	EntityCreationRecovery = "entity-creation-recovery",

	ClearCreditSystemCustomerCache = "clear-credit-system-customer-cache",

	BatchResetCusEnts = "batch-reset-cus-ents",
	BatchResetCustomerEntitlementsV2 = "batch-reset-customer-entitlements-v2",

	AutoTopUp = "auto-top-up",
	StoreInvoiceLineItems = "store-invoice-line-items",

	StoreDeferredInvoiceLineItems = "store-deferred-invoice-line-items",

	StripeWebhookReplay = "stripe-webhook-replay",

	FinalizeLock = "finalize-lock",

	ExpireLockReceipt = "expire-lock-receipt",
}
