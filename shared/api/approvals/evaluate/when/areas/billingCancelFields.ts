import { WHEN_FIELD_LABELS } from "../../../schemas/when/whenFieldLabels";
import type { BillingCancelFacts } from "../../facts/billingFacts";
import { arrayField } from "../fields/arrayField";
import { customerField } from "../fields/customerField";
import { refundField } from "../fields/refundField";
import { stringField } from "../fields/stringField";
import { labelsUnder } from "../labelsUnder";
import type { WhenFields } from "../whenFieldTypes";
import { outgoingPlanFields } from "./billingChangeFields";

const labels = WHEN_FIELD_LABELS.billing_cancel;

export const billingCancelFields: WhenFields<BillingCancelFacts> = {
	customer: customerField({
		label: labels.customer,
		read: (facts) => facts.customer,
	}),
	cancel_action: stringField({
		label: labels.cancel_action,
		read: (facts) => facts.cancel_action,
	}),
	outgoing: arrayField({
		label: labels.outgoing,
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({
			labels: labelsUnder({ labels, prefix: "outgoing" }),
		}),
	}),
	refund: refundField({ label: labels.refund, read: (facts) => facts.refund }),
};
