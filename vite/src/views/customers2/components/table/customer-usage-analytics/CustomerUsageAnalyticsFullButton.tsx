import { ChartBarIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { pushPage } from "@/utils/genUtils";

export function CustomerUsageAnalyticsFullButton() {
	// const navigate = useNavigate();

	return (
		<Button
			variant="secondary"
			size="mini"
			className="flex items-center gap-1"
			onClick={() => {
				pushPage({ path: "/analytics", navigate });
			}}
		>
			<ChartBarIcon className="text-t3" />
			Full Analytics
		</Button>
	);
}
