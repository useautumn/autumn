import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../AnalyticsContext";

export const SelectGroupByDropdown = ({
	propertyKeys,
}: {
	propertyKeys: string[];
}) => {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");

	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	const { groupFilter, setGroupFilter, availableGroupValues } =
		useAnalyticsContext();

	const currentGroupBy = searchParams.get("group_by") || "";
	const customerId = searchParams.get("customer_id");
	const showCustomerIdOption = !customerId;

	const updateQueryParams = ({ groupBy }: { groupBy: string | null }) => {
		const params = new URLSearchParams(location.search);

		if (groupBy) {
			params.set("group_by", groupBy);
		} else {
			params.delete("group_by");
		}

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const filteredOptions = propertyKeys.filter((key) =>
		key.toLowerCase().includes(searchValue.toLowerCase()),
	);

	const handleSelect = ({ property }: { property: string | null }) => {
		updateQueryParams({ groupBy: property });
		setOpen(false);
	};

	const displayValue = currentGroupBy || "No grouping";

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					icon={<CaretDownIcon size={12} weight="bold" />}
					iconOrientation="right"
					className={cn(open && "btn-secondary-active")}
				>
					{currentGroupBy
						? `Group: ${currentGroupBy === "customer_id" ? "Customer ID" : currentGroupBy}`
						: "Group By"}
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[200px]">
				{propertyKeys.length > 5 && (
					<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
						<MagnifyingGlassIcon className="size-4 text-t4" />
						<input
							type="text"
							placeholder="Search properties..."
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							onKeyDown={(e) => e.stopPropagation()}
							className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
						/>
					</div>
				)}

				<div className="max-h-[300px] overflow-y-auto pt-1">
					<DropdownMenuItem
						onClick={() => handleSelect({ property: null })}
						className="flex items-center justify-between"
					>
						<span className="text-xs">No grouping</span>
						{!currentGroupBy && <Check className="ml-2 h-3 w-3 text-t3" />}
					</DropdownMenuItem>

					{/* Customer ID special option - only shown when not filtering by a specific customer */}
					{showCustomerIdOption && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleSelect({ property: "customer_id" })}
								className="flex items-center justify-between"
							>
								<span className="text-xs font-medium text-t2">Customer ID</span>
								{currentGroupBy === "customer_id" && (
									<Check className="ml-2 h-3 w-3 text-t3" />
								)}
							</DropdownMenuItem>
						</>
					)}

					{propertyKeys.length > 0 && <DropdownMenuSeparator />}

					{filteredOptions.length === 0 && propertyKeys.length > 0 && (
						<div className="py-4 text-center text-sm text-t4">
							No properties found
						</div>
					)}

					{filteredOptions.map((property) => (
						<DropdownMenuItem
							key={property}
							onClick={() => handleSelect({ property })}
							className="flex items-center justify-between"
						>
							<span className="text-xs font-mono">{property}</span>
							{currentGroupBy === property && (
								<Check className="ml-2 h-3 w-3 text-t3" />
							)}
						</DropdownMenuItem>
					))}

					{/* Filter section - only shown when a groupBy is selected */}
					{currentGroupBy && availableGroupValues.length > 0 && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs text-t4 font-normal">
								Filter by value
							</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => setGroupFilter(null)}
								className="flex items-center justify-between"
							>
								<span className="text-xs">All values</span>
								{!groupFilter && <Check className="ml-2 h-3 w-3 text-t3" />}
							</DropdownMenuItem>
							{availableGroupValues.map((value) => (
								<DropdownMenuItem
									key={value}
									onClick={() => setGroupFilter(value)}
									className="flex items-center justify-between"
								>
									<span className="text-xs font-mono truncate max-w-[150px]">
										{value}
									</span>
									{groupFilter === value && (
										<Check className="ml-2 h-3 w-3 text-t3 shrink-0" />
									)}
								</DropdownMenuItem>
							))}
						</>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
