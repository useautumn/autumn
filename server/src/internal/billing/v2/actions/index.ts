import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";

export const billingActions = {
	attach: attach,
	updateSubscription: updateSubscription,
} as const;
