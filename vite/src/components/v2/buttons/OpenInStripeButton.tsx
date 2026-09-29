import { IconTooltipButton } from "@autumn/ui";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useStripeDashboardLink } from "@/hooks/useStripeDashboardLink";

export function OpenInStripeButton({
	subscriptionId,
	className,
}: {
	subscriptionId: string;
	className?: string;
}) {
	const getStripeLink = useStripeDashboardLink();

	return (
		<IconTooltipButton
			tooltip="Open in Stripe"
			icon={<StripeIcon size={14} />}
			onClick={() =>
				window.open(getStripeLink(`subscriptions/${subscriptionId}`), "_blank")
			}
			className={className}
		/>
	);
}
