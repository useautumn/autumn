import type { SyncProposalV2 } from "@autumn/shared";
import { StatusChip, StatusChipIcon } from "@autumn/ui";
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
	neutral: { icon: MinusIcon, className: "bg-zinc-400 dark:bg-zinc-500" },
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
		<StatusChip
			indicator={
				<StatusChipIcon
					icon={<ToneIcon weight="bold" />}
					className={className}
				/>
			}
		>
			{status.label}
		</StatusChip>
	);
}
