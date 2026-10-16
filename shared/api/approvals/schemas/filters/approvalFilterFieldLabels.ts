import type { ApprovalFilterKey } from "./approvalFilterShapes";

const customerLabels = {
	customer: "Customer",
	"customer.customer_id": "Customer",
	"customer.plan": "Customer has plan",
	"customer.item": "Customer has item",
	"customer.has_paid": "Customer has paid before",
} as const;

const entityLabels = {
	entity: "Entity",
	"entity.feature_id": "Entity type",
} as const;

const planLabels = ({ planLabel }: { planLabel: string }) => ({
	plan_id: planLabel,
	version: "Plan version",
	paid: "Paid plan",
	recurring: "Recurring",
	addon: "Add-on",
	custom: "Custom plan",
	price: "Price",
	item: "Item",
});

const prefixKeys = <Labels extends Record<string, string>>({
	prefix,
	labels,
}: {
	prefix: string;
	labels: Labels;
}) =>
	Object.fromEntries(
		Object.entries(labels).map(([path, label]) => [`${prefix}.${path}`, label]),
	);

/**
 * UI label for every filter field, by area and dot path (quantifiers left out),
 * e.g. `APPROVAL_FILTER_FIELD_LABELS.billing_change["incoming.free_trial"]`.
 */
export const APPROVAL_FILTER_FIELD_LABELS = {
	billing_change: {
		...customerLabels,
		...entityLabels,
		incoming: "Incoming plan",
		...prefixKeys({
			prefix: "incoming",
			labels: planLabels({ planLabel: "Incoming plan" }),
		}),
		"incoming.free_trial": "Free trial",
		"incoming.free_trial.duration": "Free trial length",
		"incoming.free_trial.card_required": "Trial card required",
		"incoming.free_trial.on_end": "Trial ends by",
		"incoming.feature_quantities": "Quantity",
		"incoming.feature_quantities.feature_id": "Feature",
		"incoming.feature_quantities.quantity": "Quantity",
		"incoming.customized": "Custom pricing",
		outgoing: "Outgoing plan",
		...prefixKeys({
			prefix: "outgoing",
			labels: planLabels({ planLabel: "Outgoing plan" }),
		}),
		paid: "Charges customer",
		checkout: "Sends checkout link",
		total: "Due now",
		next_cycle: "Next cycle",
		"next_cycle.total": "Next cycle",
		discounts: "Discount",
		"discounts.reward_id": "Discount",
		"discounts.percent_off": "Discount percent off",
		"discounts.amount_off": "Discount amount off",
		plan_schedule: "Timing",
		proration_behavior: "Proration",
		billing_cycle_anchor: "Billing cycle",
		starts_at: "Start date",
		invoice_mode: "Invoice mode",
		"invoice_mode.enabled": "Invoice mode",
	},
	billing_cancel: {
		...customerLabels,
		...entityLabels,
		cancel_action: "Timing",
		outgoing: "Plan",
		...prefixKeys({
			prefix: "outgoing",
			labels: planLabels({ planLabel: "Plan" }),
		}),
		refund: "Refund",
		"refund.amount": "Refund",
	},
	billing_uncancel: {
		...customerLabels,
		...entityLabels,
		outgoing: "Plan",
		...prefixKeys({
			prefix: "outgoing",
			labels: planLabels({ planLabel: "Plan" }),
		}),
	},
	invoice: {
		...customerLabels,
		total: "Invoice total",
		refund: "Refund or credit amount",
		"refund.amount": "Refund or credit amount",
	},
	balance_create: {
		...customerLabels,
		feature_id: "Feature",
		included_grant: "Amount",
		unlimited: "Unlimited",
		expires_at: "Expires within",
		reset: "Reset interval",
		"reset.interval": "Reset interval",
	},
	balance_update: {
		...customerLabels,
		feature_id: "Feature",
		included_grant: "Included",
		add_to_balance: "Add to balance",
		remaining: "Remaining",
		usage: "Usage",
	},
	reward_redeem: { ...customerLabels, reward_id: "Reward" },
	customer_change: customerLabels,
	plan: { plan_id: "Plan" },
	feature: { feature_id: "Feature" },
} satisfies Record<ApprovalFilterKey, Record<string, string>>;
