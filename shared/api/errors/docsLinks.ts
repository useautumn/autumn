const DOCS_BASE = "https://docs.useautumn.com";

const link = (page: string, anchor?: string) =>
	anchor ? `${DOCS_BASE}/${page}#${anchor}` : `${DOCS_BASE}/${page}`;

// Anchors are verified against headings in apps/docs/mintlify/**.mdx.
// Mintlify slugs: lowercase, spaces -> "-", backticks/punctuation stripped.
export const DocsLinks = {
	SubscriptionLifecycle: link("documentation/customers/subscription-lifecycle"),
	Uncanceling: link(
		"documentation/customers/subscription-lifecycle",
		"uncanceling",
	),
	CancelScheduledChange: link(
		"documentation/customers/subscription-lifecycle",
		"canceling-a-scheduled-plan-change",
	),
	CancelEndOfPeriod: link(
		"documentation/customers/subscription-lifecycle",
		"cancel-at-end-of-billing-period",
	),
	CancelAction: link(
		"documentation/customers/subscription-lifecycle",
		"cancel_action-reference",
	),

	UpdatingSubscriptions: link("documentation/customers/updating-subscriptions"),
	UpdatePrepaidQuantity: link(
		"documentation/customers/updating-subscriptions",
		"updating-prepaid-feature-quantities",
	),
	UpdateBilling: link(
		"documentation/customers/updating-subscriptions",
		"how-billing-works",
	),
	SkippingCharges: link(
		"documentation/customers/updating-subscriptions",
		"skipping-charges",
	),

	Trials: link("documentation/modelling-pricing/trials"),
	Proration: link("documentation/modelling-pricing/proration"),

	PrepaidPricing: link("documentation/modelling-pricing/prepaid-pricing"),
	PassingFeatureQuantities: link(
		"documentation/modelling-pricing/prepaid-pricing",
		"passing-feature_quantities",
	),

	TrackingUsage: link("documentation/customers/tracking-usage"),
	SendingEvents: link(
		"documentation/customers/tracking-usage",
		"sending-events",
	),
	UsingEventNames: link(
		"documentation/customers/tracking-usage",
		"using-event-names",
	),

	BalanceLocking: link("documentation/customers/balance-locking"),

	EdgeCases: link("documentation/customers/edge-cases"),
	ApiIdempotency: link("documentation/customers/edge-cases", "api-idempotency"),
	ConcurrentRequests: link(
		"documentation/customers/edge-cases",
		"concurrent-requests",
	),
} as const;
