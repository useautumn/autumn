import type { InvoiceFacts } from "../../facts/invoiceFacts";
import type {
	CatalogFeatureFacts,
	CatalogPlanFacts,
	CustomerFacts,
	RewardApplyFacts,
} from "../../facts/otherFacts";
import { customerField } from "../fields/customerField";
import { numberField } from "../fields/numberField";
import { refundField } from "../fields/refundField";
import { stringField } from "../fields/stringField";
import type { WhenFields } from "../whenFieldTypes";

export const invoiceFields: WhenFields<InvoiceFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	total: numberField({ label: "Invoice total", read: (facts) => facts.total }),
	refund: refundField({ read: (facts) => facts.refund }),
};

export const rewardApplyFields: WhenFields<RewardApplyFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	reward_id: stringField({ label: "Reward", read: (facts) => facts.reward_id }),
};

export const customerFields: WhenFields<CustomerFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
};

export const catalogPlanFields: WhenFields<CatalogPlanFacts> = {
	plan_id: stringField({ label: "Plan", read: (facts) => facts.plan_id }),
};

export const catalogFeatureFields: WhenFields<CatalogFeatureFacts> = {
	feature_id: stringField({
		label: "Feature",
		read: (facts) => facts.feature_id,
	}),
};
