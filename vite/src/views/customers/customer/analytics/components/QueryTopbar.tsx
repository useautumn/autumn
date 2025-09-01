import { Check, ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useAnalyticsContext } from "../AnalyticsContext";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";

export const INTERVALS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	"1bc": "Current billing cycle",
	"3bc": "Latest 3 billing cycles",
};

export const QueryTopbar = () => {
	const { customer, selectedInterval, setSelectedInterval, bcExclusionFlag } =
		useAnalyticsContext();
	const navigate = useNavigate();
	const location = useLocation();

	const updateQueryParams = (key: string, value: string) => {
		const params = new URLSearchParams(location.search);
		params.set(key, value);
		navigate(`${location.pathname}?${params.toString()}`);
	};

	return (
		<div className="flex items-center py-0 h-full">
			<CustomerComboBox
				classNames={{
					trigger: "h-full border-y-0 border-l border-r-0",
				}}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild value={selectedInterval}>
					<Button
						variant="outline"
						className="px-3 text-xs h-full border-y-0 border-x"
					>
						{INTERVALS[selectedInterval]}
						<ChevronDown className="ml-2 h-3 w-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[160px]">
					{Object.keys(INTERVALS)
						.filter((interval) => {
							if (bcExclusionFlag || !customer) {
								return interval !== "1bc" && interval !== "3bc";
							}
							return true;
						})
						.map((interval) => (
							<DropdownMenuItem
								key={interval}
								onClick={() => {
									setSelectedInterval(interval);
									updateQueryParams("interval", interval);
								}}
								className="flex items-center justify-between"
							>
								{INTERVALS[interval]}
								{selectedInterval === interval && (
									<Check className="ml-2 h-3 w-3 text-t3" />
								)}
							</DropdownMenuItem>
						))}
				</DropdownMenuContent>
			</DropdownMenu>
			<SelectFeatureDropdown
				classNames={{
					trigger: "h-full border-y-0 border-l-0 border-r-1",
				}}
			/>
		</div>
	);
};
