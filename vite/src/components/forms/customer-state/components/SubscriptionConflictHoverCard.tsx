import { setPlansErrorCopy } from "@autumn/shared";
import {
	Button,
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	StatusChip,
} from "@autumn/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useCustomerStateContext } from "../CustomerStateProvider";
import type { SubscriptionConflict } from "../utils/findSubscriptionConflict";

/** The same sentence the server's cross-subscription error uses. */
const conflictReasonParts = ({
	productName,
	conflict,
}: {
	productName: string;
	conflict: SubscriptionConflict;
}) =>
	setPlansErrorCopy({
		type: "plan_on_another_subscription",
		conflict:
			productName === conflict.conflictingPlanName
				? "already_billed"
				: "replaces",
		requested_plan_name: productName,
		conflicting_plan_name: conflict.conflictingPlanName,
		stripe_subscription_id: conflict.stripeSubscriptionId,
		subscription_plan_name: conflict.subscriptionPlanName,
	}).line;

/** The other subscription a plan clashes with, and a way over to it. */
export function SubscriptionConflictHoverCard({
	productName,
	conflict,
}: {
	productName: string;
	conflict: SubscriptionConflict;
}) {
	const { subscriptionLinks } = useCustomerStateContext();
	const summary = subscriptionLinks?.describe(conflict.stripeSubscriptionId);
	const subscriptionName = `${conflict.subscriptionPlanName} subscription`;

	return (
		<HoverCard>
			<HoverCardTrigger asChild delay={150} closeDelay={100}>
				<span className="pointer-events-auto inline-flex shrink-0 cursor-default items-center gap-1 text-xs text-subtle">
					<StripeIcon size={11} className="text-indigo-500" />
					Subscription conflict
				</span>
			</HoverCardTrigger>
			<HoverCardContent
				side="bottom"
				align="end"
				className="w-72 overflow-hidden rounded-[10px] border-overlay-border bg-overlay p-0 shadow-overlay"
			>
				<div className="flex items-center gap-2.5 border-b border-overlay-border px-3 py-2.5">
					<span className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-indigo-500/20 bg-indigo-500/[0.12]">
						<StripeIcon size={12} className="text-indigo-500" />
					</span>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-sm font-semibold text-foreground">
							{subscriptionName}
						</span>
						{summary?.details && (
							<span className="truncate text-xs text-tertiary-foreground">
								{summary.details}
							</span>
						)}
					</span>
					{summary?.status && (
						<StatusChip tone={summary.status.tone} glyph={summary.status.glyph}>
							{summary.status.label}
						</StatusChip>
					)}
				</div>
				<div className="flex flex-col gap-2 px-3 py-2.5">
					<p className="flex gap-2 text-xs text-muted-foreground">
						<WarningCircleIcon
							weight="fill"
							aria-hidden
							className="mt-px size-3.5 shrink-0 text-red-500/80"
						/>
						<span>
							<SetPlansTextLine
								parts={conflictReasonParts({ productName, conflict })}
							/>
						</span>
					</p>
					{subscriptionLinks && (
						<Button
							variant="secondary"
							className="w-full"
							onClick={() =>
								subscriptionLinks.open(conflict.stripeSubscriptionId)
							}
						>
							Edit subscription
						</Button>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
