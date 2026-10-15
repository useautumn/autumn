import { planFilterMatchesCustomerProduct } from "@api/products/utils/match/planFilterMatchesCustomerProduct";
import { planFilterMatchesProduct } from "@api/products/utils/match/planFilterMatchesProduct";
import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
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
import type { WhenFields } from "../whenFieldTypes";

type FeatureQuantity = IncomingPlanFacts["feature_quantities"][number];
type Discount = BillingChangeFacts["discounts"][number];

const incomingPlanFields: WhenFields<IncomingPlanFacts> = {
	...planFields<IncomingPlanFacts>({
		planLabel: "Incoming plan",
		matchesPlan: ({ filter, item }) =>
			planFilterMatchesProduct({ filter, product: item.product }),
		readPlanId: (item) => item.product.id,
		readVersion: (item) => item.product.version ?? null,
	}),
	free_trial: freeTrialField<IncomingPlanFacts>({
		read: (item) => item.free_trial,
	}),
	feature_quantities: arrayField<IncomingPlanFacts, FeatureQuantity>({
		label: "Quantity",
		read: (item) => item.feature_quantities,
		element: {
			feature_id: stringField({
				label: "Feature",
				read: (row) => row.feature_id,
			}),
			quantity: numberField({ label: "Quantity", read: (row) => row.quantity }),
		},
	}),
	customized: booleanField<IncomingPlanFacts>({
		label: "Custom pricing",
		read: (item) => item.customized,
	}),
};

/** Outgoing plans for a billing change; cancel labels them "Plan". */
export const outgoingPlanFields = ({ planLabel }: { planLabel: string }) =>
	planFields<FullCusProduct>({
		planLabel,
		matchesPlan: ({ filter, item }) =>
			planFilterMatchesCustomerProduct({ filter, cusProduct: item }),
		readPlanId: (item) => item.product_id,
		readVersion: (item) => item.product?.version ?? null,
	});

const formatPercent = (value: number) => `${value}%`;

export const billingChangeFields: WhenFields<BillingChangeFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	incoming: arrayField({
		label: "Incoming plan",
		read: (facts) => facts.incoming,
		element: incomingPlanFields,
	}),
	outgoing: arrayField({
		label: "Outgoing plan",
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({ planLabel: "Outgoing plan" }),
	}),
	paid: booleanField({
		label: "Charges customer",
		read: (facts) => facts.paid,
	}),
	checkout: booleanField({
		label: "Sends checkout link",
		read: (facts) => facts.checkout,
	}),
	total: numberField({ label: "Due now", read: (facts) => facts.total }),
	next_cycle: nullableObjectField<BillingChangeFacts, { total: number }>({
		label: "Next cycle",
		read: (facts) => facts.next_cycle,
		fields: {
			total: numberField({ label: "Next cycle", read: (cycle) => cycle.total }),
		},
		describeValue: (cycle) => String(cycle.total),
	}),
	discounts: arrayField<BillingChangeFacts, Discount>({
		label: "Discount",
		read: (facts) => facts.discounts,
		element: {
			reward_id: stringField({
				label: "Discount",
				read: (row) => row.reward_id,
			}),
			percent_off: numberField({
				label: "Discount percent off",
				read: (row) => row.percent_off,
				format: formatPercent,
			}),
			amount_off: numberField({
				label: "Discount amount off",
				read: (row) => row.amount_off,
			}),
		},
	}),
	plan_schedule: stringField({
		label: "Schedule",
		read: (facts) => facts.plan_schedule,
	}),
	proration_behavior: stringField({
		label: "Proration",
		read: (facts) => facts.proration_behavior,
	}),
	starts_at: relativeDateField({
		label: "Start date",
		read: (facts) => facts.starts_at,
	}),
	invoice_mode: nullableObjectField<BillingChangeFacts, { enabled: boolean }>({
		label: "Invoice mode",
		read: (facts) => facts.invoice_mode,
		fields: {
			enabled: booleanField({
				label: "Invoice mode",
				read: (mode) => mode.enabled,
			}),
		},
		describeValue: (mode) => (mode.enabled ? "enabled" : "disabled"),
	}),
};
