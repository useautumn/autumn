import { IconTooltipButton } from "@autumn/ui";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeSubLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";

export function OpenInStripeButton({
	subscriptionId,
	className,
}: {
	subscriptionId: string;
	className?: string;
}) {
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const env = useEnv();

	const connectViewAsLink =
		isAdmin && masterStripeAccount?.id && stripeAccount?.id
			? getStripeConnectViewAsLink({
					masterAccountId: masterStripeAccount.id,
					connectedAccountId: stripeAccount.id,
					env,
					path: `subscriptions/${subscriptionId}`,
				})
			: null;

	const handleOpen = () => {
		window.open(
			connectViewAsLink ??
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
