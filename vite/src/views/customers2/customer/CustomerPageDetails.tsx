import { FingerprintIcon, TicketIcon } from "@phosphor-icons/react";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";
import { CustomerActions } from "./CustomerActions";
import { useCustomerContext } from "./CustomerContext";

const mutedDivClassName =
	"py-0.5 px-1.5 rounded-lg text-t3 text-tiny flex items-center gap-2 h-6 max-w-48 truncate bg-muted text-tiny-id";

const placeholderText = "NULL";

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();
	const { stripeCus } = useCusReferralQuery();

	const appliedCoupon = stripeCus?.discount?.source;

	return (
		<div className="flex h-4 items-center">
			<div className="flex gap-2">
				{customer.email && (
					<CopyButton
						text={customer.email ?? placeholderText}
						size="mini"
						className="!text-t3"
						innerClassName="max-w-30 truncate !font-normal"
					>
						{/* <EnvelopeIcon className="!w-4 mt-0.5" weight="regular" /> */}
					</CopyButton>
				)}
				<CopyButton
					text={customer.id ?? placeholderText}
					size="mini"
					className="!text-t3"
					innerClassName="max-w-30 truncate !font-normal"
				>
					{/* <UserCircleIcon
						size={10}
						className="!w-4"
					/> */}
				</CopyButton>
				{customer.fingerprint && (
					<div className={mutedDivClassName}>
						<FingerprintIcon size={12} className="shrink-0" />
						<span className="truncate">
							{customer.fingerprint ?? placeholderText}
						</span>
					</div>
				)}
				{appliedCoupon && (
					<div className={mutedDivClassName}>
						<TicketIcon size={13} className="shrink-0" />
						<span className="truncate">{appliedCoupon.coupon}</span>
					</div>
				)}
				<CustomerActions />
			</div>
		</div>
	);
};
