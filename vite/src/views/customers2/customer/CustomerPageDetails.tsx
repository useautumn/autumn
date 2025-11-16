import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FingerprintIcon, Ticket } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeCusLink } from "@/utils/linkUtils";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";
import { useCustomerContext } from "./CustomerContext";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-t3 text-sm flex items-center gap-1 h-6 max-w-48 truncate ";

const placeholderText = "NULL";

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { stripeCus } = useCusReferralQuery();

	const appliedCoupon = stripeCus?.discount?.coupon;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<CopyButton
					text={customer.id ?? placeholderText}
					size="sm"
					innerClassName="!text-sm !font-sans max-w-48 truncate"
				/>
				{customer.email && (
					<div className={mutedDivClassName}>
						<span className="truncate">
							{customer.email ?? placeholderText}
						</span>
					</div>
				)}
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
				{customer.processor?.id && (
					<Button
						variant="muted"
						size="sm"
						onClick={() => {
							window.open(
								getStripeCusLink({
									customerId: customer.processor.id,
									env,
									accountId: stripeAccount?.id,
								}),
								"_blank",
							);
						}}
					>
						<FontAwesomeIcon icon={faStripe} className="!h-6 !w-6 text-t3" />
						{/* <ArrowSquareOutIcon size={12} /> */}
					</Button>
				)}
			</div>
		</div>
	);
};
