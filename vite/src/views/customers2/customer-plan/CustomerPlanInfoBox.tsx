import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export const CustomerPlanInfoBox = () => {
	const { customer } = useCusQuery();
	const customerLabel = customer?.name || customer?.email || customer?.id || "";

	return (
		<InfoBox>
			<h1>
			<h1>
				You're creating a custom plan. Changes will only apply to this customer
				{customerLabel && (
					<>
						{" "}
						<span
							className="inline-block max-w-[200px] truncate align-bottom font-medium"
							title={customerLabel}
						>
							({customerLabel})
						</span>
					</>
				)}
				.
			</h1>
			</h1>
		</InfoBox>
	);
};
