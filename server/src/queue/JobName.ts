export enum JobName {
	UpdateBalance = "update-balance",
	UpdateUsage = "update-usage",

	Migration = "migration",
	RewardMigration = "reward-migration",

	TriggerCheckoutReward = "trigger-checkout-reward",
	GenerateFeatureDisplay = "generate-feature-display",
	DetectBaseVariant = "detect-base-variant",

	HandleProductsUpdated = "handle-products-updated",
	HandleCustomerCreated = "handle-customer-created",

	SyncBalanceBatch = "sync-balance-batch",
	SyncBalanceBatchV2 = "sync-balance-batch-v2",
	InsertEventBatch = "insert-event-batch",

	ClearCreditSystemCustomerCache = "clear-credit-system-customer-cache",

	// Hatchet workflows
	VerifyCacheConsistency = "verify-cache-consistency",
}
