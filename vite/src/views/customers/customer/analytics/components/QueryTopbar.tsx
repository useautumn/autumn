import { CaretDownIcon } from "@phosphor-icons/react";
import { Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/v2/buttons/IconButton";

import { useAnalyticsContext } from "../AnalyticsContext";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";
import { SelectGroupByDropdown } from "./SelectGroupByDropdown";

export const INTERVALS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	"1bc": "Current billing cycle",
	"3bc": "Latest 3 billing cycles",
};

export const QueryTopbar = () => {
	const {
		customer,
		selectedInterval,
		setSelectedInterval,
		bcExclusionFlag,
		propertyKeys,
		refreshAnalytics,
	} = useAnalyticsContext();
	const navigate = useNavigate();
	const location = useLocation();
	const [isRefreshing, setIsRefreshing] = useState(false);

	const updateQueryParams = (key: string, value: string) => {
		const params = new URLSearchParams(location.search);
		params.set(key, value);
		navigate(`${location.pathname}?${params.toString()}`);
	};

	const handleRefresh = async () => {
		if (!refreshAnalytics || isRefreshing) return;
		setIsRefreshing(true);
		try {
			await refreshAnalytics();
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="flex items-center py-0 h-full gap-2">
			<CustomerComboBox
				classNames={{
					trigger: "h-full border-y-0 border-l border-r-0",
				}}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild value={selectedInterval}>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretDownIcon size={12} weight="bold" />}
						iconOrientation="right"
						// iconPosition="right"
					>
						{INTERVALS[selectedInterval]}
					</IconButton>
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
					trigger: "h-full border-y-0 border-l-0 border-r-0",
				}}
			/>
			{propertyKeys && propertyKeys.length > 0 && (
				<SelectGroupByDropdown
					propertyKeys={propertyKeys}
					classNames={{
						trigger: "h-full border-y-0 border-l-0 border-r-0",
					}}
				/>
			)}
			<Button
				variant="outline"
				className="px-3 text-xs h-full border-y-0 border-l-0 border-r"
				onClick={handleRefresh}
				disabled={isRefreshing}
			>
				<RefreshCw
					className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
				/>
			</Button>
		</div>
	);
};
