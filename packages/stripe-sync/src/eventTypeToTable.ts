/**
 * Maps a Stripe event type to the sync DB table that stores the object.
 * Returns undefined for event types that don't map to a known table.
 */
export const eventTypeToTable = ({
	eventType,
}: {
	eventType: string;
}): string | undefined => {
	if (eventType.startsWith("charge.dispute.")) return "disputes";
	if (eventType.startsWith("charge.")) return "charges";
	if (eventType.startsWith("checkout.session.")) return "checkout_sessions";
	if (eventType.startsWith("customer.subscription.")) return "subscriptions";
	if (eventType.startsWith("customer.tax_id.")) return "tax_ids";
	if (eventType.startsWith("customer.")) return "customers";
	if (eventType.startsWith("invoice.")) return "invoices";
	if (eventType.startsWith("product.")) return "products";
	if (eventType.startsWith("price.")) return "prices";
	if (eventType.startsWith("plan.")) return "plans";
	if (eventType.startsWith("setup_intent.")) return "setup_intents";
	if (eventType.startsWith("subscription_schedule."))
		return "subscription_schedules";
	if (eventType.startsWith("payment_method.")) return "payment_methods";
	if (eventType.startsWith("payment_intent.")) return "payment_intents";
	if (eventType.startsWith("credit_note.")) return "credit_notes";
	if (eventType.startsWith("radar.early_fraud_warning."))
		return "early_fraud_warnings";
	if (eventType.startsWith("refund.")) return "refunds";
	if (eventType.startsWith("review.")) return "reviews";
	if (eventType === "invoice_payment.paid") return "invoice_payments";

	return undefined;
};

/** All tables in the stripe sync schema that store Stripe objects. */
export const SYNCED_TABLES = [
	"charges",
	"checkout_sessions",
	"checkout_session_line_items",
	"coupons",
	"credit_notes",
	"customers",
	"disputes",
	"early_fraud_warnings",
	"events",
	"invoices",
	"invoice_payments",
	"payment_intents",
	"payment_methods",
	"payouts",
	"plans",
	"prices",
	"products",
	"refunds",
	"reviews",
	"setup_intents",
	"subscription_items",
	"subscription_schedules",
	"subscriptions",
	"tax_ids",
] as const;
