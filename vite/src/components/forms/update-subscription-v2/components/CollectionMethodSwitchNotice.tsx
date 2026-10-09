import { format } from "date-fns";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function CollectionMethodSwitchNotice() {
	const { collectionMethodSwitch, previewQuery, formContext } =
		useUpdateSubscriptionFormContext();
	const { isActive, missingCard, sendsInvoice, netTermsDays } =
		collectionMethodSwitch;
	if (!isActive || missingCard) return null;

	const renewsAt = previewQuery.data?.next_cycle?.starts_at;
	const renewals = `${formContext.customerProduct.product.name} renewals${
		renewsAt ? ` from ${format(renewsAt, "MMM d")}` : ""
	}`;
	const outcome = sendsInvoice
		? `are sent as invoices due in ${netTermsDays} days`
		: "are charged to the card on file";

	return (
		<div className="px-4 pt-4">
			<InfoBox variant="info" classNames={{ infoBox: "w-full" }}>
				{renewals} {outcome}. Nothing is charged now, and open invoices keep
				their method.
			</InfoBox>
		</div>
	);
}
