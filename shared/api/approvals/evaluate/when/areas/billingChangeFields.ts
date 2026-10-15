import type { FullCusProduct } from "../../../../../models/cusProductModels/cusProductModels";
import { planFilterMatchesCustomerProduct } from "../../../../products/utils/match/planFilterMatchesCustomerProduct";
import { planFilterMatchesProduct } from "../../../../products/utils/match/planFilterMatchesProduct";
import { WHEN_FIELD_LABELS } from "../../../schemas/when/whenFieldLabels";
import type {
	BillingChangeFacts,
	IncomingPlanFacts,
} from "../../facts/billingFacts";
import { arrayField } from "../fields/arrayField";
import { booleanField } from "../fields/booleanField";
import { customerField } from "../fields/customerField";
import { freeTrialField } from "../fields/freeTrialField";
import { nullableObjectField } from "../fields/nullableObjectField";
import { numberField } from "../fields/numberField";
import { planFields } from "../fields/planFields";
import { relativeDateField } from "../fields/relativeDateField";
import { stringField } from "../fields/stringField";
import { labelsUnder } from "../labelsUnder";
import type { WhenFields } from "../whenFieldTypes";

const labels = WHEN_FIELD_LABELS.billing_change;

type FeatureQuantity = IncomingPlanFacts["feature_quantities"][number];
type Discount = BillingChangeFacts["discounts"][number];

// `custom` describes an existing customer plan, so incoming plans leave it out
// (an unknown key fails closed); the request-level flag is `customized`.
const { custom: _custom, ...incomingPlanBaseFields } =
	planFields<IncomingPlanFacts>({
		labels: labelsUnder({ labels, prefix: "incoming" }),
		matchesPlan: ({ filter, item }) =>
			planFilterMatchesProduct({ filter, product: item.product }),
		readPlanId: (item) => item.product.id,
		readVersion: (item) => item.product.version ?? null,
	});

const incomingPlanFields: WhenFields<IncomingPlanFacts> = {
	...incomingPlanBaseFields,
	free_trial: freeTrialField<IncomingPlanFacts>({
		label: labels["incoming.free_trial"],
		read: (item) => item.free_trial,
	}),
	feature_quantities: arrayField<IncomingPlanFacts, FeatureQuantity>({
		label: labels["incoming.feature_quantities"],
		read: (item) => item.feature_quantities,
		element: {
			feature_id: stringField({
				label: labels["incoming.feature_quantities.feature_id"],
				read: (row) => row.feature_id,
			}),
			quantity: numberField({
				label: labels["incoming.feature_quantities.quantity"],
				read: (row) => row.quantity,
			}),
		},
	}),
	customized: booleanField<IncomingPlanFacts>({
		label: labels["incoming.customized"],
		read: (item) => item.customized,
	}),
};

/** Outgoing plans, labelled by the caller's area (cancel calls them "Plan"). */
export const outgoingPlanFields = ({
	labels,
}: {
	labels: Record<string, string>;
}) =>
	planFields<FullCusProduct>({
		labels,
		matchesPlan: ({ filter, item }) =>
			planFilterMatchesCustomerProduct({ filter, cusProduct: item }),
		readPlanId: (item) => item.product_id,
		readVersion: (item) => item.product?.version ?? null,
	});

const formatPercent = (value: number) => `${value}%`;

export const billingChangeFields: WhenFields<BillingChangeFacts> = {
	customer: customerField({
		label: labels.customer,
		read: (facts) => facts.customer,
	}),
	incoming: arrayField({
		label: labels.incoming,
		read: (facts) => facts.incoming,
		element: incomingPlanFields,
	}),
	outgoing: arrayField({
		label: labels.outgoing,
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({
			labels: labelsUnder({ labels, prefix: "outgoing" }),
		}),
	}),
	paid: booleanField({
		label: labels.paid,
		read: (facts) => facts.paid,
	}),
	checkout: booleanField({
		label: labels.checkout,
		read: (facts) => facts.checkout,
	}),
	total: numberField({ label: labels.total, read: (facts) => facts.total }),
	next_cycle: nullableObjectField<BillingChangeFacts, { total: number }>({
		label: labels.next_cycle,
		read: (facts) => facts.next_cycle,
		fields: {
			total: numberField({
				label: labels["next_cycle.total"],
				read: (cycle) => cycle.total,
			}),
		},
		describeValue: (cycle) => String(cycle.total),
	}),
	discounts: arrayField<BillingChangeFacts, Discount>({
		label: labels.discounts,
		read: (facts) => facts.discounts,
		element: {
			reward_id: stringField({
				label: labels["discounts.reward_id"],
				read: (row) => row.reward_id,
			}),
			percent_off: numberField({
				label: labels["discounts.percent_off"],
				read: (row) => row.percent_off,
				format: formatPercent,
			}),
			amount_off: numberField({
				label: labels["discounts.amount_off"],
				read: (row) => row.amount_off,
			}),
		},
	}),
	plan_schedule: stringField({
		label: labels.plan_schedule,
		read: (facts) => facts.plan_schedule,
	}),
	proration_behavior: stringField({
		label: labels.proration_behavior,
		read: (facts) => facts.proration_behavior,
	}),
	starts_at: relativeDateField({
		label: labels.starts_at,
		read: (facts) => facts.starts_at,
	}),
	invoice_mode: nullableObjectField<BillingChangeFacts, { enabled: boolean }>({
		label: labels.invoice_mode,
		read: (facts) => facts.invoice_mode,
		fields: {
			enabled: booleanField({
				label: labels["invoice_mode.enabled"],
				read: (mode) => mode.enabled,
			}),
		},
		describeValue: (mode) => (mode.enabled ? "enabled" : "disabled"),
	}),
};
