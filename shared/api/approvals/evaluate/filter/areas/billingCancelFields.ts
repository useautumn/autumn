import { APPROVAL_FILTER_FIELD_LABELS } from "../../../schemas/filters/approvalFilterFieldLabels";
import type {
	BillingCancelFacts,
	BillingUncancelFacts,
} from "../../facts/billingFacts";
import { arrayField } from "../fields/arrayField";
import { customerField } from "../fields/customerField";
import { entityField } from "../fields/entityField";
import { refundField } from "../fields/refundField";
import { stringField } from "../fields/stringField";
import type { FilterFields } from "../filterFieldTypes";
import { labelsUnder } from "../labelsUnder";
import { outgoingPlanFields } from "./outgoingPlanFields";

const cancelLabels = APPROVAL_FILTER_FIELD_LABELS.billing_cancel;

export const billingCancelFields: FilterFields<BillingCancelFacts> = {
	customer: customerField({
		labels: cancelLabels,
		read: (facts) => facts.customer,
	}),
	entity: entityField({ labels: cancelLabels, read: (facts) => facts.entity }),
	cancel_action: stringField({
		label: cancelLabels.cancel_action,
		read: (facts) => facts.cancel_action,
	}),
	outgoing: arrayField({
		label: cancelLabels.outgoing,
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({
			labels: labelsUnder({ labels: cancelLabels, prefix: "outgoing" }),
		}),
	}),
	refund: refundField({ labels: cancelLabels, read: (facts) => facts.refund }),
};

const uncancelLabels = APPROVAL_FILTER_FIELD_LABELS.billing_uncancel;

export const billingUncancelFields: FilterFields<BillingUncancelFacts> = {
	customer: customerField({
		labels: uncancelLabels,
		read: (facts) => facts.customer,
	}),
	entity: entityField({
		labels: uncancelLabels,
		read: (facts) => facts.entity,
	}),
	outgoing: arrayField({
		label: uncancelLabels.outgoing,
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({
			labels: labelsUnder({ labels: uncancelLabels, prefix: "outgoing" }),
		}),
	}),
};
