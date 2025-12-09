import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	ArrowSquareOutIcon,
	FingerprintIcon,
	Ticket,
} from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeCusLink } from "@/utils/linkUtils";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";
import { useCustomerContext } from "./CustomerContext";

const mutedDivClassName =
	"py-0.5 px-1.5 rounded-lg text-t3 text-tiny flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "NULL";

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();
	const { stripeCus } = useCusReferralQuery();
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();

	const appliedCoupon = stripeCus?.discount?.coupon;
	const stripeCustomerId = customer?.processor?.id;

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
					<div className="py-0.5 px-1.5 bg-secondary rounded-lg text-t3 text-sm flex items-center gap-1 h-6 max-w-48 truncate">
						<Ticket size={12} className="shrink-0" />
						<span className="truncate">{appliedCoupon.name}</span>
					</div>
				)}
				{stripeCustomerId && (
					<Button
						variant="muted"
						size="mini"
						onClick={() => {
							window.open(
								getStripeCusLink({
									customerId: stripeCustomerId,
									env,
									accountId: stripeAccount?.id,
								}),
								"_blank",
							);
						}}
						className="text-t3 flex items-center gap-1"
					>
						<FontAwesomeIcon icon={faStripe} size="xl" />
						<ArrowSquareOutIcon className="size-3.5 mb-0.75" />
					</Button>
				)}
			</div>
		</div>
	);
};
