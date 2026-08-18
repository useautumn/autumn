import {
	type BalanceFilterOp,
	BalanceFilterOpSchema,
	type FeatureBalanceSortBasis,
	FeatureBalanceSortBasisSchema,
	FeatureType,
} from "@autumn/shared";
import {
	Checkbox,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	Input,
	RadioGroup,
	RadioGroupItem,
} from "@autumn/ui";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import {
	hasActiveBalanceFilter,
	useCustomerFilters,
} from "../../hooks/useCustomerFilters";

const ACTION_BUTTON_CLASS =
	"flex-1 rounded-md px-2 py-1 text-xs text-tertiary-foreground hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40";
const ACTION_BUTTON_ACTIVE_CLASS = "bg-accent text-foreground";

const OP_LABELS: Record<BalanceFilterOp, string> = {
	">": "Greater than",
	"<": "Less than",
};

const BASIS_LABELS: Record<FeatureBalanceSortBasis, string> = {
	granted: "Granted",
	remaining: "Remaining",
	usage: "Usage",
};

export const BalanceFilterSubMenu = ({
	onChange,
}: {
	onChange?: () => void;
}) => {
	const { queryStates, setFilters, setQueryStates } = useCustomerFilters();
	const { features } = useFeaturesQuery();
	const [draftValue, setDraftValue] = useState(queryStates.balanceValue);

	// setFilters resets pagination and (via query keys) refetches — only pay
	// that when the change affects results; incomplete-filter edits are silent.
	const applyBalancePatch = (patch: Partial<typeof queryStates>) => {
		const affectsResults =
			hasActiveBalanceFilter(queryStates) ||
			hasActiveBalanceFilter({ ...queryStates, ...patch });
		if (affectsResults) {
			setFilters(patch);
			onChange?.();
		} else {
			setQueryStates(patch);
		}
	};

	const balanceFeatures = (features ?? []).filter(
		(feature) =>
			feature.type === FeatureType.Metered ||
			feature.type === FeatureType.CreditSystem,
	);
	if (balanceFeatures.length === 0) return null;

	const isActive = hasActiveBalanceFilter(queryStates);
	const selectedFeature = balanceFeatures.find(
		(feature) => feature.id === queryStates.balanceFeature,
	);
	const label = isActive
		? `${BASIS_LABELS[queryStates.balanceBasis]} ${selectedFeature?.name ?? queryStates.balanceFeature} ${queryStates.balanceOp} ${queryStates.balanceValue}`
		: null;

	const commitValue = (raw: string) => {
		applyBalancePatch({ balanceValue: raw.trim() });
	};

	const clearBalanceFilter = () => {
		setDraftValue("");
		applyBalancePatch({
			balanceFeature: "",
			balanceOp: ">",
			balanceValue: "",
			balanceBasis: "remaining",
		});
	};

	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open) setDraftValue(queryStates.balanceValue);
			}}
		>
			<DropdownMenuSubTrigger
				className="flex items-center gap-2 cursor-pointer"
				aria-label={label ? `Balance: ${label}` : "Balance"}
			>
				<span className="min-w-0 truncate">{label ?? "Balance"}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-52">
				<div className="max-h-56 overflow-y-auto">
					{balanceFeatures.map((feature) => (
						<DropdownMenuItem
							key={feature.id}
							closeOnClick={false}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								applyBalancePatch({
									balanceFeature:
										queryStates.balanceFeature === feature.id ? "" : feature.id,
								});
							}}
							className="flex items-center gap-2 cursor-pointer text-sm"
						>
							<Checkbox
								checked={queryStates.balanceFeature === feature.id}
								className="border-border"
							/>
							<span className="truncate">{feature.name}</span>
						</DropdownMenuItem>
					))}
				</div>
				<DropdownMenuSeparator />
				<RadioGroup value={queryStates.balanceBasis} className="gap-0">
					{FeatureBalanceSortBasisSchema.options.map((basis) => (
						<DropdownMenuItem
							key={basis}
							closeOnClick={false}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								applyBalancePatch({ balanceBasis: basis });
							}}
							className="flex items-center gap-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground"
						>
							<RadioGroupItem value={basis} />
							{BASIS_LABELS[basis]}
						</DropdownMenuItem>
					))}
				</RadioGroup>
				<DropdownMenuSeparator />
				<div className="flex items-center gap-1 p-1">
					{BalanceFilterOpSchema.options.map((op) => (
						<button
							key={op}
							type="button"
							className={cn(
								ACTION_BUTTON_CLASS,
								queryStates.balanceOp === op && ACTION_BUTTON_ACTIVE_CLASS,
							)}
							aria-pressed={queryStates.balanceOp === op}
							onClick={() => {
								applyBalancePatch({ balanceOp: op });
							}}
						>
							{OP_LABELS[op]}
						</button>
					))}
				</div>
				<div className="p-1 pt-0">
					<Input
						type="text"
						placeholder="Amount (e.g. 10k, 1.5M)"
						value={draftValue}
						onChange={(e) => setDraftValue(e.target.value)}
						onBlur={() => commitValue(draftValue)}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitValue(draftValue);
							e.stopPropagation();
						}}
						className="h-7 text-sm"
					/>
				</div>
				<div className="flex items-center p-1 pt-0">
					<button
						type="button"
						className={ACTION_BUTTON_CLASS}
						disabled={!isActive && queryStates.balanceFeature === ""}
						onClick={clearBalanceFilter}
					>
						Clear
					</button>
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
