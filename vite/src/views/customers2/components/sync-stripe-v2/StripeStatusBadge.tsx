import type { SyncProposalV2 } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import { type StripeStatusTone, stripeObjectToStatus } from "./stripeStatus";

const TONE_CLASSES: Record<StripeStatusTone, string> = {
	good: "text-green-500",
	warning: "text-amber-500",
	bad: "text-red-500",
	neutral: "text-tertiary-foreground",
};

/** The Stripe subscription's (or not-yet-started schedule's) live status. */
export function StripeStatusBadge({ proposal }: { proposal: SyncProposalV2 }) {
	const status = stripeObjectToStatus({
		subscription: proposal.stripe_subscription,
		schedule: proposal.stripe_schedule,
	});
	if (!status) return null;

	return (
		<Badge variant="muted" size="sm" className={TONE_CLASSES[status.tone]}>
			{status.label}
		</Badge>
	);
}
