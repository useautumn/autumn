import { ProcessorType } from "@autumn/shared";
import { IconTooltipButton } from "@autumn/ui";
import { BracketsSquareIcon, UserCircleGearIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import {
	getStripeConnectViewAsLink,
	getStripeCusLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { CustomButtons } from "./CustomButtons";
import { ShowCustomerObjectSheet } from "./ShowCustomerObjectSheet";

export function CustomerHeaderActions() {
	const { customer } = useCusQuery();
	const { org } = useOrg();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();

	const [portalLoading, setPortalLoading] = useState(false);
	const [showObjectOpen, setShowObjectOpen] = useState(false);

	const stripeCustomerId = customer?.processor?.id;
	const showStripe =
		Boolean(stripeCustomerId) &&
		customer?.processor?.type === ProcessorType.Stripe;

	const customButtons = org?.custom_buttons ?? [];

	const handleOpenStripe = () => {
		if (!stripeCustomerId) return;
		const connectViewAsLink =
			isAdmin && masterStripeAccount?.id && stripeAccount?.id
				? getStripeConnectViewAsLink({
						masterAccountId: masterStripeAccount.id,
						connectedAccountId: stripeAccount.id,
						env,
						path: `customers/${stripeCustomerId}`,
					})
				: null;
		window.open(
			connectViewAsLink ??
				getStripeCusLink({
					customerId: stripeCustomerId,
					env,
					accountId: stripeAccount?.id,
				}),
			"_blank",
		);
	};

	const handleOpenBillingPortal = async () => {
		if (!customer) return;
		setPortalLoading(true);
		try {
			const { url } = await CusService.createBillingPortalSession({
				axios: axiosInstance,
				customer_id: customer.id || customer.internal_id,
			});
			window.open(url, "_blank");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to open billing portal"));
		} finally {
			setPortalLoading(false);
		}
	};

	return (
		<div className="flex items-center gap-1">
			<CustomButtons buttons={customButtons} customer={customer} />
			<ShowCustomerObjectSheet
				open={showObjectOpen}
				setOpen={setShowObjectOpen}
			/>
			<IconTooltipButton
				tooltip="Show customer object"
				icon={<BracketsSquareIcon size={14} />}
				onClick={() => setShowObjectOpen(true)}
			/>
			<IconTooltipButton
				tooltip="Open customer portal"
				icon={<UserCircleGearIcon size={14} />}
				onClick={handleOpenBillingPortal}
				disabled={portalLoading}
			/>
			{showStripe && (
				<IconTooltipButton
					tooltip="Open in Stripe"
					icon={<StripeIcon size={14} />}
					onClick={handleOpenStripe}
				/>
			)}
		</div>
	);
}
