import { WHEN_FIELD_LABELS } from "../../../schemas/when/whenFieldLabels";
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
	customer: customerField({
		label: WHEN_FIELD_LABELS.invoice.customer,
		read: (facts) => facts.customer,
	}),
	total: numberField({
		label: WHEN_FIELD_LABELS.invoice.total,
		read: (facts) => facts.total,
	}),
	refund: refundField({
		label: WHEN_FIELD_LABELS.invoice.refund,
		read: (facts) => facts.refund,
	}),
};

export const rewardApplyFields: WhenFields<RewardApplyFacts> = {
	customer: customerField({
		label: WHEN_FIELD_LABELS.reward_apply.customer,
		read: (facts) => facts.customer,
	}),
	reward_id: stringField({
		label: WHEN_FIELD_LABELS.reward_apply.reward_id,
		read: (facts) => facts.reward_id,
	}),
};

export const customerFields: WhenFields<CustomerFacts> = {
	customer: customerField({
		label: WHEN_FIELD_LABELS.customer.customer,
		read: (facts) => facts.customer,
	}),
};

export const catalogPlanFields: WhenFields<CatalogPlanFacts> = {
	plan_id: stringField({
		label: WHEN_FIELD_LABELS.catalog_plan.plan_id,
		read: (facts) => facts.plan_id,
	}),
};

export const catalogFeatureFields: WhenFields<CatalogFeatureFacts> = {
	feature_id: stringField({
		label: WHEN_FIELD_LABELS.catalog_feature.feature_id,
		read: (facts) => facts.feature_id,
	}),
};
