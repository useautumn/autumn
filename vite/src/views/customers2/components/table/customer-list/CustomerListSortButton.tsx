import {
	type CustomerListSortBy,
	type FeatureBalanceSortBasis,
	FeatureBalanceSortBasisSchema,
	FeatureType,
	type SortOrder,
} from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	IconButton,
	RadioGroup,
	RadioGroupItem,
} from "@autumn/ui";
import {
	ArrowsDownUpIcon,
	SortAscendingIcon,
	SortDescendingIcon,
} from "@phosphor-icons/react";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

const SORT_FIELDS: { value: CustomerListSortBy; label: string }[] = [
	{ value: "created_at", label: "Created at" },
	{ value: "base_price", label: "Base price" },
];

const SORT_ORDERS: {
	value: SortOrder;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		value: "asc",
		label: "Ascending",
		icon: <SortAscendingIcon size={14} className="text-tertiary-foreground" />,
	},
	{
		value: "desc",
		label: "Descending",
		icon: <SortDescendingIcon size={14} className="text-tertiary-foreground" />,
	},
];

function SortOrderItems({
	isActive,
	activeOrder,
	onSelect,
}: {
	isActive: boolean;
	activeOrder: SortOrder;
	onSelect: (order: SortOrder) => void;
}) {
	return (
		<>
			{SORT_ORDERS.map((order) => (
				<DropdownMenuItem
					key={order.value}
					onClick={() => onSelect(order.value)}
					className="flex items-center gap-2 cursor-pointer text-sm"
				>
					{order.icon}
					{order.label}
					{isActive && activeOrder === order.value && (
						<Check size={12} className="ml-auto text-primary" />
					)}
				</DropdownMenuItem>
			))}
		</>
	);
}

const BASIS_LABELS: Record<FeatureBalanceSortBasis, string> = {
	granted: "Granted",
	remaining: "Remaining",
	usage: "Usage",
};

function FeaturesSortSubMenu({
	onSelect,
}: {
	onSelect: (featureId: string, order: SortOrder) => void;
}) {
	const { queryStates, setFilters, setQueryStates } = useCustomerFilters();
	const { features } = useFeaturesQuery();
	const balanceFeatures = (features ?? []).filter(
		(feature) =>
			feature.type === FeatureType.Metered ||
			feature.type === FeatureType.CreditSystem,
	);
	if (balanceFeatures.length === 0) return null;

	const isFeatureBalanceActive = queryStates.sortBy === "feature_balance";

	// Basis only reorders results when a feature sort is live; otherwise store
	// it silently so the change doesn't reset the cursor or refetch.
	const applyBasis = (basis: FeatureBalanceSortBasis) => {
		if (isFeatureBalanceActive && queryStates.sortFeature !== "") {
			setFilters({ sortBasis: basis });
		} else {
			setQueryStates({ sortBasis: basis });
		}
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Features
				{isFeatureBalanceActive && <Check size={12} className="text-primary" />}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
				{balanceFeatures.map((feature) => (
					<DropdownMenuSub key={feature.id}>
						<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
							<span className="truncate max-w-40">{feature.name}</span>
							{isFeatureBalanceActive &&
								queryStates.sortFeature === feature.id && (
									<Check size={12} className="text-primary" />
								)}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<SortOrderItems
								isActive={
									isFeatureBalanceActive &&
									queryStates.sortFeature === feature.id
								}
								activeOrder={queryStates.sort}
								onSelect={(order) => onSelect(feature.id, order)}
							/>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
						<span className="flex-1">Basis</span>
						<span className="text-xs text-tertiary-foreground">
							{BASIS_LABELS[queryStates.sortBasis]}
						</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<RadioGroup value={queryStates.sortBasis} className="gap-0">
							{FeatureBalanceSortBasisSchema.options.map((basis) => (
								<DropdownMenuItem
									key={basis}
									closeOnClick={false}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										applyBasis(basis);
									}}
									// The RadioGroup wrapper blocks base-ui's focus-on-hover, so
									// mirror the menu-item highlight with plain CSS hover.
									className="flex items-center gap-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground"
								>
									<RadioGroupItem value={basis} />
									{BASIS_LABELS[basis]}
								</DropdownMenuItem>
							))}
						</RadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<div className="px-2 py-1.5 text-[11px] leading-snug text-tertiary-foreground max-w-48">
					Order may be approximate while balances update; values shown are live.
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function SortFieldSubMenu({
	field,
	onSelect,
}: {
	field: { value: CustomerListSortBy; label: string };
	onSelect: (order: SortOrder) => void;
}) {
	const { queryStates } = useCustomerFilters();
	const isActiveField = queryStates.sortBy === field.value;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				{field.label}
				{isActiveField && <Check size={12} className="text-primary" />}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<SortOrderItems
					isActive={isActiveField}
					activeOrder={queryStates.sort}
					onSelect={onSelect}
				/>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function CustomerListSortButton() {
	const { queryStates, setFilters } = useCustomerFilters();
	const [open, setOpen] = useState(false);

	// Anything other than the default created_at desc counts as an active sort.
	const hasActiveSort =
		queryStates.sortBy !== "created_at" || queryStates.sort !== "desc";

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={<div className="relative" />}
				nativeButton={false}
			>
				<IconButton
					variant="secondary"
					aria-label="Sort"
					className={cn(open && "btn-secondary-active")}
					icon={
						<ArrowsDownUpIcon size={14} className="text-tertiary-foreground" />
					}
				/>
				{hasActiveSort && (
					<span className="absolute top-0 right-0 h-2.5 w-2.5 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary" />
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-44 font-regular gap-0 p-0"
				align="start"
			>
				<DropdownMenuGroup className="p-1">
					{SORT_FIELDS.map((field) => (
						<SortFieldSubMenu
							key={field.value}
							field={field}
							onSelect={(order) => {
								setFilters({
									sortBy: field.value,
									sort: order,
									sortFeature: "",
									sortBasis: "remaining",
								});
								setOpen(false);
							}}
						/>
					))}
					<FeaturesSortSubMenu
						onSelect={(featureId, order) => {
							setFilters({
								sortBy: "feature_balance",
								sortFeature: featureId,
								sort: order,
							});
							setOpen(false);
						}}
					/>
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				<button
					type="button"
					onClick={() => {
						setFilters({
							sortBy: "created_at",
							sort: "desc",
							sortFeature: "",
							sortBasis: "remaining",
						});
						setOpen(false);
					}}
					className="w-full flex items-center justify-center gap-1.5 rounded-b-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
				>
					<X size={10} />
					Clear
				</button>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
