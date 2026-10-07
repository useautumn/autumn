import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export const CustomerPlanInfoBox = ({
	scope = "customer",
}: {
	scope?: "customer" | "invoice";
}) => {
	const { customer } = useCusQuery();
	const customerLabel = customer?.name || customer?.email || customer?.id || "";

	if (scope === "invoice") {
		return (
			<InfoBox classNames={{ infoBox: "w-full max-w-xl" }}>
				You're customizing this plan for this invoice only. The catalog and the
				customer's plan won't change.
			</InfoBox>
		);
	}

	return (
		<InfoBox classNames={{ infoBox: "w-full max-w-xl" }}>
			You're creating a custom plan. Changes will only apply to this customer
			{customerLabel && <span className="font-medium"> ({customerLabel})</span>}
			.
		</InfoBox>
	);
};
