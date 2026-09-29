import type { SyncProposalV2 } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
import { type StripeStatusTone, stripeObjectToStatus } from "./stripeStatus";

const TONE_INDICATORS: Record<
	StripeStatusTone,
	{ tone: StatusTone; glyph: StatusGlyph }
> = {
	good: { tone: "green", glyph: "check" },
	warning: { tone: "amber", glyph: "alert" },
	bad: { tone: "red", glyph: "x" },
	neutral: { tone: "neutral", glyph: "minus" },
};

/** The Stripe subscription's (or not-yet-started schedule's) live status. */
export function StripeStatusBadge({ proposal }: { proposal: SyncProposalV2 }) {
	const status = stripeObjectToStatus({
		subscription: proposal.stripe_subscription,
		schedule: proposal.stripe_schedule,
	});
	if (!status) return null;

	return (
		<StatusChip {...TONE_INDICATORS[status.tone]}>{status.label}</StatusChip>
	);
}
