import { APPROVAL_FILTER_FIELD_LABELS } from "../../../schemas/filters/approvalFilterFieldLabels";
import type { InvoiceFacts } from "../../facts/invoiceFacts";
import type {
	CustomerChangeFacts,
	FeatureFacts,
	PlanFacts,
	RewardRedeemFacts,
} from "../../facts/otherFacts";
import { customerField } from "../fields/customerField";
import { numberField } from "../fields/numberField";
import { refundField } from "../fields/refundField";
import { stringField } from "../fields/stringField";
import type { FilterFields } from "../filterFieldTypes";

const LABELS = APPROVAL_FILTER_FIELD_LABELS;

export const invoiceFields: FilterFields<InvoiceFacts> = {
	customer: customerField({
		labels: LABELS.invoice,
		read: (facts) => facts.customer,
	}),
	total: numberField({
		label: LABELS.invoice.total,
		read: (facts) => facts.total,
	}),
	refund: refundField({
		labels: LABELS.invoice,
		read: (facts) => facts.refund,
	}),
};

export const rewardRedeemFields: FilterFields<RewardRedeemFacts> = {
	customer: customerField({
		labels: LABELS.reward_redeem,
		read: (facts) => facts.customer,
	}),
	reward_id: stringField({
		label: LABELS.reward_redeem.reward_id,
		read: (facts) => facts.reward_id,
	}),
};

export const customerChangeFields: FilterFields<CustomerChangeFacts> = {
	customer: customerField({
		labels: LABELS.customer_change,
		read: (facts) => facts.customer,
	}),
};

export const planCatalogFields: FilterFields<PlanFacts> = {
	plan_id: stringField({
		label: LABELS.plan.plan_id,
		read: (facts) => facts.plan_id,
	}),
};

export const featureFields: FilterFields<FeatureFacts> = {
	feature_id: stringField({
		label: LABELS.feature.feature_id,
		read: (facts) => facts.feature_id,
	}),
};
