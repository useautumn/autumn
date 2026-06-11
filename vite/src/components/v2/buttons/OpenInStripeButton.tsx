import { IconTooltipButton } from "@/components/v2/buttons/IconTooltipButton";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink } from "@/utils/linkUtils";

export function OpenInStripeButton({
	subscriptionId,
	className,
}: {
	subscriptionId: string;
	className?: string;
}) {
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const handleOpen = () => {
		window.open(
			getStripeSubLink({
				subscriptionId,
				env,
				accountId: stripeAccount?.id,
			}),
			"_blank",
		);
	};

	return (
		<IconTooltipButton
			tooltip="Open in Stripe"
			icon={<StripeIcon size={14} />}
			onClick={handleOpen}
			className={className}
		/>
	);
}
