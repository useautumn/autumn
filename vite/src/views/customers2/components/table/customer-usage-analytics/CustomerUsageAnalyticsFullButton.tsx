import { ChartBarIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function CustomerUsageAnalyticsFullButton() {
	const { customer } = useCusQuery();
	const navigate = useNavigate();

	return (
		<Button
			variant="secondary"
			size="mini"
			className="flex items-center gap-1"
			onClick={() => {
				pushPage({
					path: "/analytics",
					queryParams: { customer_id: customer.id },
					navigate,
				});
			}}
		>
			<ChartBarIcon className="text-t3" />
			Full Analytics
		</Button>
	);
}
