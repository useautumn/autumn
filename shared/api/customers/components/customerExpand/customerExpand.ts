import { z } from "zod/v4";

// Re-export enum values as constants for easy access (matches old enum usage pattern)
export enum CustomerExpand {
	Invoices = "invoices",
	TrialsUsed = "trials_used",
	Rewards = "rewards",
	Entities = "entities",
	Referrals = "referrals",
	PaymentMethod = "payment_method",
	SubscriptionsPlan = "subscriptions.plan",
	PurchasesPlan = "purchases.plan",
	BalancesFeature = "balances.feature",
	FlagsFeature = "flags.feature",
	AutoTopupsPurchaseLimit = "billing_controls.auto_topups.purchase_limit",
}

export const CustomerExpandEnum = z.enum(CustomerExpand).meta({
	title: "CustomerExpand",
});

export const CustomerExpandArraySchema = z.array(CustomerExpandEnum).meta({
	description: "Customer expand options",
});
