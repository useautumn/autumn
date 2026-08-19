import { CopyButton } from "@autumn/ui";
import { FingerprintIcon } from "@phosphor-icons/react";
import { CustomerActions } from "./CustomerActions";
import { useCustomerContext } from "./CustomerContext";
import { AppliedCouponChip } from "./components/AppliedCouponChip";

const mutedDivClassName =
	"py-0.5 px-1.5 rounded-lg text-tertiary-foreground text-tiny flex items-center gap-2 h-6 max-w-48 truncate bg-muted text-tiny-id";

const placeholderText = "PENDING";

export const CustomerPageDetails = () => {
	const { customer } = useCustomerContext();

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
				<AppliedCouponChip className={mutedDivClassName} />
			</div>
			<CustomerActions />
		</div>
	);
};
