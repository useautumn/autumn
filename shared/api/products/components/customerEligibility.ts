import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { z } from "zod/v4";

export enum AttachAction {
	Activate = "activate",
	Upgrade = "upgrade",
	Downgrade = "downgrade",
	None = "none",
	Purchase = "purchase",
}

export enum EligibilityStatus {
	Active = "active",
	Scheduled = "scheduled",
}

export const CustomerEligibilitySchema = z.object({
	object: z.literal("customer_eligibility").optional().meta({ internal: true }),

	trial_available: z.boolean().optional().meta({
		description:
			"Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.",
	}),

	status: z.enum(EligibilityStatus).optional().meta({
		description:
			"The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.",
	}),
	canceling: z.boolean().optional().meta({
		description:
			"Whether the customer's active instance of this plan is set to cancel.",
	}),
	trialing: z.boolean().optional().meta({
		description:
			"Whether the customer is currently on a free trial of this plan.",
	}),

	attach_action: z.enum(AttachAction).meta({
		description:
			"The action that would occur if this plan were attached to the customer.",
	}),

	scenario: z.enum(AttachScenario).optional().meta({
		description: "Legacy attach scenario. Internal use only.",
		internal: true,
	}),
});

export type CustomerEligibility = z.infer<typeof CustomerEligibilitySchema>;
