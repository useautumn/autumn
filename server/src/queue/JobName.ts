export enum JobName {
	UpdateBalance = "update-balance",
	UpdateUsage = "update-usage",

	Migration = "migration",
	RewardMigration = "reward-migration",

	TriggerCheckoutReward = "trigger-checkout-reward",
	GrantCheckoutReward = "grant-checkout-reward",
	GenerateFeatureDisplay = "generate-feature-display",
	DetectBaseVariant = "detect-base-variant",

	HandleProductsUpdated = "handle-products-updated",
	/** Sends customer.products.updated webhook (v2 lean payload) */
	SendProductsUpdated = "send-products-updated",
	HandleCustomerCreated = "handle-customer-created",

	SyncBalanceBatch = "sync-balance-batch",
	SyncBalanceBatchV2 = "sync-balance-batch-v2",
	SyncBalanceBatchV3 = "sync-balance-batch-v3",
	InsertEventBatch = "insert-event-batch",

	ClearCreditSystemCustomerCache = "clear-credit-system-customer-cache",

	BatchResetCusEnts = "batch-reset-cus-ents",

	AutoTopUp = "auto-top-up",
	/** Stores invoice line items from Stripe to DB (async to allow extra API calls) */
	StoreInvoiceLineItems = "store-invoice-line-items",

	/** Stores deferred invoice line items (ProrateNextCycle pending items) before an invoice exists */
	StoreDeferredInvoiceLineItems = "store-deferred-invoice-line-items",

	// Hatchet workflows
	VerifyCacheConsistency = "verify-cache-consistency",
}
