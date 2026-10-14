import { Button } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { pushPage } from "@/utils/genUtils";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

export function CustomerUsageAnalyticsFullButton() {
	const { customer } = useCustomerContext();
	const navigate = useNavigate();

	return (
		<Button
			variant="secondary"
			size="mini"
			className="flex items-center gap-1"
			onClick={() => {
				pushPage({
					path: "/analytics",
					queryParams: { customer_id: customer.id ?? undefined },
					navigate,
				});
			}}
		>
			<ChartBarIcon className="text-tertiary-foreground" />
			Full Analytics
		</Button>
	);
}
