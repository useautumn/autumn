import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export const CustomerPlanInfoBox = () => {
	const { customer } = useCusQuery();
	const customerLabel = customer?.name || customer?.email || customer?.id || "";
	const message = `You're creating a custom plan. Changes will only apply to this customer${customerLabel ? ` (${customerLabel})` : ""}.`;

	return (
		<InfoBox>
			<span className="block truncate" title={message}>
				You're creating a custom plan. Changes will only apply to this customer
				{customerLabel && (
					<span className="font-medium"> ({customerLabel})</span>
				)}
				.
			</span>
		</InfoBox>
	);
};
