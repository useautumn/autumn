import { SmallSpinner } from "@autumn/ui";
import { TicketIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";

export const AppliedCouponChip = ({ className }: { className?: string }) => {
	const { stripeCus, cusRewardRefetch } = useCusReferralQuery();
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const [removing, setRemoving] = useState(false);

	const appliedCoupon = stripeCus?.discount?.source;

	if (!appliedCoupon) return null;

	const handleRemoveClicked = async () => {
		try {
			setRemoving(true);
			await CusService.removeCouponFromCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
			});
			await Promise.all([refetch(), cusRewardRefetch()]);
			toast.success("Reward removed from customer");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove coupon"));
		} finally {
			setRemoving(false);
		}
	};

	return (
		<div className={className} title={appliedCoupon.coupon}>
			<TicketIcon size={13} className="shrink-0" />
			<span className="truncate">{appliedCoupon.coupon}</span>
			<button
				type="button"
				aria-label="Remove coupon"
				onClick={handleRemoveClicked}
				disabled={removing}
				className="shrink-0 opacity-60 hover:opacity-100 disabled:opacity-40 transition-opacity"
			>
				{removing ? <SmallSpinner size={11} /> : <XIcon size={11} />}
			</button>
		</div>
	);
};
