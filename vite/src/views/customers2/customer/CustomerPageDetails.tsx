import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowSquareOutIcon, FingerprintIcon } from "@phosphor-icons/react";
import { ArrowUpRightFromSquare } from "lucide-react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeCusLink } from "@/utils/linkUtils";
import { useCustomerContext } from "./CustomerContext";

const mutedDivClassName =
	"py-0.5 px-1.5 bg-muted rounded-lg text-t3 text-sm flex items-center justify-center gap-1 h-6";

const placeholderText = "NULL";

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();

	return (
		<div className="flex gap-2">
			<CopyButton
				text={customer.id ?? placeholderText}
				size="sm"
				innerClassName="!text-sm !font-sans"
			/>
			<div className={mutedDivClassName}>
				{customer.email ?? placeholderText}
			</div>
			<div className={mutedDivClassName}>
				<FingerprintIcon size={16} />
				{customer.fingerprint ?? placeholderText}
			</div>
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
					<ArrowSquareOutIcon size={12} />
				</Button>
			)}
		</div>
	);
};
