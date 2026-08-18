import { CopyButton, IconButton } from "@autumn/ui";
import { FingerprintIcon, TicketIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";
import { CustomerActions } from "./CustomerActions";
import { useCustomerContext } from "./CustomerContext";

const mutedDivClassName =
	"py-0.5 px-1.5 rounded-lg text-tertiary-foreground text-tiny flex items-center gap-2 h-6 max-w-48 truncate bg-muted text-tiny-id";

const placeholderText = "PENDING";

const AppliedCouponChip = ({ couponId }: { couponId: string }) => {
	const { customer } = useCustomerContext();
	const { cusRewardRefetch } = useCusReferralQuery();
	const axiosInstance = useAxiosInstance();
	const [removing, setRemoving] = useState(false);

	const handleRemove = async () => {
		try {
			setRemoving(true);
			await CusService.removeCouponFromCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
			});
			await cusRewardRefetch();
			toast.success("Coupon removed from customer");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove coupon"));
		} finally {
			setRemoving(false);
		}
	};

	return (
		<div className={mutedDivClassName} title={couponId}>
			<TicketIcon size={13} className="shrink-0" />
			<span className="truncate">{couponId}</span>
			<IconButton
				variant="muted"
				size="sm"
				onClick={handleRemove}
				disabled={removing}
				icon={<XIcon size={10} />}
				aria-label="Remove coupon"
				className="shrink-0 -mr-1 text-tertiary-foreground hover:text-red-500"
			/>
		</div>
	);
};

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();
	const { stripeCus } = useCusReferralQuery();

	const appliedCoupon = stripeCus?.discount?.source;

	const emailTitle = customer.email ?? "This user's email is undefined";
	const idTitle = customer.id ?? "This user's id is undefined";
	const fingerprintTitle =
		customer.fingerprint ?? "This user's fingerprint is undefined";

	return (
		<div className="flex w-full sm:w-auto min-w-0 items-center justify-between gap-2 sm:justify-start">
			<div className="flex gap-2 flex-wrap min-w-0">
				{customer.email && (
					<CopyButton
						text={customer.email ?? placeholderText}
						title={emailTitle}
						size="mini"
						className="text-tertiary-foreground"
						innerClassName="max-w-30 text-tiny-id truncate !font-normal"
					></CopyButton>
				)}
				<CopyButton
					text={customer.id ?? placeholderText}
					title={idTitle}
					size="mini"
					className="text-tertiary-foreground"
					innerClassName="max-w-30 text-tiny-id truncate !font-normal"
				></CopyButton>
				{customer.fingerprint && (
					<div className={mutedDivClassName} title={fingerprintTitle}>
						<FingerprintIcon size={12} className="shrink-0" />
						<span className="truncate">
							{customer.fingerprint ?? placeholderText}
						</span>
					</div>
				)}
				{appliedCoupon && <AppliedCouponChip couponId={appliedCoupon.coupon} />}
			</div>
			<CustomerActions />
		</div>
	);
};
