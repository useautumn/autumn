import type { BillingCancelFacts } from "../../facts/billingFacts";
import { arrayField } from "../fields/arrayField";
import { customerField } from "../fields/customerField";
import { refundField } from "../fields/refundField";
import { stringField } from "../fields/stringField";
import type { WhenFields } from "../whenFieldTypes";
import { outgoingPlanFields } from "./billingChangeFields";

export const billingCancelFields: WhenFields<BillingCancelFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	cancel_action: stringField({
		label: "Timing",
		read: (facts) => facts.cancel_action,
	}),
	outgoing: arrayField({
		label: "Plan",
		read: (facts) => facts.outgoing,
		element: outgoingPlanFields({ planLabel: "Plan" }),
	}),
	refund: refundField({ read: (facts) => facts.refund }),
};
