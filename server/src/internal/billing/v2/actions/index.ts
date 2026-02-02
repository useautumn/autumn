import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { downgrade } from "@/internal/billing/v2/actions/legacy/downgrade";
import { upgrade } from "@/internal/billing/v2/actions/legacy/upgrade";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";

export const billingActions = {
	attach: attach,
	updateSubscription: updateSubscription,

	legacy: {
		upgrade: upgrade,
		downgrade: downgrade,
	},
} as const;
