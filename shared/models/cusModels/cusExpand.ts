// Previous customer expand options for v1.2 of the API
export enum CusExpandV0 {}
// UpcomingInvoice = "upcoming_invoice",

// New customer expand options!
export enum CusExpand {
	Invoices = "invoices",
	TrialsUsed = "trials_used",
	Rewards = "rewards",
	Entities = "entities",
	Referrals = "referrals",
	PaymentMethod = "payment_method",
	// PlansPlan = "plans.plan",

	SubscriptionsPlan = "subscriptions.plan",
	ScheduledSubscriptionsPlan = "scheduled_subscriptions.plan",
	BalancesFeature = "balances.feature",
}
