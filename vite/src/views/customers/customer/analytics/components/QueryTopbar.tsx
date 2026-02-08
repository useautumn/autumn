import { CaretDownIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";

import { useAnalyticsContext } from "../AnalyticsContext";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";
import { SelectGroupByDropdown } from "./SelectGroupByDropdown";

// Simple intervals without bin size options
const SIMPLE_INTERVALS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"1bc": "Current billing cycle",
};

// Intervals that support bin size selection (day/month)
const BIN_SIZE_INTERVALS: Record<string, string> = {
	"90d": "Last 90 days",
	"3bc": "Latest 3 billing cycles",
};

const ALL_INTERVALS: Record<string, string> = {
	...SIMPLE_INTERVALS,
	...BIN_SIZE_INTERVALS,
};

const BIN_SIZE_LABELS: Record<string, string> = {
	day: "by day",
	month: "by month",
};

const getDisplayLabel = ({
	interval,
	binSize,
}: {
	interval: string;
	binSize: string;
}) => {
	if (BIN_SIZE_INTERVALS[interval] && binSize === "month") {
		return `${ALL_INTERVALS[interval]} (by month)`;
	}
	return ALL_INTERVALS[interval];
};

export const QueryTopbar = () => {
	const {
		customer,
		selectedInterval,
		setSelectedInterval,
		selectedBinSize,
		setSelectedBinSize,
		bcExclusionFlag,
		propertyKeys,
	} = useAnalyticsContext();
	const navigate = useNavigate();
	const location = useLocation();

	const updateQueryParams = ({
		interval,
		binSize,
	}: {
		interval?: string;
		binSize?: string;
	}) => {
		const params = new URLSearchParams(location.search);
		if (interval !== undefined) {
			params.set("interval", interval);
		}
		if (binSize !== undefined) {
			params.set("bin_size", binSize);
		}
		navigate(`${location.pathname}?${params.toString()}`);
	};

	const handleSimpleIntervalSelect = (interval: string) => {
		setSelectedInterval(interval);
		setSelectedBinSize("day");
		updateQueryParams({ interval, binSize: "day" });
	};

	const handleBinSizeIntervalSelect = ({
		interval,
		binSize,
	}: {
		interval: string;
		binSize: string;
	}) => {
		setSelectedInterval(interval);
		setSelectedBinSize(binSize);
		updateQueryParams({ interval, binSize });
	};

	const shouldShowBillingCycleOptions = !bcExclusionFlag && customer;

	return (
		<div className="flex items-center py-0 h-full gap-2">
			<CustomerComboBox />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretDownIcon size={12} weight="bold" />}
						iconOrientation="right"
					>
						{getDisplayLabel({
							interval: selectedInterval,
							binSize: selectedBinSize,
						})}
					</IconButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[200px]">
					{/* Simple intervals without submenus */}
					{Object.keys(SIMPLE_INTERVALS)
						.filter((interval) => {
							if (!shouldShowBillingCycleOptions) {
								return interval !== "1bc";
							}
							return true;
						})
						.map((interval) => (
							<DropdownMenuItem
								key={interval}
								onClick={() => handleSimpleIntervalSelect(interval)}
								className="flex items-center justify-between"
							>
								{SIMPLE_INTERVALS[interval]}
								{selectedInterval === interval && (
									<Check className="ml-2 h-3 w-3 text-t3" />
								)}
							</DropdownMenuItem>
						))}

					{/* Intervals with bin size submenus */}
					{Object.keys(BIN_SIZE_INTERVALS)
						.filter((interval) => {
							if (!shouldShowBillingCycleOptions) {
								return interval !== "3bc";
							}
							return true;
						})
						.map((interval) => (
							<DropdownMenuSub key={interval}>
								<DropdownMenuSubTrigger className="flex items-center justify-between">
									{BIN_SIZE_INTERVALS[interval]}
									{selectedInterval === interval && (
										<Check className="mr-1 h-3 w-3 text-t3" />
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{Object.entries(BIN_SIZE_LABELS).map(([binSize, label]) => (
										<DropdownMenuItem
											key={binSize}
											onClick={() =>
												handleBinSizeIntervalSelect({ interval, binSize })
											}
											className="flex items-center justify-between"
										>
											{label}
											{selectedInterval === interval &&
												selectedBinSize === binSize && (
													<Check className="ml-2 h-3 w-3 text-t3" />
												)}
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						))}
				</DropdownMenuContent>
			</DropdownMenu>
			<SelectFeatureDropdown />
			{propertyKeys && propertyKeys.length > 0 && (
				<SelectGroupByDropdown propertyKeys={propertyKeys} />
			)}
		</div>
	);
};
