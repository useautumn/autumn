import type { SyncProposalV2 } from "@autumn/shared";
import { NEUTRAL_STATUS_ICON_CLASS, StatusChip } from "@autumn/ui";
import {
	CheckIcon,
	ExclamationMarkIcon,
	type Icon,
	MinusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type StripeStatusTone, stripeObjectToStatus } from "./stripeStatus";

const TONE_INDICATORS: Record<
	StripeStatusTone,
	{ icon: Icon; className: string }
> = {
	good: { icon: CheckIcon, className: "bg-green-500" },
	warning: { icon: ExclamationMarkIcon, className: "bg-amber-500" },
	bad: { icon: XIcon, className: "bg-red-500" },
	neutral: { icon: MinusIcon, className: NEUTRAL_STATUS_ICON_CLASS },
};

/** The Stripe subscription's (or not-yet-started schedule's) live status. */
export function StripeStatusBadge({ proposal }: { proposal: SyncProposalV2 }) {
	const status = stripeObjectToStatus({
		subscription: proposal.stripe_subscription,
		schedule: proposal.stripe_schedule,
	});
	if (!status) return null;

	const { icon: ToneIcon, className } = TONE_INDICATORS[status.tone];

	return (
		<StatusChip icon={<ToneIcon weight="bold" />} iconClassName={className}>
			{status.label}
		</StatusChip>
	);
}
