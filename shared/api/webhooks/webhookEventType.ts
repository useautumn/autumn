export enum WebhookEventType {
	CustomerProductsUpdated = "customer.products.updated",
	CustomerThresholdReached = "customer.threshold_reached",

	BalancesUsageAlertTriggered = "balances.usage_alert_triggered",
	BalancesLimitReached = "balances.limit_reached",
	BalancesAutoTopupSucceeded = "balances.auto_topup_succeeded",

	VercelResourcesDeleted = "vercel.resources.deleted",
	VercelResourcesProvisioned = "vercel.resources.provisioned",
	VercelResourcesRotateSecrets = "vercel.resources.rotate_secrets",
	VercelWebhooksEvent = "vercel.webhooks.event",
}
