import { Checkbox, IconButton } from "@autumn/ui";
import {
	CaretDownIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
} from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
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

	const {
		groupFilter,
		setGroupFilter,
		planDeselected,
		setPlanDeselected,
		availableGroupValues,
		entityNames,
		customerNames,
		planNames,
	} = useAnalyticsContext();

	const togglePlanDeselected = (value: string) => {
		setPlanDeselected((prev: Set<string>) => {
			const next = new Set(prev);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return next;
		});
	};

	const activeDeselectedCount = availableGroupValues.reduce(
		(acc: number, v: string) => acc + (planDeselected?.has(v) ? 1 : 0),
		0,
	);
	const selectedPlanCount = availableGroupValues.length - activeDeselectedCount;
	const allPlansSelected = activeDeselectedCount === 0;
	const handlePlanSelectAll = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setPlanDeselected(new Set());
	};

	const currentGroupBy = searchParams.get("group_by") || "";
	const customerId = searchParams.get("customer_id");
	const showCustomerIdOption = !customerId;
	const maxGroups = Number(searchParams.get("max_groups")) || 10;

	const updateQueryParams = ({ groupBy }: { groupBy: string | null }) => {
		const params = new URLSearchParams(location.search);

		if (groupBy) {
			params.set("group_by", groupBy);
		} else {
			params.delete("group_by");
			params.delete("max_groups");
		}

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const updateMaxGroups = ({ value }: { value: number }) => {
		const clamped = Math.min(250, Math.max(1, value));
		const params = new URLSearchParams(location.search);
		params.set("max_groups", String(clamped));
		navigate(`${location.pathname}?${params.toString()}`);
	};

	const filteredOptions = propertyKeys.filter((key) =>
		key.toLowerCase().includes(searchValue.toLowerCase()),
	);

	const handleSelect = ({ property }: { property: string | null }) => {
		updateQueryParams({ groupBy: property });
		setOpen(false);
	};

	const [editingMaxGroups, setEditingMaxGroups] = useState(false);
	const [maxGroupsDraft, setMaxGroupsDraft] = useState(String(maxGroups));
	const maxGroupsInputRef = useRef<HTMLInputElement>(null);

	// Sync draft when maxGroups changes externally
	useEffect(() => {
		if (!editingMaxGroups) {
			setMaxGroupsDraft(String(maxGroups));
		}
	}, [maxGroups, editingMaxGroups]);

	// Focus input when entering edit mode
	useEffect(() => {
		if (editingMaxGroups) {
			maxGroupsInputRef.current?.focus();
			maxGroupsInputRef.current?.select();
		}
	}, [editingMaxGroups]);

	const commitMaxGroups = () => {
		const val = Number.parseInt(maxGroupsDraft, 10);
		if (!Number.isNaN(val) && val !== maxGroups) {
			updateMaxGroups({ value: val });
		} else {
			setMaxGroupsDraft(String(maxGroups));
		}
		setEditingMaxGroups(false);
	};

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
						? `Group: ${currentGroupBy === "customer_id" ? "Customer ID" : currentGroupBy === "entity_id" ? "Entity ID" : currentGroupBy === "plan_id" ? "Plan" : currentGroupBy}`
						: "Group By"}
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[200px]">
				{propertyKeys.length > 5 && (
					<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
						<MagnifyingGlassIcon className="size-4 text-subtle" />
						<input
							type="text"
							placeholder="Search properties..."
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							onKeyDown={(e) => e.stopPropagation()}
							className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
						/>
					</div>
				)}

				<div className="max-h-[300px] overflow-y-auto pt-1">
					<DropdownMenuItem
						closeOnClick={false}
						onClick={() => handleSelect({ property: null })}
						className="flex items-center justify-between"
					>
						<span className="text-xs">No grouping</span>
						{!currentGroupBy && (
							<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>

					{/* Special column options */}
					<DropdownMenuSeparator />
					{showCustomerIdOption && (
						<DropdownMenuItem
							closeOnClick={false}
							onClick={() => handleSelect({ property: "customer_id" })}
							className="flex items-center justify-between"
						>
							<span className="text-xs font-medium text-muted-foreground">
								Customer ID
							</span>
							{currentGroupBy === "customer_id" && (
								<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
							)}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						closeOnClick={false}
						onClick={() => handleSelect({ property: "entity_id" })}
						className="flex items-center justify-between"
					>
						<span className="text-xs font-medium text-muted-foreground">
							Entity ID
						</span>
						{currentGroupBy === "entity_id" && (
							<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleSelect({ property: "plan_id" })}
						className="flex items-center justify-between"
					>
						<span className="text-xs font-medium text-muted-foreground">
							Plan ID
						</span>
						{currentGroupBy === "plan_id" && (
							<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>

					{propertyKeys.length > 0 && <DropdownMenuSeparator />}

					{filteredOptions.length === 0 && propertyKeys.length > 0 && (
						<div className="py-4 text-center text-sm text-subtle">
							No properties found
						</div>
					)}

					{filteredOptions.map((property) => (
						<DropdownMenuItem
							key={property}
							closeOnClick={false}
							onClick={() => handleSelect({ property })}
							className="flex items-center justify-between"
						>
							<span className="text-xs font-mono">{property}</span>
							{currentGroupBy === property && (
								<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
							)}
						</DropdownMenuItem>
					))}

					{/* Max groups - only shown when a groupBy is selected */}
					{currentGroupBy && (
						<>
							<DropdownMenuSeparator />
							<div className="flex items-center justify-between px-2 py-1.5">
								<span className="text-xs text-tertiary-foreground">
									Max groups
								</span>
								{editingMaxGroups ? (
									<input
										ref={maxGroupsInputRef}
										type="number"
										value={maxGroupsDraft}
										min={1}
										max={250}
										onChange={(e) => setMaxGroupsDraft(e.target.value)}
										onBlur={commitMaxGroups}
										onKeyDown={(e) => {
											e.stopPropagation();
											if (e.key === "Enter") {
												commitMaxGroups();
											}
											if (e.key === "Escape") {
												setMaxGroupsDraft(String(maxGroups));
												setEditingMaxGroups(false);
											}
										}}
										className="w-12 text-center text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
								) : (
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setEditingMaxGroups(true);
										}}
										className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
									>
										{maxGroups}
										<PencilSimpleIcon size={10} className="text-subtle" />
									</button>
								)}
							</div>
						</>
					)}

					{currentGroupBy === "plan_id" && availableGroupValues.length > 0 && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
									<span className="text-xs">Filter plans</span>
									{!allPlansSelected && (
										<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
											{selectedPlanCount}
										</span>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-56 max-w-none w-max !overflow-x-visible">
									<div className="flex items-center justify-between px-2 h-6">
										<button
											type="button"
											onClick={handlePlanSelectAll}
											className={cn(
												"px-1 h-5 flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground bg-accent cursor-pointer rounded-md",
												allPlansSelected &&
													"bg-primary/10 text-primary hover:text-primary/80",
											)}
										>
											Select all
										</button>
									</div>
									<DropdownMenuSeparator />
									<div className="max-h-64 overflow-y-auto overflow-x-visible">
										{availableGroupValues.map((value: string) => {
											const displayValue =
												value === "AUTUMN_RESERVED"
													? "Other values"
													: value === ""
														? "No plan"
														: (planNames?.[value] ?? value);
											const isChecked = !planDeselected?.has(value);
											const wouldDeselectLast =
												isChecked && selectedPlanCount === 1;
											return (
												<DropdownMenuItem
													key={value}
													closeOnClick={false}
													disabled={wouldDeselectLast}
													onClick={(e) => {
														e.preventDefault();
														if (wouldDeselectLast) return;
														togglePlanDeselected(value);
													}}
													className="flex items-center gap-2 cursor-pointer"
												>
													<Checkbox
														checked={isChecked}
														className="border-border"
													/>
													<span className="text-xs whitespace-nowrap">
														{displayValue}
													</span>
												</DropdownMenuItem>
											);
										})}
									</div>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						</>
					)}

					{currentGroupBy &&
						currentGroupBy !== "plan_id" &&
						availableGroupValues.length > 0 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel className="text-xs text-subtle font-normal">
										Filter by value
									</DropdownMenuLabel>
									<DropdownMenuItem
										closeOnClick={false}
										onClick={() => setGroupFilter(null)}
										className="flex items-center justify-between"
									>
										<span className="text-xs">All values</span>
										{groupFilter === null && (
											<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
										)}
									</DropdownMenuItem>
									{availableGroupValues.map((value: string) => {
										const displayValue =
											value === "AUTUMN_RESERVED"
												? "Other values"
												: currentGroupBy === "entity_id"
													? (entityNames?.[value] ?? value)
													: currentGroupBy === "customer_id"
														? (customerNames?.[value] ?? value)
														: value;
										return (
											<DropdownMenuItem
												key={value}
												closeOnClick={false}
												onClick={() => setGroupFilter(value)}
												className="flex items-center justify-between"
											>
												<span className="text-xs font-mono truncate max-w-[150px]">
													{displayValue}
												</span>
												{groupFilter === value && (
													<Check className="ml-2 h-3 w-3 text-tertiary-foreground shrink-0" />
												)}
											</DropdownMenuItem>
										);
									})}
								</DropdownMenuGroup>
							</>
						)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
